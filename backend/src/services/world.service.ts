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

  async listForUser(userId: string): Promise<World[]> {
    const { resources: permissions } = await this.db.container("WorldPermissions").items
      .query({
        query: "SELECT c.worldId FROM c WHERE c.userId = @userId",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    if (permissions.length === 0) return [];

    const worldIds = permissions.map((p) => p.worldId);
    const placeholders = worldIds.map((_, i) => `@id${i}`).join(",");
    const parameters = worldIds.map((id, i) => ({ name: `@id${i}`, value: id }));

    const { resources: worlds } = await this.db.container("Worlds").items
      .query({
        query: `SELECT * FROM c WHERE c.id IN (${placeholders})`,
        parameters,
      })
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

  async getUserRole(userId: string, worldId: string): Promise<WorldRole | null> {
    const { resources } = await this.db.container("WorldPermissions").items
      .query({
        query: "SELECT c.role FROM c WHERE c.userId = @userId AND c.worldId = @worldId",
        parameters: [
          { name: "@userId", value: userId },
          { name: "@worldId", value: worldId },
        ],
      })
      .fetchAll();

    if (resources.length === 0) return null;
    return resources[0].role as WorldRole;
  }

  async addPermission(worldId: string, targetUserId: string, role: WorldRole, invitedBy: string): Promise<void> {
    const permission: WorldPermission = {
      id: crypto.randomUUID(),
      userId: targetUserId,
      worldId,
      role,
      invitedBy,
      grantedAt: new Date().toISOString(),
    };
    await this.db.container("WorldPermissions").items.create(permission);
  }
}
