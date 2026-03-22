"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authFetch, getUser, logout } from "@/lib/auth";

const textareaClass =
  "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface ProfileSection {
  key: string;
  title: string;
  fields: { key: string; label: string }[];
}

const SECTIONS: ProfileSection[] = [
  {
    key: "identity",
    title: "Identity & Background",
    fields: [
      { key: "fullName", label: "Full Name" },
      { key: "age", label: "Age" },
      { key: "genderIdentity", label: "Gender Identity" },
      { key: "physicalDescription", label: "Physical Description" },
      { key: "placeOfBirth", label: "Place of Birth" },
      { key: "culturalBackground", label: "Cultural Background" },
      { key: "timePeriod", label: "Time Period" },
      { key: "familyStructure", label: "Family Structure" },
      { key: "parentalRelationships", label: "Parental Relationships" },
      { key: "siblings", label: "Siblings" },
      { key: "familyDynamics", label: "Family Dynamics" },
      { key: "attachmentStyle", label: "Attachment Style" },
      { key: "education", label: "Education" },
      { key: "mentors", label: "Mentors" },
      { key: "intellectualCuriosity", label: "Intellectual Curiosity" },
      { key: "socioeconomicClass", label: "Socioeconomic Class" },
      { key: "economicContext", label: "Economic Context" },
    ],
  },
  {
    key: "formativeEvents",
    title: "Formative Events",
    fields: [
      { key: "keyLifeChangingMoments", label: "Key Life-Changing Moments" },
      { key: "traumasAndWounds", label: "Traumas & Wounds" },
      { key: "achievementsAndVictories", label: "Achievements & Victories" },
      { key: "definingRelationships", label: "Defining Relationships" },
      { key: "turningPoints", label: "Turning Points" },
    ],
  },
  {
    key: "psychology",
    title: "Psychology",
    fields: [
      { key: "corePersonalityTraits", label: "Core Personality Traits" },
      { key: "emotionalPatterns", label: "Emotional Patterns" },
      { key: "cognitiveStyle", label: "Cognitive Style" },
      { key: "defenseMechanisms", label: "Defense Mechanisms" },
      { key: "shadowSide", label: "Shadow Side" },
    ],
  },
  {
    key: "innerWorld",
    title: "Inner World",
    fields: [
      { key: "coreBeliefs", label: "Core Beliefs" },
      { key: "moralCompass", label: "Moral Compass" },
      { key: "fearsAndInsecurities", label: "Fears & Insecurities" },
      { key: "dreamsAndAspirations", label: "Dreams & Aspirations" },
      { key: "innerMonologueStyle", label: "Inner Monologue Style" },
    ],
  },
  {
    key: "motivations",
    title: "Motivations",
    fields: [
      { key: "superObjective", label: "Super-Objective" },
      { key: "consciousWantsVsUnconsciousNeeds", label: "Conscious Wants vs Unconscious Needs" },
      { key: "whatTheydSacrificeEverythingFor", label: "What They'd Sacrifice Everything For" },
      { key: "whatSuccessMeans", label: "What Success Means" },
    ],
  },
  {
    key: "behavior",
    title: "Behavior",
    fields: [
      { key: "communicationStyle", label: "Communication Style" },
      { key: "physicalPresence", label: "Physical Presence" },
      { key: "interactionPatterns", label: "Interaction Patterns" },
      { key: "underPressure", label: "Under Pressure" },
      { key: "habitualBehaviors", label: "Habitual Behaviors" },
    ],
  },
  {
    key: "voice",
    title: "Voice",
    fields: [
      { key: "vocabularyLevel", label: "Vocabulary Level" },
      { key: "speechPatterns", label: "Speech Patterns" },
      { key: "toneRange", label: "Tone Range" },
      { key: "storytellingStyle", label: "Storytelling Style" },
      { key: "argumentationStyle", label: "Argumentation Style" },
    ],
  },
];

type Actor = Record<string, unknown>;

export default function ActorDetailClient() {
  const params = useParams();
  const worldId = params.id as string;
  const actorId = params.actorId as string;

  const [actor, setActor] = useState<Actor | null>(null);
  const [userRole, setUserRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const [error, setError] = useState("");

  // Edit
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editSections, setEditSections] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = userRole === "owner" || userRole === "editor";

  useEffect(() => {
    async function load() {
      const opts = { onColdStart: () => setColdStart(true) };
      try {
        const [actorRes, worldRes] = await Promise.all([
          authFetch(`/api/worlds/${worldId}/actors/${actorId}`, {}, opts),
          authFetch(`/api/worlds/${worldId}`, {}, opts),
        ]);

        if (worldRes.ok) {
          const w = await worldRes.json();
          setUserRole(w.userRole || "");
        }

        if (actorRes.ok) {
          const a = await actorRes.json();
          setActor(a);
          populateEditState(a);
        } else {
          setError("Actor not found or access denied.");
        }
      } catch {
        setError("Unable to connect to server.");
      } finally {
        setLoading(false);
        setColdStart(false);
      }
    }
    load();
  }, [worldId, actorId]);

  function populateEditState(a: Actor) {
    setEditName((a.name as string) || "");
    setEditSummary((a.summary as string) || "");
    const s: Record<string, Record<string, string>> = {};
    for (const sec of SECTIONS) {
      s[sec.key] = {};
      const secData = (a[sec.key] || {}) as Record<string, string>;
      for (const f of sec.fields) {
        s[sec.key][f.key] = secData[f.key] || "";
      }
    }
    setEditSections(s);
  }

  function updateEditField(section: string, field: string, value: string) {
    setEditSections((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = { name: editName, summary: editSummary };
    for (const sec of SECTIONS) {
      const filled: Record<string, string> = {};
      let hasValue = false;
      for (const f of sec.fields) {
        const val = editSections[sec.key]?.[f.key]?.trim();
        if (val) { filled[f.key] = val; hasValue = true; }
      }
      if (hasValue) body[sec.key] = filled;
    }

    try {
      const res = await authFetch(`/api/worlds/${worldId}/actors/${actorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        setActor(updated);
        populateEditState(updated);
        setEditing(false);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await authFetch(`/api/worlds/${worldId}/actors/${actorId}`, { method: "DELETE" });
      if (res.ok) {
        window.location.href = `/worlds/${worldId}`;
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  const user = getUser();

  if (loading) {
    return (
      <main className="min-h-screen">
        <HeaderBar user={user} />
        <div className="container py-8 text-center">
          {coldStart && <p className="text-sm text-muted-foreground animate-pulse mb-4">Waking up the server…</p>}
          <p className="text-muted-foreground">Loading actor…</p>
        </div>
      </main>
    );
  }

  if (error || !actor) {
    return (
      <main className="min-h-screen">
        <HeaderBar user={user} />
        <div className="container py-8 text-center">
          <p className="text-destructive">{error || "Actor not found."}</p>
          <Button asChild className="mt-4"><a href={`/worlds/${worldId}`}>Back to World</a></Button>
        </div>
      </main>
    );
  }

  // VIEW MODE
  if (!editing) {
    return (
      <main className="min-h-screen">
        <HeaderBar user={user} />
        <div className="container py-8 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-3xl text-secondary">{String(actor.name || "")}</CardTitle>
                  {actor.summary ? <CardDescription className="mt-2 text-base">{String(actor.summary)}</CardDescription> : null}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {canEdit && (
                    <>
                      <Button asChild size="sm">
                        <a href={`/worlds/${worldId}/auditions/new?actorId=${actorId}`}>Audition</a>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                    </>
                  )}
                  {canEdit && !confirmDelete && (
                    <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>
                  )}
                  {confirmDelete && (
                    <>
                      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                        {deleting ? "Deleting…" : "Confirm"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          {SECTIONS.map((sec) => {
            const data = (actor[sec.key] || {}) as Record<string, string>;
            const filledFields = sec.fields.filter((f) => data[f.key]?.trim());
            if (filledFields.length === 0) return null;
            return (
              <Card key={sec.key}>
                <CardHeader>
                  <CardTitle className="text-lg">{sec.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {filledFields.map((f) => (
                    <div key={f.key}>
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">{f.label}</p>
                      <p className="text-sm whitespace-pre-wrap">{data[f.key]}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}

          <Button variant="ghost" asChild>
            <a href={`/worlds/${worldId}`}>← Back to World</a>
          </Button>
        </div>
      </main>
    );
  }

  // EDIT MODE
  return (
    <main className="min-h-screen">
      <HeaderBar user={user} />
      <div className="container py-8">
        <form onSubmit={handleSave} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-secondary">Edit Actor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} required maxLength={200} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Summary</label>
                <textarea className={textareaClass} value={editSummary} onChange={(e) => setEditSummary(e.target.value)} maxLength={2000} />
              </div>
            </CardContent>
          </Card>

          {SECTIONS.map((sec) => (
            <Card key={sec.key}>
              <CardHeader>
                <CardTitle className="text-lg">{sec.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sec.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">{f.label}</label>
                    <textarea
                      className={textareaClass}
                      value={editSections[sec.key]?.[f.key] || ""}
                      onChange={(e) => updateEditField(sec.key, f.key, e.target.value)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          <div className="flex gap-4">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setEditing(false); populateEditState(actor); }}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

function HeaderBar({ user }: { user: { displayName: string; role: string } | null }) {
  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between">
      <a href="/dashboard" className="text-2xl text-secondary hover:opacity-80 transition-opacity">
        The Casting Room
      </a>
      <div className="flex items-center gap-4">
        {user && (
          <span className="text-sm text-muted-foreground">
            {user.displayName}
            {user.role === "admin" && (
              <span className="ml-2 text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded">Admin</span>
            )}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={logout}>Sign Out</Button>
      </div>
    </header>
  );
}
