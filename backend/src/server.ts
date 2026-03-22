import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { cosmosPlugin } from "./plugins/cosmos.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth/index.js";
import { worldRoutes } from "./routes/worlds/index.js";
import { actorRoutes } from "./routes/actors/index.js";
import { auditionRoutes } from "./routes/auditions/index.js";

const server = Fastify({
  logger: true,
});

async function start() {
  // Plugins
  await server.register(cors, {
    origin: (process.env.FRONTEND_URL || "http://localhost:3000").split(",").map(s => s.trim()),
    credentials: true,
  });
  await server.register(websocket);
  await server.register(cosmosPlugin);
  await server.register(authPlugin);

  // Routes
  await server.register(authRoutes, { prefix: "/api/auth" });
  await server.register(worldRoutes, { prefix: "/api/worlds" });
  await server.register(actorRoutes, { prefix: "/api/worlds" });
  await server.register(auditionRoutes, { prefix: "/api/worlds" });

  // Health check
  server.get("/api/health", async () => ({ status: "ok" }));

  const port = parseInt(process.env.PORT || "4000", 10);
  const host = process.env.HOST || "0.0.0.0";

  await server.listen({ port, host });
  server.log.info(`Server listening on ${host}:${port}`);
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
