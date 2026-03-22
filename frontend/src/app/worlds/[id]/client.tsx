"use client";

import { useEffect, useState, type FormEvent } from "react";
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
import { authFetch, getUser, logout } from "@/lib/auth";

interface World {
  id: string;
  name: string;
  description: string;
  genre: string;
  defaultModel: string;
  toneGuidelines: string;
  userRole: string;
  createdAt: string;
}

interface Actor {
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

export default function WorldDetailClient() {
  const params = useParams();
  const worldId = params.id as string;

  const [world, setWorld] = useState<World | null>(null);
  const [actors, setActors] = useState<Actor[]>([]);
  const [auditions, setAuditions] = useState<AuditionSummary[]>([]);
  const [actorMap, setActorMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const [error, setError] = useState("");

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editGenre, setEditGenre] = useState("");
  const [editTone, setEditTone] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const user = getUser();
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
        } else if (worldRes.status === 404 || worldRes.status === 403) {
          setError("World not found or access denied.");
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
        body: JSON.stringify({
          name: editName,
          description: editDescription,
          genre: editGenre,
          toneGuidelines: editTone,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setWorld(updated);
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
      const res = await authFetch(`/api/worlds/${worldId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        window.location.href = "/dashboard";
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="container py-8 text-center">
          {coldStart && (
            <p className="text-sm text-muted-foreground animate-pulse mb-4">
              Waking up the server… this may take a moment.
            </p>
          )}
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
          <Button asChild className="mt-4">
            <a href="/dashboard">Back to Dashboard</a>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header />

      <div className="container py-8 space-y-8">
        {/* World info / edit */}
        <section>
          {editing ? (
            <Card>
              <form onSubmit={handleSaveEdit}>
                <CardHeader>
                  <CardTitle className="text-2xl text-secondary">Edit World</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="editName" className="text-sm font-medium">
                      Name <span className="text-destructive">*</span>
                    </label>
                    <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} required maxLength={200} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="editGenre" className="text-sm font-medium">Genre</label>
                    <Input id="editGenre" value={editGenre} onChange={(e) => setEditGenre(e.target.value)} maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="editDesc" className="text-sm font-medium">Description</label>
                    <textarea id="editDesc" className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={2000} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="editTone" className="text-sm font-medium">Tone Guidelines</label>
                    <textarea id="editTone" className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={editTone} onChange={(e) => setEditTone(e.target.value)} maxLength={2000} />
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
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                    )}
                    {canDelete && !confirmDelete && (
                      <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>
                    )}
                    {confirmDelete && (
                      <>
                        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                          {deleting ? "Deleting…" : "Confirm Delete"}
                        </Button>
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

        {/* Actors section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl">Actors</h2>
            {canEdit && (
              <Button asChild>
                <a href={`/worlds/${worldId}/actors/new`}>Create Actor</a>
              </Button>
            )}
          </div>
          {actors.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">No actors yet.</p>
                {canEdit && (
                  <Button asChild>
                    <a href={`/worlds/${worldId}/actors/new`}>Create Your First Actor</a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {actors.map((actor) => (
                <a key={actor.id} href={`/worlds/${worldId}/actors/${actor.id}`}>
                  <Card className="hover:border-secondary/50 transition-colors cursor-pointer h-full">
                    <CardHeader>
                      <CardTitle className="text-lg">{actor.name}</CardTitle>
                    </CardHeader>
                    {actor.summary && (
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-3">{actor.summary}</p>
                      </CardContent>
                    )}
                  </Card>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Auditions section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl">Auditions</h2>
            {canEdit && actors.length > 0 && (
              <Button asChild>
                <a href={`/worlds/${worldId}/auditions/new`}>Start Audition</a>
              </Button>
            )}
          </div>
          {auditions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">
                  {actors.length === 0
                    ? "Create an actor first, then start an audition."
                    : "No auditions yet. Start one to test your actors."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {auditions.map((a) => (
                <a key={a.id} href={`/worlds/${worldId}/auditions/${a.id}`}>
                  <Card className="hover:border-secondary/50 transition-colors cursor-pointer h-full">
                    <CardHeader>
                      <CardTitle className="text-lg">
                        {actorMap[a.actorId] || "Unknown Actor"}
                      </CardTitle>
                      <CardDescription>
                        {a.turnCount} {a.turnCount === 1 ? "message" : "messages"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.updatedAt || a.createdAt).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          )}
        </section>

        <div className="pt-4">
          <Button variant="ghost" asChild>
            <a href="/dashboard">← Back to Dashboard</a>
          </Button>
        </div>
      </div>
    </main>
  );
}

function Header() {
  const user = getUser();
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
