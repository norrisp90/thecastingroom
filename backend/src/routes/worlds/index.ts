import { FastifyInstance } from "fastify";
import { z } from "zod";
import { WorldService } from "../../services/world.service.js";

const createWorldSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(10000).default(""),
  genre: z.string().max(100).default(""),
  defaultModel: z.string().default("gpt-41-mini"),
  toneGuidelines: z.string().max(10000).default(""),
});

const updateWorldSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  genre: z.string().max(100).optional(),
  defaultModel: z.string().optional(),
  toneGuidelines: z.string().max(10000).optional(),
});

const inviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["editor", "viewer"]),
});

const updatePermissionSchema = z.object({
  role: z.enum(["editor", "viewer"]),
});

export async function worldRoutes(fastify: FastifyInstance) {
  const worldService = new WorldService(fastify.cosmos);

  // All world routes require authentication
  fastify.addHook("preHandler", fastify.authenticate);

  // Create world
  fastify.post("/", async (request, reply) => {
    const result = createWorldSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    const world = await worldService.create(result.data, request.user!.userId);
    return reply.status(201).send(world);
  });

  // List user's worlds
  fastify.get("/", async (request) => {
    return worldService.listForUser(request.user!.userId);
  });

  // Get world by ID
  fastify.get<{ Params: { worldId: string } }>("/:worldId", async (request, reply) => {
    const { worldId } = request.params;

    // Admin users can access any world
    let role = await worldService.getUserRole(request.user!.userId, worldId);
    if (!role && request.user!.role === "admin") {
      role = "owner";
    }
    if (!role) {
      return reply.status(403).send({ error: "Access denied" });
    }

    const world = await worldService.getById(worldId);
    if (!world) {
      return reply.status(404).send({ error: "World not found" });
    }

    return { ...world, userRole: role };
  });

  // Update world
  fastify.put<{ Params: { worldId: string } }>("/:worldId", async (request, reply) => {
    const { worldId } = request.params;

    let role = await worldService.getUserRole(request.user!.userId, worldId);
    if (!role && request.user!.role === "admin") role = "owner";
    if (!role || role === "viewer") {
      return reply.status(403).send({ error: "Only owners and editors can update worlds" });
    }

    const result = updateWorldSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    const updated = await worldService.update(worldId, result.data);
    if (!updated) {
      return reply.status(404).send({ error: "World not found" });
    }

    return updated;
  });

  // Delete world (owner only)
  fastify.delete<{ Params: { worldId: string } }>("/:worldId", async (request, reply) => {
    const { worldId } = request.params;

    let role = await worldService.getUserRole(request.user!.userId, worldId);
    if (!role && request.user!.role === "admin") role = "owner";
    if (role !== "owner") {
      return reply.status(403).send({ error: "Only owners can delete worlds" });
    }

    const deleted = await worldService.delete(worldId);
    if (!deleted) {
      return reply.status(404).send({ error: "World not found" });
    }

    return { success: true };
  });

  // List world members/permissions (owner only)
  fastify.get<{ Params: { worldId: string } }>("/:worldId/permissions", async (request, reply) => {
    const { worldId } = request.params;
    let role = await worldService.getUserRole(request.user!.userId, worldId);
    if (!role && request.user!.role === "admin") role = "owner";
    if (role !== "owner") {
      return reply.status(403).send({ error: "Only owners can view permissions" });
    }

    const permissions = await worldService.listPermissions(worldId);
    return permissions;
  });

  // Invite user to world (owner only)
  fastify.post<{ Params: { worldId: string } }>("/:worldId/permissions", async (request, reply) => {
    const { worldId } = request.params;
    let role = await worldService.getUserRole(request.user!.userId, worldId);
    if (!role && request.user!.role === "admin") role = "owner";
    if (role !== "owner") {
      return reply.status(403).send({ error: "Only owners can invite users" });
    }

    const result = inviteSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    const targetUser = await worldService.findUserByEmail(result.data.email);
    if (!targetUser) {
      return reply.status(404).send({ error: "No user found with that email" });
    }

    // Check if already a member
    const existingRole = await worldService.getUserRole(targetUser.id, worldId);
    if (existingRole) {
      return reply.status(409).send({ error: "User is already a member of this world" });
    }

    const permission = await worldService.addPermission(worldId, targetUser.id, result.data.role, request.user!.userId);
    return reply.status(201).send({ ...permission, email: targetUser.email, displayName: targetUser.displayName });
  });

  // Update member role (owner only, cannot change owner)
  fastify.put<{ Params: { worldId: string; permissionId: string } }>("/:worldId/permissions/:permissionId", async (request, reply) => {
    const { worldId, permissionId } = request.params;
    let role = await worldService.getUserRole(request.user!.userId, worldId);
    if (!role && request.user!.role === "admin") role = "owner";
    if (role !== "owner") {
      return reply.status(403).send({ error: "Only owners can change roles" });
    }

    const result = updatePermissionSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    // Find the permission to verify it's not the owner
    const permissions = await worldService.listPermissions(worldId);
    const target = permissions.find((p) => p.id === permissionId);
    if (!target) {
      return reply.status(404).send({ error: "Permission not found" });
    }
    if (target.role === "owner") {
      return reply.status(403).send({ error: "Cannot change the owner's role" });
    }

    const updated = await worldService.updatePermission(permissionId, target.userId, result.data.role);
    if (!updated) {
      return reply.status(404).send({ error: "Permission not found" });
    }

    return { success: true };
  });

  // Remove member from world (owner only, cannot remove self)
  fastify.delete<{ Params: { worldId: string; permissionId: string } }>("/:worldId/permissions/:permissionId", async (request, reply) => {
    const { worldId, permissionId } = request.params;
    let role = await worldService.getUserRole(request.user!.userId, worldId);
    if (!role && request.user!.role === "admin") role = "owner";
    if (role !== "owner") {
      return reply.status(403).send({ error: "Only owners can remove members" });
    }

    const permissions = await worldService.listPermissions(worldId);
    const target = permissions.find((p) => p.id === permissionId);
    if (!target) {
      return reply.status(404).send({ error: "Permission not found" });
    }
    if (target.role === "owner") {
      return reply.status(403).send({ error: "Cannot remove the owner" });
    }

    const removed = await worldService.removePermission(permissionId, target.userId);
    if (!removed) {
      return reply.status(404).send({ error: "Permission not found" });
    }

    return { success: true };
  });
}
