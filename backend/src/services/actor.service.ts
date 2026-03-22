import { Database } from "@azure/cosmos";
import crypto from "node:crypto";
import type { Actor } from "../types/index.js";

export class ActorService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async create(worldId: string, data: Omit<Actor, "id" | "worldId" | "createdBy" | "createdAt" | "updatedAt">, userId: string): Promise<Actor> {
    const now = new Date().toISOString();
    const actor: Actor = {
      id: crypto.randomUUID(),
      worldId,
      ...data,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.container("Actors").items.create(actor);
    return actor;
  }

  async listByWorld(worldId: string): Promise<Actor[]> {
    const { resources } = await this.db.container("Actors").items
      .query({
        query: "SELECT * FROM c WHERE c.worldId = @worldId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@worldId", value: worldId }],
      })
      .fetchAll();

    return resources as Actor[];
  }

  async getById(worldId: string, actorId: string): Promise<Actor | null> {
    try {
      const { resource } = await this.db.container("Actors").item(actorId, worldId).read<Actor>();
      return resource ?? null;
    } catch {
      return null;
    }
  }

  async update(worldId: string, actorId: string, data: Partial<Actor>): Promise<Actor | null> {
    const existing = await this.getById(worldId, actorId);
    if (!existing) return null;

    const updated: Actor = {
      ...existing,
      ...data,
      id: existing.id,
      worldId: existing.worldId,
      createdBy: existing.createdBy,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const { resource } = await this.db.container("Actors").item(actorId, worldId).replace(updated);
    return resource as Actor;
  }

  async delete(worldId: string, actorId: string): Promise<boolean> {
    try {
      await this.db.container("Actors").item(actorId, worldId).delete();
      return true;
    } catch {
      return false;
    }
  }
}
