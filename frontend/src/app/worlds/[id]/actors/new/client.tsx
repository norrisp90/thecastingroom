"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authFetch } from "@/lib/auth";

const textareaClass =
  "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface SectionField {
  key: string;
  label: string;
  placeholder: string;
}

const SECTIONS: { key: string; title: string; fields: SectionField[] }[] = [
  {
    key: "identity",
    title: "Identity & Background",
    fields: [
      { key: "fullName", label: "Full Name", placeholder: "Character's full legal/given name" },
      { key: "age", label: "Age", placeholder: "Age or age range" },
      { key: "genderIdentity", label: "Gender Identity", placeholder: "Gender identity" },
      { key: "physicalDescription", label: "Physical Description", placeholder: "Appearance, build, distinguishing features" },
      { key: "placeOfBirth", label: "Place of Birth", placeholder: "Where they were born" },
      { key: "culturalBackground", label: "Cultural Background", placeholder: "Cultural heritage, ethnicity, traditions" },
      { key: "timePeriod", label: "Time Period", placeholder: "Era they inhabit" },
      { key: "familyStructure", label: "Family Structure", placeholder: "Family composition and dynamics" },
      { key: "parentalRelationships", label: "Parental Relationships", placeholder: "Relationship with parents/guardians" },
      { key: "siblings", label: "Siblings", placeholder: "Brothers, sisters, birth order" },
      { key: "familyDynamics", label: "Family Dynamics", placeholder: "Power dynamics, conflicts, bonds" },
      { key: "attachmentStyle", label: "Attachment Style", placeholder: "Secure, anxious, avoidant…" },
      { key: "education", label: "Education", placeholder: "Schooling, training, self-taught skills" },
      { key: "mentors", label: "Mentors", placeholder: "Key teachers, role models, influences" },
      { key: "intellectualCuriosity", label: "Intellectual Curiosity", placeholder: "What fascinates them, how they learn" },
      { key: "socioeconomicClass", label: "Socioeconomic Class", placeholder: "Wealth, social standing" },
      { key: "economicContext", label: "Economic Context", placeholder: "Financial pressures, opportunities" },
    ],
  },
  {
    key: "formativeEvents",
    title: "Formative Events",
    fields: [
      { key: "keyLifeChangingMoments", label: "Key Life-Changing Moments", placeholder: "Events that fundamentally shaped who they are" },
      { key: "traumasAndWounds", label: "Traumas & Wounds", placeholder: "Painful experiences they carry" },
      { key: "achievementsAndVictories", label: "Achievements & Victories", placeholder: "Proud accomplishments" },
      { key: "definingRelationships", label: "Defining Relationships", placeholder: "People who left a deep mark" },
      { key: "turningPoints", label: "Turning Points", placeholder: "Moments where their path changed direction" },
    ],
  },
  {
    key: "psychology",
    title: "Psychology",
    fields: [
      { key: "corePersonalityTraits", label: "Core Personality Traits", placeholder: "Dominant traits (e.g. stubborn, empathetic, calculating)" },
      { key: "emotionalPatterns", label: "Emotional Patterns", placeholder: "How they typically process and express emotions" },
      { key: "cognitiveStyle", label: "Cognitive Style", placeholder: "How they think, analyze, and make decisions" },
      { key: "defenseMechanisms", label: "Defense Mechanisms", placeholder: "How they protect themselves psychologically" },
      { key: "shadowSide", label: "Shadow Side", placeholder: "Hidden or repressed aspects of personality" },
    ],
  },
  {
    key: "innerWorld",
    title: "Inner World",
    fields: [
      { key: "coreBeliefs", label: "Core Beliefs", placeholder: "Fundamental beliefs about the world and themselves" },
      { key: "moralCompass", label: "Moral Compass", placeholder: "Where they draw ethical lines" },
      { key: "fearsAndInsecurities", label: "Fears & Insecurities", placeholder: "What keeps them up at night" },
      { key: "dreamsAndAspirations", label: "Dreams & Aspirations", placeholder: "What they hope for, secretly or openly" },
      { key: "innerMonologueStyle", label: "Inner Monologue Style", placeholder: "How their internal voice sounds" },
    ],
  },
  {
    key: "motivations",
    title: "Motivations",
    fields: [
      { key: "superObjective", label: "Super-Objective", placeholder: "The overarching goal driving their life" },
      { key: "consciousWantsVsUnconsciousNeeds", label: "Conscious Wants vs Unconscious Needs", placeholder: "What they say they want vs what they truly need" },
      { key: "whatTheydSacrificeEverythingFor", label: "What They'd Sacrifice Everything For", placeholder: "The one thing above all else" },
      { key: "whatSuccessMeans", label: "What Success Means", placeholder: "Their personal definition of success" },
    ],
  },
  {
    key: "behavior",
    title: "Behavior",
    fields: [
      { key: "communicationStyle", label: "Communication Style", placeholder: "How they speak and listen in conversation" },
      { key: "physicalPresence", label: "Physical Presence", placeholder: "How they carry themselves, gestures, posture" },
      { key: "interactionPatterns", label: "Interaction Patterns", placeholder: "How they behave in groups, one-on-one, with strangers" },
      { key: "underPressure", label: "Under Pressure", placeholder: "How they react when stressed or threatened" },
      { key: "habitualBehaviors", label: "Habitual Behaviors", placeholder: "Recurring habits, tics, rituals" },
    ],
  },
  {
    key: "voice",
    title: "Voice",
    fields: [
      { key: "vocabularyLevel", label: "Vocabulary Level", placeholder: "Simple, academic, slang-heavy, poetic…" },
      { key: "speechPatterns", label: "Speech Patterns", placeholder: "Sentence length, rhythm, verbal quirks" },
      { key: "toneRange", label: "Tone Range", placeholder: "From formal to casual, when and how they shift" },
      { key: "storytellingStyle", label: "Storytelling Style", placeholder: "How they recount events, anecdotes" },
      { key: "argumentationStyle", label: "Argumentation Style", placeholder: "How they persuade, debate, or avoid conflict" },
    ],
  },
];

export default function NewActorClient() {
  const params = useParams();
  const worldId = params.id as string;

  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [sections, setSections] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const s of SECTIONS) {
      init[s.key] = {};
      for (const f of s.fields) init[s.key][f.key] = "";
    }
    return init;
  });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [coldStart, setColdStart] = useState(false);

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function updateField(section: string, field: string, value: string) {
    setSections((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  }

  function filledCount(sectionKey: string): number {
    const s = sections[sectionKey];
    return s ? Object.values(s).filter((v) => v.trim()).length : 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setColdStart(false);

    // Build body, only including sections that have at least one field filled
    const body: Record<string, unknown> = { name, summary };
    for (const s of SECTIONS) {
      const filled: Record<string, string> = {};
      let hasValue = false;
      for (const f of s.fields) {
        const val = sections[s.key][f.key]?.trim();
        if (val) {
          filled[f.key] = val;
          hasValue = true;
        }
      }
      if (hasValue) body[s.key] = filled;
    }

    try {
      const res = await authFetch(`/api/worlds/${worldId}/actors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, { onColdStart: () => setColdStart(true) });

      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === "string" ? data.error : "Failed to create actor");
        return;
      }

      const actor = await res.json();
      window.location.href = `/worlds/${worldId}/actors/${actor.id}`;
    } catch {
      setError("Unable to connect to server. Please try again.");
    } finally {
      setLoading(false);
      setColdStart(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <a href={`/worlds/${worldId}`} className="text-2xl text-secondary hover:opacity-80 transition-opacity">
          The Casting Room
        </a>
      </header>

      <div className="flex justify-center px-4 py-8">
        <div className="w-full max-w-3xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl text-secondary">Create a New Actor</CardTitle>
              <CardDescription>
                Define your character. Only the name is required — fill out other sections as you develop them.
              </CardDescription>
            </CardHeader>
          </Card>

          <form onSubmit={handleSubmit} className="space-y-4">
            {coldStart && (
              <p className="text-sm text-muted-foreground text-center animate-pulse">
                Waking up the server… this may take a moment.
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            {/* Name & Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    Actor Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="name"
                    placeholder="e.g. Eleanor Vance, Marcus Blackwood"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={200}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="summary" className="text-sm font-medium">Summary</label>
                  <textarea
                    id="summary"
                    className={textareaClass}
                    placeholder="A brief overview of who this character is"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    maxLength={2000}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Profile sections (collapsible) */}
            {SECTIONS.map((section) => {
              const isOpen = openSections[section.key];
              const filled = filledCount(section.key);
              return (
                <Card key={section.key}>
                  <CardHeader
                    className="cursor-pointer select-none"
                    onClick={() => toggleSection(section.key)}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                      <div className="flex items-center gap-2">
                        {filled > 0 && (
                          <span className="text-xs text-secondary">
                            {filled}/{section.fields.length} filled
                          </span>
                        )}
                        <span className="text-muted-foreground text-sm">
                          {isOpen ? "▾" : "▸"}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  {isOpen && (
                    <CardContent className="space-y-4">
                      {section.fields.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-sm font-medium text-muted-foreground">
                            {field.label}
                          </label>
                          <textarea
                            className={textareaClass + " min-h-[60px]"}
                            placeholder={field.placeholder}
                            value={sections[section.key][field.key]}
                            onChange={(e) => updateField(section.key, field.key, e.target.value)}
                          />
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })}

            <div className="flex gap-4">
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Creating…" : "Create Actor"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <a href={`/worlds/${worldId}`}>Cancel</a>
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
