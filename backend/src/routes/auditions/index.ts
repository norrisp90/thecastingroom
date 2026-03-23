import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { ActorService } from "../../services/actor.service.js";
import { RoleService } from "../../services/role.service.js";
import { WorldService } from "../../services/world.service.js";
import { compileSystemPrompt } from "../../services/prompt.service.js";
import { chatCompletion, chatCompletionStream, connectToRealtimeWs } from "../../services/openai.service.js";
import type { AuditionSession, ConversationTurn } from "../../types/index.js";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "../../plugins/auth.js";
import WebSocket from "ws";

const createAuditionSchema = z.object({
  actorId: z.string().uuid(),
  roleId: z.string().uuid().optional(),
  sceneSetup: z.string().max(5000).default(""),
  model: z.string().default("gpt-41-mini"),
  mode: z.enum(["chat", "voice"]).default("chat"),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

const rateTurnSchema = z.object({
  rating: z.object({
    believability: z.number().min(1).max(5).optional(),
    consistency: z.number().min(1).max(5).optional(),
    emotionalDepth: z.number().min(1).max(5).optional(),
    voiceAccuracy: z.number().min(1).max(5).optional(),
  }).optional(),
  flaggedOutOfCharacter: z.boolean().optional(),
});

export async function auditionRoutes(fastify: FastifyInstance) {
  const actorService = new ActorService(fastify.cosmos);
  const roleService = new RoleService(fastify.cosmos);
  const worldService = new WorldService(fastify.cosmos);

  fastify.addHook("preHandler", fastify.authenticate);

  // Helper to get effective role (admin bypass)
  async function getEffectiveRole(userId: string, userRole: string, worldId: string) {
    const role = await worldService.getUserRole(userId, worldId);
    if (!role && userRole === "admin") return "owner";
    return role;
  }

  // Create audition session
  fastify.post<{ Params: { worldId: string } }>("/:worldId/auditions", async (request, reply) => {
    const { worldId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role || role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot run auditions" });
    }

    const result = createAuditionSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    const actor = await actorService.getById(worldId, result.data.actorId);
    if (!actor) {
      return reply.status(404).send({ error: "Actor not found" });
    }

    // Load role if roleId provided
    let loadedRole = undefined;
    if (result.data.roleId) {
      loadedRole = await roleService.getById(worldId, result.data.roleId) ?? undefined;
      if (!loadedRole) {
        return reply.status(404).send({ error: "Role not found" });
      }
    }
    const systemPrompt = compileSystemPrompt(actor, loadedRole, result.data.sceneSetup || undefined);

    const now = new Date().toISOString();
    const session: AuditionSession = {
      id: crypto.randomUUID(),
      worldId,
      actorId: result.data.actorId,
      roleId: result.data.roleId,
      sceneSetup: result.data.sceneSetup,
      compiledSystemPrompt: systemPrompt,
      model: result.data.mode === "voice" ? "gpt-realtime-mini" : result.data.model,
      mode: result.data.mode,
      turns: [],
      createdBy: request.user!.userId,
      createdAt: now,
      updatedAt: now,
    };

    await fastify.cosmos.container("AuditionSessions").items.create(session);
    return reply.status(201).send(session);
  });

  // List auditions in world
  fastify.get<{ Params: { worldId: string } }>("/:worldId/auditions", async (request, reply) => {
    const { worldId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role) {
      return reply.status(403).send({ error: "Access denied" });
    }

    const { resources } = await fastify.cosmos.container("AuditionSessions").items
      .query({
        query: "SELECT c.id, c.actorId, c.roleId, c.model, c.createdAt, c.updatedAt, ARRAY_LENGTH(c.turns) AS turnCount FROM c WHERE c.worldId = @worldId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@worldId", value: worldId }],
      })
      .fetchAll();

    return resources;
  });

  // Get audition session
  fastify.get<{ Params: { worldId: string; sessionId: string } }>("/:worldId/auditions/:sessionId", async (request, reply) => {
    const { worldId, sessionId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role) {
      return reply.status(403).send({ error: "Access denied" });
    }

    try {
      const { resource } = await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).read<AuditionSession>();
      if (!resource) {
        return reply.status(404).send({ error: "Session not found" });
      }
      return resource;
    } catch {
      return reply.status(404).send({ error: "Session not found" });
    }
  });

  // WebSocket relay for voice auditions
  // Browser connects here; backend opens a WS to Azure OpenAI and relays messages.
  // Auth via query param since browser WebSocket API can't set headers.
  fastify.get<{ Params: { worldId: string; sessionId: string } }>(
    "/:worldId/auditions/:sessionId/realtime-ws",
    { websocket: true },
    async (socket, request) => {
      const { worldId, sessionId } = request.params;

      // Auth: verify JWT from query param
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get("token");
      if (!token) {
        socket.close(4001, "Missing auth token");
        return;
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        socket.close(4001, "Server misconfigured");
        return;
      }

      let userId: string;
      let userRole: string;
      try {
        const payload = jwt.verify(token, secret) as JwtPayload;
        userId = payload.userId;
        userRole = payload.role;
      } catch {
        socket.close(4001, "Invalid auth token");
        return;
      }

      // Check permissions
      const role = await getEffectiveRole(userId, userRole, worldId);
      if (!role || role === "viewer") {
        socket.close(4003, "Access denied");
        return;
      }

      // Load session
      let session: AuditionSession;
      try {
        const { resource } = await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).read<AuditionSession>();
        if (!resource || resource.mode !== "voice") {
          socket.close(4004, "Session not found or not voice mode");
          return;
        }
        session = resource;
      } catch {
        socket.close(4004, "Session not found");
        return;
      }

      // Connect to Azure OpenAI Realtime API
      let azureWs: WebSocket;
      try {
        azureWs = connectToRealtimeWs(session.model, "ash", session.compiledSystemPrompt);
      } catch (err) {
        request.log.error({ err }, "Failed to connect to Azure Realtime WS");
        socket.close(4502, "Azure connection failed");
        return;
      }

      // Relay: browser → Azure
      socket.on("message", (data) => {
        if (azureWs.readyState === WebSocket.OPEN) {
          azureWs.send(typeof data === "string" ? data : data.toString());
        }
      });

      // Relay: Azure → browser
      azureWs.on("message", (data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(typeof data === "string" ? data : data.toString());
        }
      });

      // Handle close
      socket.on("close", () => {
        azureWs.close();
      });

      azureWs.on("close", () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1000, "Azure connection closed");
        }
      });

      azureWs.on("error", (err) => {
        request.log.error({ err }, "Azure Realtime WS error");
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1011, "Azure connection error");
        }
      });

      socket.on("error", (err) => {
        request.log.error({ err }, "Client WS error");
        azureWs.close();
      });
    }
  );

  // Save transcript turns from a voice audition
  const transcriptSchema = z.object({
    turns: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      timestamp: z.string(),
    })),
  });

  fastify.post<{ Params: { worldId: string; sessionId: string } }>("/:worldId/auditions/:sessionId/transcript", async (request, reply) => {
    const { worldId, sessionId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role || role === "viewer") {
      return reply.status(403).send({ error: "Access denied" });
    }

    const result = transcriptSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    let session: AuditionSession;
    try {
      const { resource } = await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).read<AuditionSession>();
      if (!resource) {
        return reply.status(404).send({ error: "Session not found" });
      }
      session = resource;
    } catch {
      return reply.status(404).send({ error: "Session not found" });
    }

    session.turns.push(...result.data.turns.map(t => ({
      role: t.role,
      content: t.content,
      timestamp: t.timestamp,
    })));
    session.updatedAt = new Date().toISOString();
    await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).replace(session);

    return { saved: result.data.turns.length };
  });

  // Send message in audition (non-streaming for MVP)
  fastify.post<{ Params: { worldId: string; sessionId: string } }>("/:worldId/auditions/:sessionId/message", async (request, reply) => {
    const { worldId, sessionId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role || role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot send messages" });
    }

    const result = sendMessageSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    // Load session
    let session: AuditionSession;
    try {
      const { resource } = await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).read<AuditionSession>();
      if (!resource) {
        return reply.status(404).send({ error: "Session not found" });
      }
      session = resource;
    } catch {
      return reply.status(404).send({ error: "Session not found" });
    }

    // Build message history for API call
    const apiMessages = session.turns.map((t) => ({
      role: t.role as "user" | "assistant",
      content: t.content,
    }));
    apiMessages.push({ role: "user", content: result.data.content });

    // Call Azure OpenAI
    const assistantContent = await chatCompletion(
      session.compiledSystemPrompt,
      apiMessages,
      session.model
    );

    // Append both turns
    const now = new Date().toISOString();
    const userTurn: ConversationTurn = {
      role: "user",
      content: result.data.content,
      timestamp: now,
    };
    const assistantTurn: ConversationTurn = {
      role: "assistant",
      content: assistantContent,
      timestamp: new Date().toISOString(),
    };

    session.turns.push(userTurn, assistantTurn);
    session.updatedAt = new Date().toISOString();

    await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).replace(session);

    return {
      userMessage: userTurn,
      assistantMessage: assistantTurn,
    };
  });

  // Send message with streaming response (SSE)
  fastify.post<{ Params: { worldId: string; sessionId: string } }>("/:worldId/auditions/:sessionId/stream", async (request, reply) => {
    const { worldId, sessionId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role || role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot send messages" });
    }

    const result = sendMessageSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    let session: AuditionSession;
    try {
      const { resource } = await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).read<AuditionSession>();
      if (!resource) {
        return reply.status(404).send({ error: "Session not found" });
      }
      session = resource;
    } catch {
      return reply.status(404).send({ error: "Session not found" });
    }

    const apiMessages = session.turns.map((t) => ({
      role: t.role as "user" | "assistant",
      content: t.content,
    }));
    apiMessages.push({ role: "user", content: result.data.content });

    // Build CORS headers for the raw SSE response (reply.raw.writeHead bypasses
    // Fastify's response pipeline, so @fastify/cors headers are not included automatically)
    const origin = request.headers.origin;
    const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3000").split(",").map(s => s.trim());
    const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    // Tell Fastify we are handling the response ourselves (prevents double-send)
    reply.hijack();

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Credentials": "true",
    });

    let fullContent = "";

    try {
      for await (const chunk of chatCompletionStream(session.compiledSystemPrompt, apiMessages, session.model)) {
        fullContent += chunk;
        reply.raw.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      request.log.error({ err }, "OpenAI stream failed");
      reply.raw.write(`data: ${JSON.stringify({ error: `Stream failed: ${errMsg}` })}\n\n`);
      reply.raw.end();
      return;
    }

    // Persist both turns
    const now = new Date().toISOString();
    const userTurn: ConversationTurn = { role: "user", content: result.data.content, timestamp: now };
    const assistantTurn: ConversationTurn = { role: "assistant", content: fullContent, timestamp: new Date().toISOString() };

    session.turns.push(userTurn, assistantTurn);
    session.updatedAt = new Date().toISOString();
    await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).replace(session);

    reply.raw.write(`data: ${JSON.stringify({ done: true, userMessage: userTurn, assistantMessage: assistantTurn })}\n\n`);
    reply.raw.end();
  });

  // Rate or flag a turn
  fastify.patch<{ Params: { worldId: string; sessionId: string; turnIndex: string } }>("/:worldId/auditions/:sessionId/turns/:turnIndex", async (request, reply) => {
    const { worldId, sessionId, turnIndex: turnIndexStr } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role || role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot rate turns" });
    }

    const turnIndex = parseInt(turnIndexStr, 10);
    if (isNaN(turnIndex) || turnIndex < 0) {
      return reply.status(400).send({ error: "Invalid turn index" });
    }

    const result = rateTurnSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    let session: AuditionSession;
    try {
      const { resource } = await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).read<AuditionSession>();
      if (!resource) {
        return reply.status(404).send({ error: "Session not found" });
      }
      session = resource;
    } catch {
      return reply.status(404).send({ error: "Session not found" });
    }

    if (turnIndex >= session.turns.length) {
      return reply.status(400).send({ error: "Turn index out of range" });
    }

    if (result.data.rating !== undefined) {
      session.turns[turnIndex].rating = {
        ...session.turns[turnIndex].rating,
        ...result.data.rating,
      };
    }
    if (result.data.flaggedOutOfCharacter !== undefined) {
      session.turns[turnIndex].flaggedOutOfCharacter = result.data.flaggedOutOfCharacter;
    }

    session.updatedAt = new Date().toISOString();
    await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).replace(session);

    return session.turns[turnIndex];
  });

  // Reset audition — clear chat history and recompile system prompt from latest actor/role data
  fastify.post<{ Params: { worldId: string; sessionId: string } }>("/:worldId/auditions/:sessionId/reset", async (request, reply) => {
    const { worldId, sessionId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role || role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot reset auditions" });
    }

    let session: AuditionSession;
    try {
      const { resource } = await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).read<AuditionSession>();
      if (!resource) {
        return reply.status(404).send({ error: "Session not found" });
      }
      session = resource;
    } catch {
      return reply.status(404).send({ error: "Session not found" });
    }

    // Re-fetch actor with latest data
    const actor = await actorService.getById(worldId, session.actorId);
    if (!actor) {
      return reply.status(404).send({ error: "Actor has been deleted — cannot reset this audition" });
    }

    // Re-fetch role if one was set (if deleted, proceed without it)
    let loadedRole = undefined;
    if (session.roleId) {
      loadedRole = await roleService.getById(worldId, session.roleId) ?? undefined;
      if (!loadedRole) {
        session.roleId = undefined;
      }
    }

    // Recompile prompt with latest actor/role data
    session.compiledSystemPrompt = compileSystemPrompt(actor, loadedRole, session.sceneSetup || undefined);
    session.turns = [];
    session.updatedAt = new Date().toISOString();

    await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).replace(session);
    return session;
  });

  // Delete audition session
  fastify.delete<{ Params: { worldId: string; sessionId: string } }>("/:worldId/auditions/:sessionId", async (request, reply) => {
    const { worldId, sessionId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role || role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot delete auditions" });
    }

    try {
      await fastify.cosmos.container("AuditionSessions").item(sessionId, worldId).delete();
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: "Session not found" });
    }
  });
}
