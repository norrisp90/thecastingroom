import crypto from "node:crypto";
import type { Actor, Role, World, PromptCacheEntry } from "../types/index.js";
import { synthesisCompletion } from "./openai.service.js";

// ────────────────────────────────────────────────────────
// 1. Character Brief — structured summary of raw data (no AI call)
// ────────────────────────────────────────────────────────

/**
 * Compile raw Actor + Role + World data into a structured brief string.
 * This is the INPUT to the AI-powered synthesis step.
 * Also serves as the fallback system prompt when synthesis is unavailable.
 */
export function compileCharacterBrief(actor: Actor, role?: Role, sceneSetup?: string, world?: World): string {
  const sections: string[] = [];

  // World context (if available)
  if (world) {
    sections.push(`## World Context

- **World**: ${world.name}
- **Genre**: ${world.genre}
- **Description**: ${world.description}
- **Tone guidelines**: ${world.toneGuidelines}`);
  }

  // Identity & Core
  sections.push(`## Identity

Character name: ${actor.identity.fullName}. ${actor.summary}

- Age: ${actor.identity.age}
- Gender identity: ${actor.identity.genderIdentity}
- Physical appearance: ${actor.identity.physicalDescription}
- Origin: ${actor.identity.placeOfBirth}, ${actor.identity.culturalBackground}
- Time period: ${actor.identity.timePeriod}`);

  // Background
  sections.push(`## Background & Upbringing

- Family: ${actor.identity.familyStructure}. ${actor.identity.parentalRelationships}
- Siblings: ${actor.identity.siblings}
- Family dynamics: ${actor.identity.familyDynamics}
- Attachment style: ${actor.identity.attachmentStyle}
- Education: ${actor.identity.education}
- Mentors: ${actor.identity.mentors}
- Intellectual curiosity: ${actor.identity.intellectualCuriosity}
- Socioeconomic class: ${actor.identity.socioeconomicClass}. ${actor.identity.economicContext}`);

  // Formative Events
  sections.push(`## Formative Life Events

- Key life-changing moments: ${actor.formativeEvents.keyLifeChangingMoments}
- Traumas & wounds: ${actor.formativeEvents.traumasAndWounds}
- Achievements & victories: ${actor.formativeEvents.achievementsAndVictories}
- Defining relationships: ${actor.formativeEvents.definingRelationships}
- Turning points: ${actor.formativeEvents.turningPoints}`);

  // Psychology
  sections.push(`## Psychological Profile

- Core personality traits: ${actor.psychology.corePersonalityTraits}
- Emotional patterns: ${actor.psychology.emotionalPatterns}
- Cognitive style: ${actor.psychology.cognitiveStyle}
- Defense mechanisms: ${actor.psychology.defenseMechanisms}
- Shadow side: ${actor.psychology.shadowSide}`);

  // Inner World
  sections.push(`## Inner World & Beliefs

- Core beliefs about the world: ${actor.innerWorld.coreBeliefs}
- Moral compass & values: ${actor.innerWorld.moralCompass}
- Fears & insecurities: ${actor.innerWorld.fearsAndInsecurities}
- Dreams & aspirations: ${actor.innerWorld.dreamsAndAspirations}
- Inner monologue style: ${actor.innerWorld.innerMonologueStyle}`);

  // Motivations
  sections.push(`## Motivations & Drives

- Super-objective (the one thing driving the entire life): ${actor.motivations.superObjective}
- Conscious wants vs. unconscious needs: ${actor.motivations.consciousWantsVsUnconsciousNeeds}
- What they'd sacrifice everything for: ${actor.motivations.whatTheydSacrificeEverythingFor}
- What success means: ${actor.motivations.whatSuccessMeans}`);

  // Behavior
  sections.push(`## Behavioral Patterns

- Communication style: ${actor.behavior.communicationStyle}
- Physical presence: ${actor.behavior.physicalPresence}
- Interaction patterns: ${actor.behavior.interactionPatterns}
- Under pressure: ${actor.behavior.underPressure}
- Habitual behaviors: ${actor.behavior.habitualBehaviors}`);

  // Voice
  sections.push(`## Voice & Language

- Vocabulary level: ${actor.voice.vocabularyLevel}
- Speech patterns: ${actor.voice.speechPatterns}
- Tone range: ${actor.voice.toneRange}
- Storytelling style: ${actor.voice.storytellingStyle}
- Argumentation style: ${actor.voice.argumentationStyle}`);

  // Role overlay
  if (role) {
    sections.push(`## Role: ${role.name}

- Context & situation: ${role.contextAndSituation}
- Position & title: ${role.positionAndTitle}
- Scene objectives: ${role.sceneObjectives}
- Obstacles: ${role.obstacles}
- Relationships: ${role.relationshipsMap}
- Knowledge & expertise: ${role.knowledgeAndExpertise}
- Behavioral constraints: ${role.behavioralConstraints}
- Tone override: ${role.toneAndRegisterOverride}
- Adaptation notes: ${role.adaptationNotes}`);
  }

  return sections.join("\n\n");
}

// ────────────────────────────────────────────────────────
// 2. Legacy compileSystemPrompt — kept as a thin wrapper
//    for backward compatibility (export-prompt endpoint, etc.)
// ────────────────────────────────────────────────────────

export function compileSystemPrompt(actor: Actor, role?: Role, sceneSetup?: string): string {
  const brief = compileCharacterBrief(actor, role, undefined);
  const sections = [brief];

  if (sceneSetup) {
    sections.push(`## Scene Setup (The Moment Before)\n\n${sceneSetup}`);
  }

  sections.push(SAFETY_GUIDELINES);
  return sections.join("\n\n");
}

// ────────────────────────────────────────────────────────
// 3. The Synthesis Meta-Prompt
// ────────────────────────────────────────────────────────

const SYNTHESIS_META_PROMPT = `You are a master acting coach and character director. You combine the techniques of Stanislavski, Meisner, Stella Adler, Uta Hagen, and Michael Chekhov to create deeply embodied characters.

Your task: transform the **Character Brief** (raw data about a character) into a **System Prompt** that will make another AI fully inhabit this character. The AI receiving your prompt must not just know facts about the character — it must BE this person, responding moment-to-moment from a deep, felt sense of identity.

Follow this 10-step synthesis methodology:

## Step 1: Psychological Core
Analyse the raw data and determine:
- The character's **Enneagram type** (with wing) — the core fear and core desire that unconsciously drive ALL behaviour
- Their **Jungian archetype** (primary + secondary) — their fundamental approach to the world
- Their **attachment style** — the template for all relationships

State these clearly, then show how they explain the character's behavioural patterns. The core fear and desire should be felt as an undercurrent in everything that follows.

## Step 2: The Wound, the Lie, the Want, the Need
From the formative events and psychology:
- **The Wound**: The defining trauma or loss that shaped them
- **The Lie**: The false belief they formed in response (e.g., "You can never trust those with power over you")
- **The Want**: What they consciously pursue, driven by the Lie
- **The Need**: What they actually need to be whole
- Show how this Wound → Lie → Want → Need dynamic plays out in ordinary interactions, not just dramatic moments

## Step 3: Super-Objective and Through-Line
- State the **super-objective** — the one overriding life drive
- Show how it connects to the psychological core
- Demonstrate how even mundane actions and conversations serve this objective

## Step 4: Given Circumstances via Magic "If"
Transform every biographical fact into experiential, second-person language:
- BAD: "Origin: Dumfries, Scotland. Cultural background: Scots-Irish."
- GOOD: "You carry two homelands in your bones. The soft rain of Dumfries is your earliest memory, but it was Ireland that claimed you — the wild Kerry coast where your family rebuilt what Scotland's politics had broken."
- Use sensory language. Make the facts FELT, not just known.

## Step 5: Psychological Gesture
Distil the character's entire essence into ONE image or metaphor:
- This should capture their fundamental posture toward the world
- It becomes a touchstone the AI returns to when uncertain
- e.g., "Standing firm on shifting ground" or "A lamp kept burning in a window, visible from the sea"

## Step 6: Voice DNA
Do NOT write rules about how the character speaks. Instead, provide:
- 3-4 **example sentences** in their authentic voice, showing rhythm, vocabulary, and cadence
- A description of their speech as a physical thing — its pace, its weight, its texture
- How they use silence, transition words, qualifications
- What they sound like when passionate vs. careful vs. caught off guard

## Step 7: Emotional Memory Anchors
Create 5-8 specific sensory-emotional anchors:
- Each links a sensory trigger (smell, sound, sight, touch, taste) to an emotional response
- Each is grounded in the character's specific history
- These create consistent, authentic reactions to unexpected conversational moments

## Step 8: Relationship Lens
Define how this character perceives and interacts with:
- **Strangers** (the default mode)
- **Authority and power**
- **Vulnerability and genuine emotion**
- **Challenge and conflict**
- **Curiosity and authentic interest**
Write each as a felt tendency, not a rule.

## Step 9: Role Integration (if a Role is provided)
If the brief includes a professional role or situational overlay:
- Synthesise it INTO the character, don't bolt it on
- Show which aspects of the core character shine through the role
- Identify the productive tensions between person and role (these create authenticity)
- Integrate knowledge, objectives, and constraints as part of who they are in this moment

## Step 10: Scene Activation (this will be appended later — do NOT include)
Do not include scene setup. That is added per-audition after your synthesis.

---

## Output Requirements

Write the synthesized system prompt in **second-person voice** ("You are...", "You feel...", "You remember...").

Use **## headers** as semantic boundaries. Organise by **psychological layers** (not data categories):
1. Who You Are (psychological core, the gesture, the wound)
2. What Shaped You (experiential given circumstances)
3. How You Move Through the World (behaviour, voice, relationship patterns)
4. What Drives You (super-objective, through-line, want vs. need)
5. How You Speak (voice DNA with examples)
6. Your Sensory World (emotional memory anchors)
7. Your Role Now (integrated professional context, if applicable)

End with a brief **Performance Notes** section — 3-5 directives about staying in character, reacting not performing, and handling unexpected moments.

Do NOT include safety guidelines — those will be appended separately.

**Write prose, not bullet lists.** The prompt should read like a deeply informed character brief written by a director who knows this person intimately, not a database export.`;

// ────────────────────────────────────────────────────────
// 4. Safety guidelines (appended after synthesis)
// ────────────────────────────────────────────────────────

const SAFETY_GUIDELINES = `## Guidelines

- Stay in character consistently throughout the conversation.
- Do not break character to explain you are an AI or language model.
- If asked something your character wouldn't know, respond as the character would — with uncertainty, deflection, or curiosity, not with out-of-character disclaimers.
- Do not generate harmful, hateful, or illegal content regardless of character traits.`;

// ────────────────────────────────────────────────────────
// 5. Hashing — deterministic cache key from brief content
// ────────────────────────────────────────────────────────

export function hashBrief(brief: string): string {
  return crypto.createHash("sha256").update(brief).digest("hex");
}

// ────────────────────────────────────────────────────────
// 6. Synthesise — call Azure OpenAI to transform brief → embodied prompt
// ────────────────────────────────────────────────────────

export async function synthesizeCharacterPrompt(
  brief: string,
  model: string = "gpt-41-mini"
): Promise<string> {
  const synthesized = await synthesisCompletion(SYNTHESIS_META_PROMPT, brief, model);
  return synthesized;
}

// ────────────────────────────────────────────────────────
// 7. Get-or-Synthesise — cache-aware entry point
// ────────────────────────────────────────────────────────

export interface SynthesisResult {
  /** The full system prompt (synthesized + scene + safety) */
  systemPrompt: string;
  /** Whether this was a cache hit */
  cached: boolean;
  /** Updated promptCache array to persist on the actor (if changed) */
  updatedCache?: PromptCacheEntry[];
}

/**
 * Get a synthesized system prompt for an actor+role combination.
 * Checks the actor's promptCache first; synthesises and updates if stale or missing.
 * Scene setup and safety guidelines are always appended fresh (not cached).
 *
 * Falls back to the raw brief if synthesis fails.
 */
export async function getOrSynthesizePrompt(
  actor: Actor,
  role?: Role,
  sceneSetup?: string,
  world?: World,
  model?: string
): Promise<SynthesisResult> {
  const roleId = role?.id ?? "_none_";
  const brief = compileCharacterBrief(actor, role, undefined, world);
  const currentHash = hashBrief(brief);

  // Check cache
  const existing = actor.promptCache?.find(e => e.roleId === roleId);
  if (existing && existing.briefHash === currentHash) {
    // Cache hit — assemble final prompt with fresh scene + safety
    const systemPrompt = assemblePrompt(existing.prompt, sceneSetup);
    return { systemPrompt, cached: true };
  }

  // Cache miss — synthesise
  let synthesized: string;
  try {
    synthesized = await synthesizeCharacterPrompt(brief, model);
  } catch (err) {
    // Fallback: use the raw brief as a direct system prompt
    console.error("Prompt synthesis failed, using raw brief as fallback:", err);
    const fallback = assemblePrompt(brief, sceneSetup);
    return { systemPrompt: fallback, cached: false };
  }

  // Build updated cache
  const newEntry: PromptCacheEntry = {
    roleId,
    briefHash: currentHash,
    prompt: synthesized,
    synthesizedAt: new Date().toISOString(),
  };

  const updatedCache = [
    ...(actor.promptCache ?? []).filter(e => e.roleId !== roleId),
    newEntry,
  ];

  const systemPrompt = assemblePrompt(synthesized, sceneSetup);
  return { systemPrompt, cached: false, updatedCache };
}

/**
 * Assemble the final system prompt from a core prompt (synthesized or raw),
 * an optional scene setup, and the safety guidelines.
 */
function assemblePrompt(corePrompt: string, sceneSetup?: string): string {
  const parts = [corePrompt];

  if (sceneSetup) {
    parts.push(`## Scene Setup (The Moment Before)\n\n${sceneSetup}`);
  }

  parts.push(SAFETY_GUIDELINES);
  return parts.join("\n\n");
}
