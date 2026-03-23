import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import type { User } from "../types/index.js";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

async function authPluginFn(fastify: FastifyInstance) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Missing or invalid authorization header" });
      }

      const token = authHeader.slice(7);
      try {
        const payload = jwt.verify(token, secret) as JwtPayload;
        request.user = payload;

        // Check if user account is disabled
        try {
          const { resource: user } = await fastify.cosmos.container("Users").item(payload.userId, payload.userId).read<User>();
          if (user?.disabled) {
            return reply.status(403).send({ error: "Account disabled" });
          }
        } catch {
          // User lookup failed — allow request to proceed (user may have been deleted,
          // individual route handlers will handle missing users)
        }
      } catch {
        return reply.status(401).send({ error: "Invalid or expired token" });
      }
    }
  );
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(authPluginFn, { name: "auth" });
