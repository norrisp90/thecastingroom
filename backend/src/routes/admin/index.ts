import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AdminService } from "../../services/admin.service.js";

const roleSchema = z.object({
  role: z.enum(["admin", "user"]),
});

const statusSchema = z.object({
  disabled: z.boolean(),
});

const worldRoleSchema = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
});

export async function adminRoutes(fastify: FastifyInstance) {
  const adminService = new AdminService(fastify.cosmos);

  // All admin routes require authentication + admin role
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", async (request, reply) => {
    if (request.user?.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" });
    }
  });

  // ── Dashboard stats ──────────────────────────────────────────────────
  fastify.get("/stats", async () => {
    return adminService.getStats();
  });

  // ── List users (paginated, searchable) ───────────────────────────────
  fastify.get<{ Querystring: { page?: string; pageSize?: string; search?: string } }>(
    "/users",
    async (request) => {
      const page = Math.max(1, parseInt(request.query.page || "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(request.query.pageSize || "20", 10) || 20));
      const search = request.query.search?.trim() || undefined;
      return adminService.listUsers(page, pageSize, search);
    }
  );

  // ── Get single user ──────────────────────────────────────────────────
  fastify.get<{ Params: { userId: string } }>(
    "/users/:userId",
    async (request, reply) => {
      const user = await adminService.getUserById(request.params.userId);
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }
      return user;
    }
  );

  // ── Change user role ─────────────────────────────────────────────────
  fastify.patch<{ Params: { userId: string } }>(
    "/users/:userId/role",
    async (request, reply) => {
      const { userId } = request.params;
      if (userId === request.user!.userId) {
        return reply.status(400).send({ error: "Cannot change your own role" });
      }

      const result = roleSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten().fieldErrors });
      }

      const ok = await adminService.updateUserRole(userId, result.data.role);
      if (!ok) {
        return reply.status(404).send({ error: "User not found" });
      }
      return { success: true };
    }
  );

  // ── Enable / disable user ────────────────────────────────────────────
  fastify.patch<{ Params: { userId: string } }>(
    "/users/:userId/status",
    async (request, reply) => {
      const { userId } = request.params;
      if (userId === request.user!.userId) {
        return reply.status(400).send({ error: "Cannot disable your own account" });
      }

      const result = statusSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten().fieldErrors });
      }

      const ok = await adminService.setUserDisabled(userId, result.data.disabled);
      if (!ok) {
        return reply.status(404).send({ error: "User not found" });
      }
      return { success: true };
    }
  );

  // ── Delete user ──────────────────────────────────────────────────────
  fastify.delete<{ Params: { userId: string } }>(
    "/users/:userId",
    async (request, reply) => {
      const { userId } = request.params;
      if (userId === request.user!.userId) {
        return reply.status(400).send({ error: "Cannot delete your own account" });
      }

      const ok = await adminService.deleteUser(userId);
      if (!ok) {
        return reply.status(404).send({ error: "User not found" });
      }
      return { success: true };
    }
  );

  // ── List user's world memberships ────────────────────────────────────
  fastify.get<{ Params: { userId: string } }>(
    "/users/:userId/worlds",
    async (request) => {
      const worlds = await adminService.listUserWorlds(request.params.userId);
      return { worlds };
    }
  );

  // ── Change user's world role ─────────────────────────────────────────
  fastify.patch<{ Params: { userId: string; worldId: string } }>(
    "/users/:userId/worlds/:worldId",
    async (request, reply) => {
      const result = worldRoleSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten().fieldErrors });
      }

      // Find the permission entry for this user+world
      const worlds = await adminService.listUserWorlds(request.params.userId);
      const perm = worlds.find((w) => w.worldId === request.params.worldId);
      if (!perm) {
        return reply.status(404).send({ error: "Permission not found" });
      }

      const ok = await adminService.updateWorldPermission(perm.id, perm.userId, result.data.role);
      if (!ok) {
        return reply.status(500).send({ error: "Failed to update permission" });
      }
      return { success: true };
    }
  );

  // ── Remove user from world ───────────────────────────────────────────
  fastify.delete<{ Params: { userId: string; worldId: string } }>(
    "/users/:userId/worlds/:worldId",
    async (request, reply) => {
      const worlds = await adminService.listUserWorlds(request.params.userId);
      const perm = worlds.find((w) => w.worldId === request.params.worldId);
      if (!perm) {
        return reply.status(404).send({ error: "Permission not found" });
      }

      const ok = await adminService.removeWorldPermission(perm.id, perm.userId);
      if (!ok) {
        return reply.status(500).send({ error: "Failed to remove permission" });
      }
      return { success: true };
    }
  );
}
