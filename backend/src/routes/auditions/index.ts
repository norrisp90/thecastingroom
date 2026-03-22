import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { ActorService } from "../../services/actor.service.js";
import { WorldService } from "../../services/world.service.js";
import { compileSystemPrompt } from "../../services/prompt.service.js";
import { chatCompletion } from "../../services/openai.service.js";
import type { AuditionSession, ConversationTurn } from "../../types/index.js";

const createAuditionSchema = z.object({
  actorId: z.string().uuid(),
  roleId: z.string().uuid().optional(),
  sceneSetup: z.string().max(5000).default(""),
  model: z.string().default("gpt-41-mini"),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

export async function auditionRoutes(fastify: FastifyInstance) {
  const actorService = new ActorService(fastify.cosmos);
  const worldService = new WorldService(fastify.cosmos);

  fastify.addHook("preHandler", fastify.authenticate);

  // Create audition session
  fastify.post<{ Params: { worldId: string } }>("/:worldId/auditions", async (request, reply) => {
    const { worldId } = request.params;
    const role = await worldService.getUserRole(request.user!.userId, worldId);
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

    // TODO: Load role if roleId provided (Phase 2)
    const systemPrompt = compileSystemPrompt(actor, undefined, result.data.sceneSetup || undefined);

    const now = new Date().toISOString();
    const session: AuditionSession = {
      id: crypto.randomUUID(),
      worldId,
      actorId: result.data.actorId,
      roleId: result.data.roleId,
      sceneSetup: result.data.sceneSetup,
      compiledSystemPrompt: systemPrompt,
      model: result.data.model,
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
    const role = await worldService.getUserRole(request.user!.userId, worldId);
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
    const role = await worldService.getUserRole(request.user!.userId, worldId);
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

  // Send message in audition (non-streaming for MVP)
  fastify.post<{ Params: { worldId: string; sessionId: string } }>("/:worldId/auditions/:sessionId/message", async (request, reply) => {
    const { worldId, sessionId } = request.params;
    const role = await worldService.getUserRole(request.user!.userId, worldId);
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
}
