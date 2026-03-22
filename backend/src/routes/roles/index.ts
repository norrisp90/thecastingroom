import { FastifyInstance } from "fastify";
import { z } from "zod";
import { RoleService } from "../../services/role.service.js";
import { WorldService } from "../../services/world.service.js";

const createRoleSchema = z.object({
  name: z.string().min(1).max(200),
  contextAndSituation: z.string().max(5000).default(""),
  positionAndTitle: z.string().max(500).default(""),
  sceneObjectives: z.string().max(2000).default(""),
  obstacles: z.string().max(2000).default(""),
  relationshipsMap: z.string().max(2000).default(""),
  knowledgeAndExpertise: z.string().max(2000).default(""),
  behavioralConstraints: z.string().max(2000).default(""),
  toneAndRegisterOverride: z.string().max(2000).default(""),
  adaptationNotes: z.string().max(2000).default(""),
});

export async function roleRoutes(fastify: FastifyInstance) {
  const roleService = new RoleService(fastify.cosmos);
  const worldService = new WorldService(fastify.cosmos);

  fastify.addHook("preHandler", fastify.authenticate);

  async function getEffectiveRole(userId: string, userRole: string, worldId: string) {
    const role = await worldService.getUserRole(userId, worldId);
    if (!role && userRole === "admin") return "owner";
    return role;
  }

  // Create role
  fastify.post<{ Params: { worldId: string } }>("/:worldId/roles", async (request, reply) => {
    const { worldId } = request.params;
    const perm = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!perm || perm === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot create roles" });
    }

    const result = createRoleSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    const role = await roleService.create(worldId, result.data, request.user!.userId);
    return reply.status(201).send(role);
  });

  // List roles in world
  fastify.get<{ Params: { worldId: string } }>("/:worldId/roles", async (request, reply) => {
    const { worldId } = request.params;
    const perm = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!perm) {
      return reply.status(403).send({ error: "Access denied" });
    }

    return roleService.listByWorld(worldId);
  });

  // Get role by ID
  fastify.get<{ Params: { worldId: string; roleId: string } }>("/:worldId/roles/:roleId", async (request, reply) => {
    const { worldId, roleId } = request.params;
    const perm = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!perm) {
      return reply.status(403).send({ error: "Access denied" });
    }

    const role = await roleService.getById(worldId, roleId);
    if (!role) {
      return reply.status(404).send({ error: "Role not found" });
    }

    return role;
  });

  // Update role
  fastify.put<{ Params: { worldId: string; roleId: string } }>("/:worldId/roles/:roleId", async (request, reply) => {
    const { worldId, roleId } = request.params;
    const perm = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!perm || perm === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot edit roles" });
    }

    const result = createRoleSchema.partial().safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    const updated = await roleService.update(worldId, roleId, result.data);
    if (!updated) {
      return reply.status(404).send({ error: "Role not found" });
    }

    return updated;
  });

  // Delete role
  fastify.delete<{ Params: { worldId: string; roleId: string } }>("/:worldId/roles/:roleId", async (request, reply) => {
    const { worldId, roleId } = request.params;
    const perm = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!perm || perm === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot delete roles" });
    }

    const deleted = await roleService.delete(worldId, roleId);
    if (!deleted) {
      return reply.status(404).send({ error: "Role not found" });
    }

    return { success: true };
  });
}
