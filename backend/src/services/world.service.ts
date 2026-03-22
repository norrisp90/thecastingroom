import { Database } from "@azure/cosmos";
import crypto from "node:crypto";
import type { World, WorldPermission, WorldRole } from "../types/index.js";

export class WorldService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async create(data: { name: string; description: string; genre: string; defaultModel: string; toneGuidelines: string }, userId: string): Promise<World> {
    const now = new Date().toISOString();
    const world: World = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description,
      genre: data.genre || "",
      defaultModel: data.defaultModel || "gpt-41-mini",
      toneGuidelines: data.toneGuidelines || "",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.container("Worlds").items.create(world);

    // Auto-assign owner permission
    const permission: WorldPermission = {
      id: crypto.randomUUID(),
      userId,
      worldId: world.id,
      role: "owner",
      invitedBy: userId,
      grantedAt: now,
    };
    await this.db.container("WorldPermissions").items.create(permission);

    return world;
  }

  // TEMPORARY: All authenticated users see all worlds (co-owner mode)
  async listForUser(_userId: string): Promise<World[]> {
    const { resources: worlds } = await this.db.container("Worlds").items
      .query({ query: "SELECT * FROM c ORDER BY c.createdAt DESC" })
      .fetchAll();
    return worlds as World[];
  }

  async getById(worldId: string): Promise<World | null> {
    try {
      const { resource } = await this.db.container("Worlds").item(worldId, worldId).read<World>();
      return resource ?? null;
    } catch {
      return null;
    }
  }

  async update(worldId: string, data: Partial<Pick<World, "name" | "description" | "genre" | "defaultModel" | "toneGuidelines">>): Promise<World | null> {
    const patches: { op: "set"; path: string; value: string }[] = [];
    if (data.name !== undefined) patches.push({ op: "set", path: "/name", value: data.name });
    if (data.description !== undefined) patches.push({ op: "set", path: "/description", value: data.description });
    if (data.genre !== undefined) patches.push({ op: "set", path: "/genre", value: data.genre });
    if (data.defaultModel !== undefined) patches.push({ op: "set", path: "/defaultModel", value: data.defaultModel });
    if (data.toneGuidelines !== undefined) patches.push({ op: "set", path: "/toneGuidelines", value: data.toneGuidelines });
    patches.push({ op: "set", path: "/updatedAt", value: new Date().toISOString() });

    try {
      const { resource } = await this.db.container("Worlds").item(worldId, worldId).patch(patches);
      return resource as World;
    } catch {
      return null;
    }
  }

  async delete(worldId: string): Promise<boolean> {
    try {
      await this.db.container("Worlds").item(worldId, worldId).delete();
      return true;
    } catch {
      return false;
    }
  }

  // TEMPORARY: All authenticated users are co-owners of all worlds
  async getUserRole(_userId: string, _worldId: string): Promise<WorldRole | null> {
    return "owner";
  }

  async addPermission(worldId: string, targetUserId: string, role: WorldRole, invitedBy: string): Promise<WorldPermission> {
    const permission: WorldPermission = {
      id: crypto.randomUUID(),
      userId: targetUserId,
      worldId,
      role,
      invitedBy,
      grantedAt: new Date().toISOString(),
    };
    await this.db.container("WorldPermissions").items.create(permission);
    return permission;
  }

  async listPermissions(worldId: string): Promise<WorldPermission[]> {
    const { resources } = await this.db.container("WorldPermissions").items
      .query({
        query: "SELECT * FROM c WHERE c.worldId = @worldId",
        parameters: [{ name: "@worldId", value: worldId }],
      })
      .fetchAll();
    return resources as WorldPermission[];
  }

  async updatePermission(permissionId: string, userId: string, newRole: WorldRole): Promise<boolean> {
    try {
      await this.db.container("WorldPermissions").item(permissionId, userId).patch([
        { op: "set", path: "/role", value: newRole },
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async removePermission(permissionId: string, userId: string): Promise<boolean> {
    try {
      await this.db.container("WorldPermissions").item(permissionId, userId).delete();
      return true;
    } catch {
      return false;
    }
  }

  async findUserByEmail(email: string): Promise<{ id: string; email: string; displayName: string } | null> {
    const { resources } = await this.db.container("Users").items
      .query({
        query: "SELECT c.id, c.email, c.displayName FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: email.toLowerCase().trim() }],
      })
      .fetchAll();
    return resources.length > 0 ? resources[0] as { id: string; email: string; displayName: string } : null;
  }
}
