// ============================================================
// The Casting Room — Domain Types
// ============================================================

// --- User & Auth ---

export type UserRole = "admin" | "user";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  disabled?: boolean;
  createdAt: string;
  lastLogin: string;
}

/** User view returned by admin endpoints (no passwordHash) */
export type AdminUserView = Omit<User, "passwordHash"> & { worldCount?: number };

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  revoked: boolean;
}

// --- Worlds ---

export type WorldRole = "owner" | "editor" | "viewer";

export interface World {
  id: string;
  name: string;
  description: string;
  genre: string;
  defaultModel: string;
  toneGuidelines: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorldPermission {
  id: string;
  userId: string;
  worldId: string;
  role: WorldRole;
  invitedBy: string;
  grantedAt: string;
}

// --- Actors (Character Development Framework) ---

/** Section A: Identity & Background */
export interface ActorIdentity {
  fullName: string;
  age: string;
  genderIdentity: string;
  physicalDescription: string;
  placeOfBirth: string;
  culturalBackground: string;
  timePeriod: string;
  familyStructure: string;
  parentalRelationships: string;
  siblings: string;
  familyDynamics: string;
  attachmentStyle: string;
  education: string;
  mentors: string;
  intellectualCuriosity: string;
  socioeconomicClass: string;
  economicContext: string;
}

/** Section B: Formative Life Events */
export interface ActorFormativeEvents {
  keyLifeChangingMoments: string;
  traumasAndWounds: string;
  achievementsAndVictories: string;
  definingRelationships: string;
  turningPoints: string;
}

/** Section C: Psychological Profile */
export interface ActorPsychology {
  corePersonalityTraits: string;
  emotionalPatterns: string;
  cognitiveStyle: string;
  defenseMechanisms: string;
  shadowSide: string;
}

/** Section D: Inner World & Beliefs */
export interface ActorInnerWorld {
  coreBeliefs: string;
  moralCompass: string;
  fearsAndInsecurities: string;
  dreamsAndAspirations: string;
  innerMonologueStyle: string;
}

/** Section E: Motivations & Drives */
export interface ActorMotivations {
  superObjective: string;
  consciousWantsVsUnconsciousNeeds: string;
  whatTheydSacrificeEverythingFor: string;
  whatSuccessMeans: string;
}

/** Section F: Behavioral Patterns & Expression */
export interface ActorBehavior {
  communicationStyle: string;
  physicalPresence: string;
  interactionPatterns: string;
  underPressure: string;
  habitualBehaviors: string;
}

/** Section G: Voice & Language */
export interface ActorVoice {
  vocabularyLevel: string;
  speechPatterns: string;
  toneRange: string;
  storytellingStyle: string;
  argumentationStyle: string;
}

/** Cached synthesized prompt for an actor+role combination */
export interface PromptCacheEntry {
  /** roleId (or "_none_" for no-role prompts) */
  roleId: string;
  /** SHA-256 hex hash of the character brief used for synthesis */
  briefHash: string;
  /** The synthesized system prompt text */
  prompt: string;
  /** When this entry was synthesized */
  synthesizedAt: string;
}

export interface Actor {
  id: string;
  worldId: string;
  name: string;
  summary: string;
  identity: ActorIdentity;
  formativeEvents: ActorFormativeEvents;
  psychology: ActorPsychology;
  innerWorld: ActorInnerWorld;
  motivations: ActorMotivations;
  behavior: ActorBehavior;
  voice: ActorVoice;
  /** Cached synthesized prompts keyed by roleId */
  promptCache?: PromptCacheEntry[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// --- Roles (Contextual Behavioral Overlay) ---

export interface Role {
  id: string;
  worldId: string;
  name: string;
  contextAndSituation: string;
  positionAndTitle: string;
  sceneObjectives: string;
  obstacles: string;
  relationshipsMap: string;
  knowledgeAndExpertise: string;
  behavioralConstraints: string;
  toneAndRegisterOverride: string;
  adaptationNotes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// --- Audition Sessions ---

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  rating?: {
    believability?: number;
    consistency?: number;
    emotionalDepth?: number;
    voiceAccuracy?: number;
  };
  flaggedOutOfCharacter?: boolean;
}

export interface AuditionSession {
  id: string;
  worldId: string;
  actorId: string;
  roleId?: string;
  sceneSetup: string;
  compiledSystemPrompt: string;
  model: string;
  mode?: "chat" | "voice";
  realtimeVoice?: string;
  turns: ConversationTurn[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
