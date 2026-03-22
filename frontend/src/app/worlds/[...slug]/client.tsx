"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authFetch, getUser, logout } from "@/lib/auth";

/* ───────────────────────────────────────────
   ROUTER — parse slug, delegate to sub-view
   ─────────────────────────────────────────── */

export default function WorldRouterClient() {
  // In static export + SWA rewrite, useParams() returns the build-time placeholder
  // ("_"), not the actual URL. Parse the real slug from window.location.pathname.
  const [slug, setSlug] = useState<string[]>([]);

  useEffect(() => {
    const segments = window.location.pathname
      .replace(/^\/worlds\//, "")
      .split("/")
      .filter(Boolean);
    setSlug(segments);
  }, []);

  const worldId = slug[0];

  // Still parsing the URL
  if (slug.length === 0) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="container py-8 text-center">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </main>
    );
  }

  if (slug.length === 1) {
    return <WorldDetail worldId={worldId} />;
  }

  if (slug[1] === "actors") {
    if (slug[2] === "new") return <NewActor worldId={worldId} />;
    if (slug[2]) return <ActorDetail worldId={worldId} actorId={slug[2]} />;
  }

  if (slug[1] === "auditions") {
    if (slug[2] === "new") return <NewAuditionView worldId={worldId} />;
    if (slug[2]) return <AuditionChat worldId={worldId} sessionId={slug[2]} />;
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-destructive mb-4">Page not found</p>
        <Button asChild><a href="/dashboard">Dashboard</a></Button>
      </div>
    </main>
  );
}

/* ───────────────────────────────────────────
   SHARED HEADER
   ─────────────────────────────────────────── */

function Header({ backHref }: { backHref?: string }) {
  const user = getUser();
  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between">
      <a href={backHref || "/dashboard"} className="text-2xl text-secondary hover:opacity-80 transition-opacity">
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

/* ═══════════════════════════════════════════
   1. WORLD DETAIL
   ═══════════════════════════════════════════ */

interface WorldData {
  id: string;
  name: string;
  description: string;
  genre: string;
  defaultModel: string;
  toneGuidelines: string;
  userRole: string;
  createdAt: string;
}

interface ActorSummary {
  id: string;
  name: string;
  summary: string;
}

interface AuditionSummary {
  id: string;
  actorId: string;
  model: string;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
}

function WorldDetail({ worldId }: { worldId: string }) {
  const [world, setWorld] = useState<WorldData | null>(null);
  const [actors, setActors] = useState<ActorSummary[]>([]);
  const [auditions, setAuditions] = useState<AuditionSummary[]>([]);
  const [actorMap, setActorMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editGenre, setEditGenre] = useState("");
  const [editTone, setEditTone] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = world?.userRole === "owner" || world?.userRole === "editor";
  const canDelete = world?.userRole === "owner";

  useEffect(() => {
    async function load() {
      const opts = { onColdStart: () => setColdStart(true) };
      try {
        const [worldRes, actorsRes, auditionsRes] = await Promise.all([
          authFetch(`/api/worlds/${worldId}`, {}, opts),
          authFetch(`/api/worlds/${worldId}/actors`, {}, opts),
          authFetch(`/api/worlds/${worldId}/auditions`, {}, opts),
        ]);
        if (worldRes.ok) {
          const w = await worldRes.json();
          setWorld(w);
          setEditName(w.name);
          setEditDescription(w.description);
          setEditGenre(w.genre);
          setEditTone(w.toneGuidelines);
        } else {
          const errData = await worldRes.json().catch(() => null);
          const msg = errData?.error || `Server error (${worldRes.status})`;
          setError(msg);
        }
        if (actorsRes.ok) {
          const a = await actorsRes.json();
          const list = a.actors || a || [];
          setActors(list);
          const map: Record<string, string> = {};
          for (const actor of list) map[actor.id] = actor.name;
          setActorMap(map);
        }
        if (auditionsRes.ok) {
          const au = await auditionsRes.json();
          setAuditions(au.auditions || au || []);
        }
      } catch {
        setError("Unable to connect to server.");
      } finally {
        setLoading(false);
        setColdStart(false);
      }
    }
    load();
  }, [worldId]);

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authFetch(`/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, description: editDescription, genre: editGenre, toneGuidelines: editTone }),
      });
      if (res.ok) {
        const updated = await res.json();
        setWorld(updated);
        setEditing(false);
      }
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await authFetch(`/api/worlds/${worldId}`, { method: "DELETE" });
      if (res.ok) window.location.href = "/dashboard";
    } catch { /* ignore */ } finally { setDeleting(false); }
  }

  if (loading) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="container py-8 text-center">
          {coldStart && <p className="text-sm text-muted-foreground animate-pulse mb-4">Waking up the server… this may take a moment.</p>}
          <p className="text-muted-foreground">Loading world…</p>
        </div>
      </main>
    );
  }

  if (error || !world) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="container py-8 text-center">
          <p className="text-destructive">{error || "World not found."}</p>
          <Button asChild className="mt-4"><a href="/dashboard">Back to Dashboard</a></Button>
        </div>
      </main>
    );
  }

  const ta = "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <main className="min-h-screen">
      <Header />
      <div className="container py-8 space-y-8">
        <section>
          {editing ? (
            <Card>
              <form onSubmit={handleSaveEdit}>
                <CardHeader><CardTitle className="text-2xl text-secondary">Edit World</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="editName" className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
                    <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} required maxLength={200} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="editGenre" className="text-sm font-medium">Genre</label>
                    <Input id="editGenre" value={editGenre} onChange={(e) => setEditGenre(e.target.value)} maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="editDesc" className="text-sm font-medium">Description</label>
                    <textarea id="editDesc" className={ta + " min-h-[100px]"} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={2000} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="editTone" className="text-sm font-medium">Tone Guidelines</label>
                    <textarea id="editTone" className={ta} value={editTone} onChange={(e) => setEditTone(e.target.value)} maxLength={2000} />
                  </div>
                </CardContent>
                <div className="flex gap-2 px-6 pb-6">
                  <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-3xl text-secondary">{world.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {world.genre && <span className="mr-3">{world.genre}</span>}
                      <span className="text-xs bg-muted px-2 py-0.5 rounded">{world.userRole}</span>
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {canEdit && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>}
                    {canDelete && !confirmDelete && <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>}
                    {confirmDelete && (
                      <>
                        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting…" : "Confirm Delete"}</Button>
                        <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {world.description && <p className="text-sm text-muted-foreground">{world.description}</p>}
                {world.toneGuidelines && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Tone</p>
                    <p className="text-sm">{world.toneGuidelines}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Model: {world.defaultModel}</p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Actors */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl">Actors</h2>
            {canEdit && <Button asChild><a href={`/worlds/${worldId}/actors/new`}>Create Actor</a></Button>}
          </div>
          {actors.length === 0 ? (
            <Card><CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-4">No actors yet.</p>
              {canEdit && <Button asChild><a href={`/worlds/${worldId}/actors/new`}>Create Your First Actor</a></Button>}
            </CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {actors.map((actor) => (
                <a key={actor.id} href={`/worlds/${worldId}/actors/${actor.id}`}>
                  <Card className="hover:border-secondary/50 transition-colors cursor-pointer h-full">
                    <CardHeader><CardTitle className="text-lg">{actor.name}</CardTitle></CardHeader>
                    {actor.summary && <CardContent><p className="text-sm text-muted-foreground line-clamp-3">{actor.summary}</p></CardContent>}
                  </Card>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Auditions */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl">Auditions</h2>
            {canEdit && actors.length > 0 && <Button asChild><a href={`/worlds/${worldId}/auditions/new`}>Start Audition</a></Button>}
          </div>
          {auditions.length === 0 ? (
            <Card><CardContent className="py-8 text-center">
              <p className="text-muted-foreground">{actors.length === 0 ? "Create an actor first, then start an audition." : "No auditions yet. Start one to test your actors."}</p>
            </CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {auditions.map((a) => (
                <a key={a.id} href={`/worlds/${worldId}/auditions/${a.id}`}>
                  <Card className="hover:border-secondary/50 transition-colors cursor-pointer h-full">
                    <CardHeader>
                      <CardTitle className="text-lg">{actorMap[a.actorId] || "Unknown Actor"}</CardTitle>
                      <CardDescription>{a.turnCount} {a.turnCount === 1 ? "message" : "messages"}</CardDescription>
                    </CardHeader>
                    <CardContent><p className="text-xs text-muted-foreground">{new Date(a.updatedAt || a.createdAt).toLocaleDateString()}</p></CardContent>
                  </Card>
                </a>
              ))}
            </div>
          )}
        </section>

        <div className="pt-4">
          <Button variant="ghost" asChild><a href="/dashboard">← Back to Dashboard</a></Button>
        </div>
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════
   2. NEW ACTOR
   ═══════════════════════════════════════════ */

const textareaClass =
  "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface SectionField { key: string; label: string; placeholder: string; }

const SECTIONS: { key: string; title: string; fields: SectionField[] }[] = [
  {
    key: "identity", title: "Identity & Background",
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
    key: "formativeEvents", title: "Formative Events",
    fields: [
      { key: "keyLifeChangingMoments", label: "Key Life-Changing Moments", placeholder: "Events that fundamentally shaped who they are" },
      { key: "traumasAndWounds", label: "Traumas & Wounds", placeholder: "Painful experiences they carry" },
      { key: "achievementsAndVictories", label: "Achievements & Victories", placeholder: "Proud accomplishments" },
      { key: "definingRelationships", label: "Defining Relationships", placeholder: "People who left a deep mark" },
      { key: "turningPoints", label: "Turning Points", placeholder: "Moments where their path changed direction" },
    ],
  },
  {
    key: "psychology", title: "Psychology",
    fields: [
      { key: "corePersonalityTraits", label: "Core Personality Traits", placeholder: "Dominant traits (e.g. stubborn, empathetic, calculating)" },
      { key: "emotionalPatterns", label: "Emotional Patterns", placeholder: "How they typically process and express emotions" },
      { key: "cognitiveStyle", label: "Cognitive Style", placeholder: "How they think, analyze, and make decisions" },
      { key: "defenseMechanisms", label: "Defense Mechanisms", placeholder: "How they protect themselves psychologically" },
      { key: "shadowSide", label: "Shadow Side", placeholder: "Hidden or repressed aspects of personality" },
    ],
  },
  {
    key: "innerWorld", title: "Inner World",
    fields: [
      { key: "coreBeliefs", label: "Core Beliefs", placeholder: "Fundamental beliefs about the world and themselves" },
      { key: "moralCompass", label: "Moral Compass", placeholder: "Where they draw ethical lines" },
      { key: "fearsAndInsecurities", label: "Fears & Insecurities", placeholder: "What keeps them up at night" },
      { key: "dreamsAndAspirations", label: "Dreams & Aspirations", placeholder: "What they hope for, secretly or openly" },
      { key: "innerMonologueStyle", label: "Inner Monologue Style", placeholder: "How their internal voice sounds" },
    ],
  },
  {
    key: "motivations", title: "Motivations",
    fields: [
      { key: "superObjective", label: "Super-Objective", placeholder: "The overarching goal driving their life" },
      { key: "consciousWantsVsUnconsciousNeeds", label: "Conscious Wants vs Unconscious Needs", placeholder: "What they say they want vs what they truly need" },
      { key: "whatTheydSacrificeEverythingFor", label: "What They'd Sacrifice Everything For", placeholder: "The one thing above all else" },
      { key: "whatSuccessMeans", label: "What Success Means", placeholder: "Their personal definition of success" },
    ],
  },
  {
    key: "behavior", title: "Behavior",
    fields: [
      { key: "communicationStyle", label: "Communication Style", placeholder: "How they speak and listen in conversation" },
      { key: "physicalPresence", label: "Physical Presence", placeholder: "How they carry themselves, gestures, posture" },
      { key: "interactionPatterns", label: "Interaction Patterns", placeholder: "How they behave in groups, one-on-one, with strangers" },
      { key: "underPressure", label: "Under Pressure", placeholder: "How they react when stressed or threatened" },
      { key: "habitualBehaviors", label: "Habitual Behaviors", placeholder: "Recurring habits, tics, rituals" },
    ],
  },
  {
    key: "voice", title: "Voice",
    fields: [
      { key: "vocabularyLevel", label: "Vocabulary Level", placeholder: "Simple, academic, slang-heavy, poetic…" },
      { key: "speechPatterns", label: "Speech Patterns", placeholder: "Sentence length, rhythm, verbal quirks" },
      { key: "toneRange", label: "Tone Range", placeholder: "From formal to casual, when and how they shift" },
      { key: "storytellingStyle", label: "Storytelling Style", placeholder: "How they recount events, anecdotes" },
      { key: "argumentationStyle", label: "Argumentation Style", placeholder: "How they persuade, debate, or avoid conflict" },
    ],
  },
];

function NewActor({ worldId }: { worldId: string }) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [sections, setSections] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const s of SECTIONS) { init[s.key] = {}; for (const f of s.fields) init[s.key][f.key] = ""; }
    return init;
  });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [coldStart, setColdStart] = useState(false);

  function toggleSection(key: string) { setOpenSections((prev) => ({ ...prev, [key]: !prev[key] })); }
  function updateField(section: string, field: string, value: string) {
    setSections((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  }
  function filledCount(sectionKey: string): number {
    const s = sections[sectionKey]; return s ? Object.values(s).filter((v) => v.trim()).length : 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true); setColdStart(false);
    const body: Record<string, unknown> = { name, summary };
    for (const s of SECTIONS) {
      const filled: Record<string, string> = {};
      let hasValue = false;
      for (const f of s.fields) { const val = sections[s.key][f.key]?.trim(); if (val) { filled[f.key] = val; hasValue = true; } }
      if (hasValue) body[s.key] = filled;
    }
    try {
      const res = await authFetch(`/api/worlds/${worldId}/actors`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }, { onColdStart: () => setColdStart(true) });
      if (!res.ok) { const data = await res.json(); setError(typeof data.error === "string" ? data.error : "Failed to create actor"); return; }
      const actor = await res.json();
      window.location.href = `/worlds/${worldId}/actors/${actor.id}`;
    } catch { setError("Unable to connect to server. Please try again."); } finally { setLoading(false); setColdStart(false); }
  }

  return (
    <main className="min-h-screen">
      <Header backHref={`/worlds/${worldId}`} />
      <div className="flex justify-center px-4 py-8">
        <div className="w-full max-w-3xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl text-secondary">Create a New Actor</CardTitle>
              <CardDescription>Define your character. Only the name is required — fill out other sections as you develop them.</CardDescription>
            </CardHeader>
          </Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            {coldStart && <p className="text-sm text-muted-foreground text-center animate-pulse">Waking up the server… this may take a moment.</p>}
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Card>
              <CardHeader><CardTitle className="text-lg">Basics</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">Actor Name <span className="text-destructive">*</span></label>
                  <Input id="name" placeholder="e.g. Eleanor Vance, Marcus Blackwood" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
                </div>
                <div className="space-y-2">
                  <label htmlFor="summary" className="text-sm font-medium">Summary</label>
                  <textarea id="summary" className={textareaClass} placeholder="A brief overview of who this character is" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} />
                </div>
              </CardContent>
            </Card>
            {SECTIONS.map((section) => {
              const isOpen = openSections[section.key];
              const filled = filledCount(section.key);
              return (
                <Card key={section.key}>
                  <CardHeader className="cursor-pointer select-none" onClick={() => toggleSection(section.key)}>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                      <div className="flex items-center gap-2">
                        {filled > 0 && <span className="text-xs text-secondary">{filled}/{section.fields.length} filled</span>}
                        <span className="text-muted-foreground text-sm">{isOpen ? "▾" : "▸"}</span>
                      </div>
                    </div>
                  </CardHeader>
                  {isOpen && (
                    <CardContent className="space-y-4">
                      {section.fields.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-sm font-medium text-muted-foreground">{field.label}</label>
                          <textarea className={textareaClass + " min-h-[60px]"} placeholder={field.placeholder} value={sections[section.key][field.key]} onChange={(e) => updateField(section.key, field.key, e.target.value)} />
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })}
            <div className="flex gap-4">
              <Button type="submit" className="flex-1" disabled={loading}>{loading ? "Creating…" : "Create Actor"}</Button>
              <Button type="button" variant="outline" asChild><a href={`/worlds/${worldId}`}>Cancel</a></Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════
   3. ACTOR DETAIL
   ═══════════════════════════════════════════ */

interface ProfileSection { key: string; title: string; fields: { key: string; label: string }[] }

const VIEW_SECTIONS: ProfileSection[] = SECTIONS.map((s) => ({
  key: s.key, title: s.title, fields: s.fields.map((f) => ({ key: f.key, label: f.label })),
}));

type Actor = Record<string, unknown>;

function ActorDetail({ worldId, actorId }: { worldId: string; actorId: string }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [userRole, setUserRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editSections, setEditSections] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

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
        if (worldRes.ok) { const w = await worldRes.json(); setUserRole(w.userRole || ""); }
        if (actorRes.ok) { const a = await actorRes.json(); setActor(a); populateEdit(a); }
        else setError("Actor not found or access denied.");
      } catch { setError("Unable to connect to server."); } finally { setLoading(false); setColdStart(false); }
    }
    load();
  }, [worldId, actorId]);

  function populateEdit(a: Actor) {
    setEditName((a.name as string) || "");
    setEditSummary((a.summary as string) || "");
    const s: Record<string, Record<string, string>> = {};
    for (const sec of VIEW_SECTIONS) {
      s[sec.key] = {};
      const secData = (a[sec.key] || {}) as Record<string, string>;
      for (const f of sec.fields) s[sec.key][f.key] = secData[f.key] || "";
    }
    setEditSections(s);
  }

  function updateEditField(section: string, field: string, value: string) {
    setEditSections((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = { name: editName, summary: editSummary };
    for (const sec of VIEW_SECTIONS) {
      const filled: Record<string, string> = {};
      let hasValue = false;
      for (const f of sec.fields) { const val = editSections[sec.key]?.[f.key]?.trim(); if (val) { filled[f.key] = val; hasValue = true; } }
      if (hasValue) body[sec.key] = filled;
    }
    try {
      const res = await authFetch(`/api/worlds/${worldId}/actors/${actorId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) { const updated = await res.json(); setActor(updated); populateEdit(updated); setEditing(false); }
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await authFetch(`/api/worlds/${worldId}/actors/${actorId}`, { method: "DELETE" });
      if (res.ok) window.location.href = `/worlds/${worldId}`;
    } catch { /* ignore */ } finally { setDeleting(false); }
  }

  if (loading) {
    return (
      <main className="min-h-screen"><Header /><div className="container py-8 text-center">
        {coldStart && <p className="text-sm text-muted-foreground animate-pulse mb-4">Waking up the server…</p>}
        <p className="text-muted-foreground">Loading actor…</p>
      </div></main>
    );
  }

  if (error || !actor) {
    return (
      <main className="min-h-screen"><Header /><div className="container py-8 text-center">
        <p className="text-destructive">{error || "Actor not found."}</p>
        <Button asChild className="mt-4"><a href={`/worlds/${worldId}`}>Back to World</a></Button>
      </div></main>
    );
  }

  if (!editing) {
    return (
      <main className="min-h-screen">
        <Header />
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
                      <Button asChild size="sm"><a href={`/worlds/${worldId}/auditions/new?actorId=${actorId}`}>Audition</a></Button>
                      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                    </>
                  )}
                  {canEdit && !confirmDelete && <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>}
                  {confirmDelete && (
                    <>
                      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting…" : "Confirm"}</Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>
          {VIEW_SECTIONS.map((sec) => {
            const data = (actor[sec.key] || {}) as Record<string, string>;
            const filledFields = sec.fields.filter((f) => data[f.key]?.trim());
            if (filledFields.length === 0) return null;
            return (
              <Card key={sec.key}>
                <CardHeader><CardTitle className="text-lg">{sec.title}</CardTitle></CardHeader>
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
          <Button variant="ghost" asChild><a href={`/worlds/${worldId}`}>← Back to World</a></Button>
        </div>
      </main>
    );
  }

  // EDIT MODE
  return (
    <main className="min-h-screen">
      <Header />
      <div className="container py-8">
        <form onSubmit={handleSave} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-2xl text-secondary">Edit Actor</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} required maxLength={200} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Summary</label>
                <textarea className={textareaClass + " min-h-[60px]"} value={editSummary} onChange={(e) => setEditSummary(e.target.value)} maxLength={2000} />
              </div>
            </CardContent>
          </Card>
          {VIEW_SECTIONS.map((sec) => (
            <Card key={sec.key}>
              <CardHeader><CardTitle className="text-lg">{sec.title}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {sec.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">{f.label}</label>
                    <textarea className={textareaClass + " min-h-[60px]"} value={editSections[sec.key]?.[f.key] || ""} onChange={(e) => updateEditField(sec.key, f.key, e.target.value)} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          <div className="flex gap-4">
            <Button type="submit" className="flex-1" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
            <Button type="button" variant="outline" onClick={() => { setEditing(false); populateEdit(actor); }}>Cancel</Button>
          </div>
        </form>
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════
   4. NEW AUDITION
   ═══════════════════════════════════════════ */

interface ActorOption { id: string; name: string; summary: string }

function NewAuditionView({ worldId }: { worldId: string }) {
  const searchParams = useSearchParams();
  const preselectedActorId = searchParams.get("actorId") || "";

  const [actors, setActors] = useState<ActorOption[]>([]);
  const [actorId, setActorId] = useState(preselectedActorId);
  const [sceneSetup, setSceneSetup] = useState("");
  const [loadingActors, setLoadingActors] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadActors() {
      try {
        const res = await authFetch(`/api/worlds/${worldId}/actors`, {}, { onColdStart: () => setColdStart(true) });
        if (res.ok) {
          const data = await res.json();
          const list = data.actors || data || [];
          setActors(list);
          if (preselectedActorId && list.some((a: ActorOption) => a.id === preselectedActorId)) setActorId(preselectedActorId);
          else if (list.length > 0) setActorId(list[0].id);
        }
      } catch { setError("Unable to load actors."); } finally { setLoadingActors(false); setColdStart(false); }
    }
    loadActors();
  }, [worldId, preselectedActorId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!actorId) { setError("Select an actor."); return; }
    setError(""); setSubmitting(true); setColdStart(false);
    try {
      const res = await authFetch(`/api/worlds/${worldId}/auditions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId, sceneSetup }),
      }, { onColdStart: () => setColdStart(true) });
      if (!res.ok) { const data = await res.json(); setError(typeof data.error === "string" ? data.error : "Failed to start audition"); return; }
      const session = await res.json();
      window.location.href = `/worlds/${worldId}/auditions/${session.id}`;
    } catch { setError("Unable to connect to server."); } finally { setSubmitting(false); setColdStart(false); }
  }

  const selectedActor = actors.find((a) => a.id === actorId);

  return (
    <main className="min-h-screen">
      <Header backHref={`/worlds/${worldId}`} />
      <div className="flex justify-center px-4 py-8">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-3xl text-secondary">Start an Audition</CardTitle>
            <CardDescription>Choose an actor and set the scene for your conversation</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {coldStart && <p className="text-sm text-muted-foreground text-center animate-pulse">Waking up the server… this may take a moment.</p>}
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              <div className="space-y-2">
                <label htmlFor="actor" className="text-sm font-medium">Actor <span className="text-destructive">*</span></label>
                {loadingActors ? <p className="text-sm text-muted-foreground">Loading actors…</p> : actors.length === 0 ? (
                  <div><p className="text-sm text-muted-foreground mb-2">No actors in this world yet.</p><Button asChild size="sm"><a href={`/worlds/${worldId}/actors/new`}>Create an Actor First</a></Button></div>
                ) : (
                  <select id="actor" className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={actorId} onChange={(e) => setActorId(e.target.value)} required>
                    {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
                {selectedActor?.summary && <p className="text-xs text-muted-foreground mt-1">{selectedActor.summary}</p>}
              </div>
              <div className="space-y-2">
                <label htmlFor="scene" className="text-sm font-medium">Scene Setup</label>
                <textarea id="scene" className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Describe the scenario, setting, and context for this audition…" value={sceneSetup} onChange={(e) => setSceneSetup(e.target.value)} maxLength={5000} />
                <p className="text-xs text-muted-foreground">{sceneSetup.length}/5000</p>
              </div>
            </CardContent>
            <div className="flex gap-4 px-6 pb-6">
              <Button type="submit" className="flex-1" disabled={submitting || actors.length === 0}>{submitting ? "Starting…" : "Begin Audition"}</Button>
              <Button type="button" variant="outline" asChild><a href={`/worlds/${worldId}`}>Cancel</a></Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════
   5. AUDITION CHAT
   ═══════════════════════════════════════════ */

interface Turn { role: "user" | "assistant"; content: string; timestamp: string }
interface SessionData { id: string; worldId: string; actorId: string; sceneSetup: string; model: string; turns: Turn[]; createdAt: string }

function AuditionChat({ worldId, sessionId }: { worldId: string; sessionId: string }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [actorName, setActorName] = useState("Character");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const [error, setError] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const user = getUser();

  useEffect(() => {
    async function load() {
      const opts = { onColdStart: () => setColdStart(true) };
      try {
        const res = await authFetch(`/api/worlds/${worldId}/auditions/${sessionId}`, {}, opts);
        if (!res.ok) { setError("Session not found or access denied."); return; }
        const data = await res.json();
        setSession(data);
        setTurns(data.turns || []);
        try {
          const actorRes = await authFetch(`/api/worlds/${worldId}/actors/${data.actorId}`);
          if (actorRes.ok) { const actor = await actorRes.json(); setActorName(actor.name); }
        } catch { /* fallback */ }
      } catch { setError("Unable to connect to server."); } finally { setLoading(false); setColdStart(false); }
    }
    load();
  }, [worldId, sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const content = message.trim();
    if (!content || sending) return;
    setMessage(""); setSending(true); setColdStart(false);
    const userTurn: Turn = { role: "user", content, timestamp: new Date().toISOString() };
    setTurns((prev) => [...prev, userTurn]);
    try {
      const res = await authFetch(`/api/worlds/${worldId}/auditions/${sessionId}/message`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
      }, { onColdStart: () => setColdStart(true) });
      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === "string" ? data.error : "Failed to send message");
        setTurns((prev) => prev.slice(0, -1)); setMessage(content); return;
      }
      const data = await res.json();
      setTurns((prev) => [...prev.slice(0, -1), data.userMessage, data.assistantMessage]);
    } catch { setError("Unable to connect to server."); setTurns((prev) => prev.slice(0, -1)); setMessage(content); }
    finally { setSending(false); setColdStart(false); inputRef.current?.focus(); }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col">
        <ChatHeader user={user} worldId={worldId} />
        <div className="flex-1 flex items-center justify-center">
          {coldStart ? <p className="text-sm text-muted-foreground animate-pulse">Waking up the server…</p> : <p className="text-muted-foreground">Loading conversation…</p>}
        </div>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="min-h-screen flex flex-col">
        <ChatHeader user={user} worldId={worldId} />
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <p className="text-destructive">{error}</p>
          <Button asChild><a href={`/worlds/${worldId}`}>Back to World</a></Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      <ChatHeader user={user} worldId={worldId} />
      <div className="border-b border-border px-6 py-3 flex items-center justify-between bg-muted/30">
        <div>
          <h2 className="text-lg font-semibold text-secondary">{actorName}</h2>
          {session?.sceneSetup && <p className="text-xs text-muted-foreground line-clamp-1 max-w-xl">{session.sceneSetup}</p>}
        </div>
        <div className="text-xs text-muted-foreground">{turns.length} {turns.length === 1 ? "message" : "messages"} · {session?.model}</div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {turns.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <p>Begin the audition. Send a message to start the conversation.</p>
            {session?.sceneSetup && (
              <Card className="mt-4 max-w-xl mx-auto text-left">
                <CardHeader><CardTitle className="text-sm">Scene</CardTitle></CardHeader>
                <CardContent><p className="text-sm whitespace-pre-wrap">{session.sceneSetup}</p></CardContent>
              </Card>
            )}
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-lg px-4 py-3 ${turn.role === "user" ? "bg-primary/20 text-foreground" : "bg-muted border border-border"}`}>
              <p className="text-xs font-medium mb-1 text-muted-foreground">{turn.role === "user" ? "You" : actorName}</p>
              <p className="text-sm whitespace-pre-wrap">{turn.content}</p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-muted border border-border rounded-lg px-4 py-3 max-w-[75%]">
              <p className="text-xs font-medium mb-1 text-muted-foreground">{actorName}</p>
              <p className="text-sm text-muted-foreground animate-pulse">{coldStart ? "Waking up the server…" : "Thinking…"}</p>
            </div>
          </div>
        )}
      </div>

      {error && session && <div className="px-6 py-2 text-center"><p className="text-sm text-destructive">{error}</p></div>}

      <div className="border-t border-border px-4 py-4">
        <form onSubmit={handleSend} className="flex gap-3 max-w-4xl mx-auto">
          <textarea ref={inputRef} className="flex-1 min-h-[48px] max-h-[200px] rounded-md border border-input bg-transparent px-3 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" placeholder={`Speak to ${actorName}…`} value={message} onChange={(e) => { setMessage(e.target.value); setError(""); }} onKeyDown={handleKeyDown} maxLength={10000} disabled={sending} rows={1} />
          <Button type="submit" disabled={sending || !message.trim()} className="self-end">{sending ? "…" : "Send"}</Button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-2">Press Enter to send, Shift+Enter for new line</p>
      </div>
    </main>
  );
}

function ChatHeader({ user, worldId }: { user: { displayName: string; role: string } | null; worldId: string }) {
  return (
    <header className="border-b border-border px-6 py-3 flex items-center justify-between">
      <a href={`/worlds/${worldId}`} className="text-xl text-secondary hover:opacity-80 transition-opacity">The Casting Room</a>
      <div className="flex items-center gap-4">
        {user && (
          <span className="text-sm text-muted-foreground">
            {user.displayName}
            {user.role === "admin" && <span className="ml-2 text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded">Admin</span>}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={logout}>Sign Out</Button>
      </div>
    </header>
  );
}
