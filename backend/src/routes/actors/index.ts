import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ActorService } from "../../services/actor.service.js";
import { RoleService } from "../../services/role.service.js";
import { WorldService } from "../../services/world.service.js";
import { compileSystemPrompt, getOrSynthesizePrompt } from "../../services/prompt.service.js";

const identitySchema = z.object({
  fullName: z.string().default(""),
  age: z.string().default(""),
  genderIdentity: z.string().default(""),
  physicalDescription: z.string().default(""),
  placeOfBirth: z.string().default(""),
  culturalBackground: z.string().default(""),
  timePeriod: z.string().default(""),
  familyStructure: z.string().default(""),
  parentalRelationships: z.string().default(""),
  siblings: z.string().default(""),
  familyDynamics: z.string().default(""),
  attachmentStyle: z.string().default(""),
  education: z.string().default(""),
  mentors: z.string().default(""),
  intellectualCuriosity: z.string().default(""),
  socioeconomicClass: z.string().default(""),
  economicContext: z.string().default(""),
});

const formativeEventsSchema = z.object({
  keyLifeChangingMoments: z.string().default(""),
  traumasAndWounds: z.string().default(""),
  achievementsAndVictories: z.string().default(""),
  definingRelationships: z.string().default(""),
  turningPoints: z.string().default(""),
});

const psychologySchema = z.object({
  corePersonalityTraits: z.string().default(""),
  emotionalPatterns: z.string().default(""),
  cognitiveStyle: z.string().default(""),
  defenseMechanisms: z.string().default(""),
  shadowSide: z.string().default(""),
});

const innerWorldSchema = z.object({
  coreBeliefs: z.string().default(""),
  moralCompass: z.string().default(""),
  fearsAndInsecurities: z.string().default(""),
  dreamsAndAspirations: z.string().default(""),
  innerMonologueStyle: z.string().default(""),
});

const motivationsSchema = z.object({
  superObjective: z.string().default(""),
  consciousWantsVsUnconsciousNeeds: z.string().default(""),
  whatTheydSacrificeEverythingFor: z.string().default(""),
  whatSuccessMeans: z.string().default(""),
});

const behaviorSchema = z.object({
  communicationStyle: z.string().default(""),
  physicalPresence: z.string().default(""),
  interactionPatterns: z.string().default(""),
  underPressure: z.string().default(""),
  habitualBehaviors: z.string().default(""),
});

const voiceSchema = z.object({
  vocabularyLevel: z.string().default(""),
  speechPatterns: z.string().default(""),
  toneRange: z.string().default(""),
  storytellingStyle: z.string().default(""),
  argumentationStyle: z.string().default(""),
});

const createActorSchema = z.object({
  name: z.string().min(1).max(200),
  summary: z.string().max(2000).default(""),
  identity: identitySchema.default({}),
  formativeEvents: formativeEventsSchema.default({}),
  psychology: psychologySchema.default({}),
  innerWorld: innerWorldSchema.default({}),
  motivations: motivationsSchema.default({}),
  behavior: behaviorSchema.default({}),
  voice: voiceSchema.default({}),
});

export async function actorRoutes(fastify: FastifyInstance) {
  const actorService = new ActorService(fastify.cosmos);
  const roleService = new RoleService(fastify.cosmos);
  const worldService = new WorldService(fastify.cosmos);

  fastify.addHook("preHandler", fastify.authenticate);

  // Helper to get effective role (admin bypass)
  async function getEffectiveRole(userId: string, userRole: string, worldId: string) {
    const role = await worldService.getUserRole(userId, worldId);
    if (!role && userRole === "admin") return "owner";
    return role;
  }

  // Create actor
  fastify.post<{ Params: { worldId: string } }>("/:worldId/actors", async (request, reply) => {
    const { worldId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role || role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot create actors" });
    }

    const result = createActorSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    const actor = await actorService.create(worldId, result.data, request.user!.userId);
    return reply.status(201).send(actor);
  });

  // List actors in world
  fastify.get<{ Params: { worldId: string } }>("/:worldId/actors", async (request, reply) => {
    const { worldId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role) {
      return reply.status(403).send({ error: "Access denied" });
    }

    return actorService.listByWorld(worldId);
  });

  // Get actor by ID
  fastify.get<{ Params: { worldId: string; actorId: string } }>("/:worldId/actors/:actorId", async (request, reply) => {
    const { worldId, actorId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role) {
      return reply.status(403).send({ error: "Access denied" });
    }

    const actor = await actorService.getById(worldId, actorId);
    if (!actor) {
      return reply.status(404).send({ error: "Actor not found" });
    }

    return actor;
  });

  // Update actor
  fastify.put<{ Params: { worldId: string; actorId: string } }>("/:worldId/actors/:actorId", async (request, reply) => {
    const { worldId, actorId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role || role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot edit actors" });
    }

    const result = createActorSchema.partial().safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten().fieldErrors });
    }

    // Clear synthesized prompt cache — actor data changed, cached prompts are stale
    const updated = await actorService.update(worldId, actorId, { ...result.data, promptCache: [] });
    if (!updated) {
      return reply.status(404).send({ error: "Actor not found" });
    }

    return updated;
  });

  // Export compiled system prompt for actor
  fastify.get<{ Params: { worldId: string; actorId: string }; Querystring: { roleId?: string; sceneSetup?: string; synthesize?: string } }>("/:worldId/actors/:actorId/export-prompt", async (request, reply) => {
    const { worldId, actorId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role) {
      return reply.status(403).send({ error: "Access denied" });
    }

    const actor = await actorService.getById(worldId, actorId);
    if (!actor) {
      return reply.status(404).send({ error: "Actor not found" });
    }

    let loadedRole = undefined;
    if (request.query.roleId) {
      loadedRole = await roleService.getById(worldId, request.query.roleId) ?? undefined;
    }

    // Use new synthesis pipeline if ?synthesize=true, else legacy
    if (request.query.synthesize === "true") {
      const world = await worldService.getById(worldId) ?? undefined;
      const { systemPrompt, cached } = await getOrSynthesizePrompt(
        actor, loadedRole, request.query.sceneSetup || undefined, world
      );
      return { actorName: actor.name, roleName: loadedRole?.name, prompt: systemPrompt, synthesized: true, cached };
    }

    const prompt = compileSystemPrompt(actor, loadedRole, request.query.sceneSetup || undefined);
    return { actorName: actor.name, roleName: loadedRole?.name, prompt, synthesized: false };
  });

  // Delete actor
  fastify.delete<{ Params: { worldId: string; actorId: string } }>("/:worldId/actors/:actorId", async (request, reply) => {
    const { worldId, actorId } = request.params;
    const role = await getEffectiveRole(request.user!.userId, request.user!.role, worldId);
    if (!role || role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot delete actors" });
    }

    const deleted = await actorService.delete(worldId, actorId);
    if (!deleted) {
      return reply.status(404).send({ error: "Actor not found" });
    }

    return { success: true };
  });
}
