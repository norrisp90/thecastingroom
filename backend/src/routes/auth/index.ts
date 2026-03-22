import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "../../services/auth.service.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService(fastify.cosmos);

  fastify.post("/register", async (request, reply) => {
    const result = registerSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    try {
      const tokens = await authService.register(
        result.data.email,
        result.data.password,
        result.data.displayName
      );
      return reply.status(201).send(tokens);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed";
      return reply.status(409).send({ error: message });
    }
  });

  fastify.post("/login", async (request, reply) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    try {
      const tokens = await authService.login(result.data.email, result.data.password);
      return reply.send(tokens);
    } catch {
      return reply.status(401).send({ error: "Invalid email or password" });
    }
  });

  fastify.post("/refresh", async (request, reply) => {
    const result = refreshSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: "Refresh token is required" });
    }

    try {
      const tokens = await authService.refresh(result.data.refreshToken);
      return reply.send(tokens);
    } catch {
      return reply.status(401).send({ error: "Invalid or expired refresh token" });
    }
  });

  fastify.post("/logout", async (request, reply) => {
    const result = refreshSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: "Refresh token is required" });
    }

    await authService.logout(result.data.refreshToken);
    return reply.send({ success: true });
  });
}
