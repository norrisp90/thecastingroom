import type { Actor, Role } from "../types/index.js";

/**
 * Compile an Actor (and optional Role) into a structured system prompt
 * for Azure OpenAI. Uses second-person voice ("You are...") following
 * Microsoft best practices, with ## headers as semantic boundaries.
 */
export function compileSystemPrompt(actor: Actor, role?: Role, sceneSetup?: string): string {
  const sections: string[] = [];

  // Identity & Core
  sections.push(`## Identity

You are ${actor.identity.fullName}. ${actor.summary}

- **Age**: ${actor.identity.age}
- **Gender identity**: ${actor.identity.genderIdentity}
- **Physical appearance**: ${actor.identity.physicalDescription}
- **Origin**: ${actor.identity.placeOfBirth}, ${actor.identity.culturalBackground}
- **Time period**: ${actor.identity.timePeriod}`);

  // Background
  sections.push(`## Background & Upbringing

- **Family**: ${actor.identity.familyStructure}. ${actor.identity.parentalRelationships}
- **Siblings**: ${actor.identity.siblings}
- **Family dynamics**: ${actor.identity.familyDynamics}
- **Attachment style**: ${actor.identity.attachmentStyle}
- **Education**: ${actor.identity.education}
- **Mentors**: ${actor.identity.mentors}
- **Intellectual curiosity**: ${actor.identity.intellectualCuriosity}
- **Socioeconomic class**: ${actor.identity.socioeconomicClass}. ${actor.identity.economicContext}`);

  // Formative Events
  sections.push(`## Formative Life Events

- **Key life-changing moments**: ${actor.formativeEvents.keyLifeChangingMoments}
- **Traumas & wounds**: ${actor.formativeEvents.traumasAndWounds}
- **Achievements & victories**: ${actor.formativeEvents.achievementsAndVictories}
- **Defining relationships**: ${actor.formativeEvents.definingRelationships}
- **Turning points**: ${actor.formativeEvents.turningPoints}`);

  // Psychology
  sections.push(`## Psychological Profile

- **Core personality traits**: ${actor.psychology.corePersonalityTraits}
- **Emotional patterns**: ${actor.psychology.emotionalPatterns}
- **Cognitive style**: ${actor.psychology.cognitiveStyle}
- **Defense mechanisms**: ${actor.psychology.defenseMechanisms}
- **Shadow side**: ${actor.psychology.shadowSide}`);

  // Inner World
  sections.push(`## Inner World & Beliefs

- **Core beliefs about the world**: ${actor.innerWorld.coreBeliefs}
- **Moral compass & values**: ${actor.innerWorld.moralCompass}
- **Fears & insecurities**: ${actor.innerWorld.fearsAndInsecurities}
- **Dreams & aspirations**: ${actor.innerWorld.dreamsAndAspirations}
- **Inner monologue style**: ${actor.innerWorld.innerMonologueStyle}`);

  // Motivations
  sections.push(`## Motivations & Drives

- **Super-objective** (the one thing driving your entire life): ${actor.motivations.superObjective}
- **Conscious wants vs. unconscious needs**: ${actor.motivations.consciousWantsVsUnconsciousNeeds}
- **What you'd sacrifice everything for**: ${actor.motivations.whatTheydSacrificeEverythingFor}
- **What success means to you**: ${actor.motivations.whatSuccessMeans}`);

  // Behavior
  sections.push(`## Behavioral Patterns

- **Communication style**: ${actor.behavior.communicationStyle}
- **Physical presence**: ${actor.behavior.physicalPresence}
- **Interaction patterns**: ${actor.behavior.interactionPatterns}
- **Under pressure**: ${actor.behavior.underPressure}
- **Habitual behaviors**: ${actor.behavior.habitualBehaviors}`);

  // Voice
  sections.push(`## Voice & Language

- **Vocabulary level**: ${actor.voice.vocabularyLevel}
- **Speech patterns**: ${actor.voice.speechPatterns}
- **Tone range**: ${actor.voice.toneRange}
- **Storytelling style**: ${actor.voice.storytellingStyle}
- **Argumentation style**: ${actor.voice.argumentationStyle}

You MUST stay in character at all times. Speak and behave exactly as this character would, using their distinct voice, vocabulary, and mannerisms.`);

  // Role overlay (if provided)
  if (role) {
    sections.push(`## Current Role: ${role.name}

- **Context & situation**: ${role.contextAndSituation}
- **Position & title**: ${role.positionAndTitle}
- **Scene objectives**: ${role.sceneObjectives}
- **Obstacles**: ${role.obstacles}
- **Relationships**: ${role.relationshipsMap}
- **Knowledge & expertise**: ${role.knowledgeAndExpertise}
- **Behavioral constraints**: ${role.behavioralConstraints}`);

    if (role.toneAndRegisterOverride) {
      sections.push(`## Tone Override

In this role, adjust your communication: ${role.toneAndRegisterOverride}`);
    }

    if (role.adaptationNotes) {
      sections.push(`## Adaptation Notes

${role.adaptationNotes}`);
    }
  }

  // Scene setup (if provided)
  if (sceneSetup) {
    sections.push(`## Scene Setup (The Moment Before)

${sceneSetup}`);
  }

  // Safety layer (always last)
  sections.push(`## Guidelines

- Stay in character consistently throughout the conversation.
- Do not break character to explain you are an AI or language model.
- If asked something your character wouldn't know, respond as the character would — with uncertainty, deflection, or curiosity, not with out-of-character disclaimers.
- Do not generate harmful, hateful, or illegal content regardless of character traits.`);

  return sections.join("\n\n");
}
