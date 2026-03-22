import { Database } from "@azure/cosmos";
import crypto from "node:crypto";
import type { Role } from "../types/index.js";

export class RoleService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async create(worldId: string, data: Omit<Role, "id" | "worldId" | "createdBy" | "createdAt" | "updatedAt">, userId: string): Promise<Role> {
    const now = new Date().toISOString();
    const role: Role = {
      id: crypto.randomUUID(),
      worldId,
      ...data,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.container("Roles").items.create(role);
    return role;
  }

  async listByWorld(worldId: string): Promise<Role[]> {
    const { resources } = await this.db.container("Roles").items
      .query({
        query: "SELECT * FROM c WHERE c.worldId = @worldId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@worldId", value: worldId }],
      })
      .fetchAll();

    return resources as Role[];
  }

  async getById(worldId: string, roleId: string): Promise<Role | null> {
    try {
      const { resource } = await this.db.container("Roles").item(roleId, worldId).read<Role>();
      return resource ?? null;
    } catch {
      return null;
    }
  }

  async update(worldId: string, roleId: string, data: Partial<Role>): Promise<Role | null> {
    const existing = await this.getById(worldId, roleId);
    if (!existing) return null;

    const updated: Role = {
      ...existing,
      ...data,
      id: existing.id,
      worldId: existing.worldId,
      createdBy: existing.createdBy,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const { resource } = await this.db.container("Roles").item(roleId, worldId).replace(updated);
    return resource as Role;
  }

  async delete(worldId: string, roleId: string): Promise<boolean> {
    try {
      await this.db.container("Roles").item(roleId, worldId).delete();
      return true;
    } catch {
      return false;
    }
  }
}
