import { Database } from "@azure/cosmos";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import type { User, UserRole, RefreshToken } from "../types/index.js";
import type { JwtPayload } from "../plugins/auth.js";

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export class AuthService {
  private db: Database;
  private jwtSecret: string;

  constructor(db: Database) {
    this.db = db;
    this.jwtSecret = process.env.JWT_SECRET!;
  }

  async register(email: string, password: string, displayName: string) {
    const usersContainer = this.db.container("Users");

    // Check existing user
    const { resources: existing } = await usersContainer.items
      .query({
        query: "SELECT c.id FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: email }],
      })
      .fetchAll();

    if (existing.length > 0) {
      throw new Error("User with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = new Date().toISOString();
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
    const role: UserRole = (adminEmail && email.toLowerCase().trim() === adminEmail) ? "admin" : "user";
    const user: User = {
      id: crypto.randomUUID(),
      email: email.toLowerCase().trim(),
      passwordHash,
      displayName: displayName.trim(),
      role,
      createdAt: now,
      lastLogin: now,
    };

    await usersContainer.items.create(user);
    return this.generateTokens(user);
  }

  async login(email: string, password: string) {
    const usersContainer = this.db.container("Users");
    const { resources: users } = await usersContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: email.toLowerCase().trim() }],
      })
      .fetchAll();

    if (users.length === 0) {
      throw new Error("Invalid email or password");
    }

    const user = users[0] as User;
    if (user.disabled) {
      throw new Error("Account disabled");
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid email or password");
    }

    // Update last login
    await usersContainer.item(user.id, user.id).patch([
      { op: "set", path: "/lastLogin", value: new Date().toISOString() },
    ]);

    return this.generateTokens(user);
  }

  async refresh(refreshTokenValue: string) {
    const container = this.db.container("RefreshTokens");
    const { resources: tokens } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.token = @token AND c.revoked = false",
        parameters: [{ name: "@token", value: refreshTokenValue }],
      })
      .fetchAll();

    if (tokens.length === 0) {
      throw new Error("Invalid or revoked refresh token");
    }

    const storedToken = tokens[0] as RefreshToken;
    if (new Date(storedToken.expiresAt) < new Date()) {
      throw new Error("Refresh token expired");
    }

    // Revoke old token
    await container.item(storedToken.id, storedToken.userId).patch([
      { op: "set", path: "/revoked", value: true },
    ]);

    // Get user
    const usersContainer = this.db.container("Users");
    const { resource: user } = await usersContainer.item(storedToken.userId, storedToken.userId).read<User>();
    if (!user) {
      throw new Error("User not found");
    }
    if (user.disabled) {
      throw new Error("Account disabled");
    }

    return this.generateTokens(user);
  }

  async logout(refreshTokenValue: string) {
    const container = this.db.container("RefreshTokens");
    const { resources: tokens } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.token = @token",
        parameters: [{ name: "@token", value: refreshTokenValue }],
      })
      .fetchAll();

    if (tokens.length > 0) {
      const storedToken = tokens[0] as RefreshToken;
      await container.item(storedToken.id, storedToken.userId).patch([
        { op: "set", path: "/revoked", value: true },
      ]);
    }
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshTokenValue = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    const refreshToken: RefreshToken = {
      id: crypto.randomUUID(),
      userId: user.id,
      token: refreshTokenValue,
      expiresAt: expiresAt.toISOString(),
      revoked: false,
    };

    await this.db.container("RefreshTokens").items.create(refreshToken);

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }
}
