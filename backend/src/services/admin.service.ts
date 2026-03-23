import { Database } from "@azure/cosmos";
import type { User, AdminUserView, UserRole, WorldRole, WorldPermission, World } from "../types/index.js";

export class AdminService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /** List users with pagination and optional search. Returns users without passwordHash. */
  async listUsers(page: number, pageSize: number, search?: string): Promise<{ users: AdminUserView[]; total: number }> {
    const container = this.db.container("Users");
    const offset = (page - 1) * pageSize;

    let whereClause = "";
    const parameters: { name: string; value: string | number }[] = [];

    if (search) {
      whereClause = "WHERE CONTAINS(LOWER(c.email), @search) OR CONTAINS(LOWER(c.displayName), @search)";
      parameters.push({ name: "@search", value: search.toLowerCase().trim() });
    }

    // Get total count
    const { resources: countResult } = await container.items
      .query({ query: `SELECT VALUE COUNT(1) FROM c ${whereClause}`, parameters })
      .fetchAll();
    const total = countResult[0] ?? 0;

    // Get paginated users
    const { resources } = await container.items
      .query({
        query: `SELECT c.id, c.email, c.displayName, c.role, c.disabled, c.createdAt, c.lastLogin FROM c ${whereClause} ORDER BY c.createdAt DESC OFFSET @offset LIMIT @limit`,
        parameters: [...parameters, { name: "@offset", value: offset }, { name: "@limit", value: pageSize }],
      })
      .fetchAll();

    return { users: resources as AdminUserView[], total };
  }

  /** Get a single user by ID (without passwordHash), enriched with worldCount. */
  async getUserById(userId: string): Promise<AdminUserView | null> {
    try {
      const { resource } = await this.db.container("Users").item(userId, userId).read<User>();
      if (!resource) return null;

      // Count worlds
      const { resources: countResult } = await this.db.container("WorldPermissions").items
        .query({
          query: "SELECT VALUE COUNT(1) FROM c WHERE c.userId = @userId",
          parameters: [{ name: "@userId", value: userId }],
        })
        .fetchAll();

      const { passwordHash: _, ...userView } = resource;
      return { ...userView, worldCount: countResult[0] ?? 0 };
    } catch {
      return null;
    }
  }

  /** Update a user's system role. */
  async updateUserRole(userId: string, newRole: UserRole): Promise<boolean> {
    try {
      await this.db.container("Users").item(userId, userId).patch([
        { op: "set", path: "/role", value: newRole },
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /** Set a user's disabled status. */
  async setUserDisabled(userId: string, disabled: boolean): Promise<boolean> {
    try {
      await this.db.container("Users").item(userId, userId).patch([
        { op: "set", path: "/disabled", value: disabled },
      ]);
      // If disabling, revoke all their refresh tokens
      if (disabled) {
        await this.revokeAllTokens(userId);
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Hard-delete a user and cascade: remove RefreshTokens and WorldPermissions. */
  async deleteUser(userId: string): Promise<boolean> {
    try {
      // 1. Delete refresh tokens
      await this.revokeAllTokens(userId);
      await this.deleteAllTokens(userId);

      // 2. Delete world permissions
      const { resources: permissions } = await this.db.container("WorldPermissions").items
        .query({
          query: "SELECT c.id, c.userId FROM c WHERE c.userId = @userId",
          parameters: [{ name: "@userId", value: userId }],
        })
        .fetchAll();

      for (const perm of permissions) {
        try {
          await this.db.container("WorldPermissions").item(perm.id, perm.userId).delete();
        } catch { /* already deleted */ }
      }

      // 3. Delete user
      await this.db.container("Users").item(userId, userId).delete();
      return true;
    } catch {
      return false;
    }
  }

  /** List the world permissions for a given user, enriched with world name. */
  async listUserWorlds(userId: string): Promise<(WorldPermission & { worldName?: string })[]> {
    const { resources: permissions } = await this.db.container("WorldPermissions").items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    // Enrich with world names
    const enriched = [];
    for (const perm of permissions as WorldPermission[]) {
      let worldName: string | undefined;
      try {
        const { resource } = await this.db.container("Worlds").item(perm.worldId, perm.worldId).read<World>();
        worldName = resource?.name;
      } catch { /* world may have been deleted */ }
      enriched.push({ ...perm, worldName });
    }

    return enriched;
  }

  /** Update a user's role in a specific world. */
  async updateWorldPermission(permissionId: string, userId: string, newRole: WorldRole): Promise<boolean> {
    try {
      await this.db.container("WorldPermissions").item(permissionId, userId).patch([
        { op: "set", path: "/role", value: newRole },
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /** Remove a user's permission for a specific world. */
  async removeWorldPermission(permissionId: string, userId: string): Promise<boolean> {
    try {
      await this.db.container("WorldPermissions").item(permissionId, userId).delete();
      return true;
    } catch {
      return false;
    }
  }

  /** Get aggregate stats for the admin dashboard. */
  async getStats(): Promise<{ totalUsers: number; adminCount: number; disabledCount: number; recentlyActive: number }> {
    const container = this.db.container("Users");

    const { resources: totalResult } = await container.items
      .query({ query: "SELECT VALUE COUNT(1) FROM c" })
      .fetchAll();

    const { resources: adminResult } = await container.items
      .query({ query: "SELECT VALUE COUNT(1) FROM c WHERE c.role = 'admin'" })
      .fetchAll();

    const { resources: disabledResult } = await container.items
      .query({ query: "SELECT VALUE COUNT(1) FROM c WHERE c.disabled = true" })
      .fetchAll();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { resources: recentResult } = await container.items
      .query({
        query: "SELECT VALUE COUNT(1) FROM c WHERE c.lastLogin >= @since",
        parameters: [{ name: "@since", value: sevenDaysAgo.toISOString() }],
      })
      .fetchAll();

    return {
      totalUsers: totalResult[0] ?? 0,
      adminCount: adminResult[0] ?? 0,
      disabledCount: disabledResult[0] ?? 0,
      recentlyActive: recentResult[0] ?? 0,
    };
  }

  // --- Private helpers ---

  private async revokeAllTokens(userId: string): Promise<void> {
    const { resources: tokens } = await this.db.container("RefreshTokens").items
      .query({
        query: "SELECT c.id, c.userId FROM c WHERE c.userId = @userId AND c.revoked = false",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    for (const token of tokens) {
      try {
        await this.db.container("RefreshTokens").item(token.id, token.userId).patch([
          { op: "set", path: "/revoked", value: true },
        ]);
      } catch { /* already revoked or deleted */ }
    }
  }

  private async deleteAllTokens(userId: string): Promise<void> {
    const { resources: tokens } = await this.db.container("RefreshTokens").items
      .query({
        query: "SELECT c.id, c.userId FROM c WHERE c.userId = @userId",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    for (const token of tokens) {
      try {
        await this.db.container("RefreshTokens").item(token.id, token.userId).delete();
      } catch { /* already deleted */ }
    }
  }
}
