import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { CosmosClient, Database } from "@azure/cosmos";

declare module "fastify" {
  interface FastifyInstance {
    cosmos: Database;
  }
}

async function cosmosPluginFn(fastify: FastifyInstance) {
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE || "thecastingroom-db";

  if (!endpoint || !key) {
    throw new Error("COSMOS_ENDPOINT and COSMOS_KEY environment variables are required");
  }

  const client = new CosmosClient({ endpoint, key });
  const { database } = await client.databases.createIfNotExists({ id: databaseId });

  // Ensure all containers exist
  const containers = [
    { id: "Users", partitionKey: "/id" },
    { id: "RefreshTokens", partitionKey: "/userId" },
    { id: "Worlds", partitionKey: "/id" },
    { id: "WorldPermissions", partitionKey: "/userId" },
    { id: "Actors", partitionKey: "/worldId" },
    { id: "Roles", partitionKey: "/worldId" },
    { id: "AuditionSessions", partitionKey: "/worldId" },
  ];

  for (const containerDef of containers) {
    await database.containers.createIfNotExists(containerDef);
  }

  fastify.decorate("cosmos", database);
  fastify.log.info("Cosmos DB connected and containers initialized");
}

export const cosmosPlugin = fp(cosmosPluginFn, { name: "cosmos" });
