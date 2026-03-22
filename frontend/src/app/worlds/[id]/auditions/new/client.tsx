"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authFetch } from "@/lib/auth";

interface Actor {
  id: string;
  name: string;
  summary: string;
}

export default function NewAuditionClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const worldId = params.id as string;
  const preselectedActorId = searchParams.get("actorId") || "";

  const [actors, setActors] = useState<Actor[]>([]);
  const [actorId, setActorId] = useState(preselectedActorId);
  const [sceneSetup, setSceneSetup] = useState("");
  const [loadingActors, setLoadingActors] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadActors() {
      try {
        const res = await authFetch(
          `/api/worlds/${worldId}/actors`,
          {},
          { onColdStart: () => setColdStart(true) }
        );
        if (res.ok) {
          const data = await res.json();
          const list = data.actors || data || [];
          setActors(list);
          // If preselected actorId is valid, keep it; else default to first
          if (preselectedActorId && list.some((a: Actor) => a.id === preselectedActorId)) {
            setActorId(preselectedActorId);
          } else if (list.length > 0) {
            setActorId(list[0].id);
          }
        }
      } catch {
        setError("Unable to load actors.");
      } finally {
        setLoadingActors(false);
        setColdStart(false);
      }
    }
    loadActors();
  }, [worldId, preselectedActorId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!actorId) { setError("Select an actor."); return; }
    setError("");
    setSubmitting(true);
    setColdStart(false);

    try {
      const res = await authFetch(`/api/worlds/${worldId}/auditions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, sceneSetup }),
      }, { onColdStart: () => setColdStart(true) });

      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === "string" ? data.error : "Failed to start audition");
        return;
      }

      const session = await res.json();
      window.location.href = `/worlds/${worldId}/auditions/${session.id}`;
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setSubmitting(false);
      setColdStart(false);
    }
  }

  const selectedActor = actors.find((a) => a.id === actorId);

  return (
    <main className="min-h-screen">
      <header className="border-b border-border px-6 py-4">
        <a href={`/worlds/${worldId}`} className="text-2xl text-secondary hover:opacity-80 transition-opacity">
          The Casting Room
        </a>
      </header>

      <div className="flex justify-center px-4 py-8">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-3xl text-secondary">Start an Audition</CardTitle>
            <CardDescription>
              Choose an actor and set the scene for your conversation
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {coldStart && (
                <p className="text-sm text-muted-foreground text-center animate-pulse">
                  Waking up the server… this may take a moment.
                </p>
              )}
              {error && <p className="text-sm text-destructive text-center">{error}</p>}

              {/* Actor selector */}
              <div className="space-y-2">
                <label htmlFor="actor" className="text-sm font-medium">
                  Actor <span className="text-destructive">*</span>
                </label>
                {loadingActors ? (
                  <p className="text-sm text-muted-foreground">Loading actors…</p>
                ) : actors.length === 0 ? (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      No actors in this world yet.
                    </p>
                    <Button asChild size="sm">
                      <a href={`/worlds/${worldId}/actors/new`}>Create an Actor First</a>
                    </Button>
                  </div>
                ) : (
                  <select
                    id="actor"
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={actorId}
                    onChange={(e) => setActorId(e.target.value)}
                    required
                  >
                    {actors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
                {selectedActor?.summary && (
                  <p className="text-xs text-muted-foreground mt-1">{selectedActor.summary}</p>
                )}
              </div>

              {/* Scene setup */}
              <div className="space-y-2">
                <label htmlFor="scene" className="text-sm font-medium">Scene Setup</label>
                <textarea
                  id="scene"
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Describe the scenario, setting, and context for this audition. E.g. 'You're sitting in a dimly lit pub after receiving devastating news…'"
                  value={sceneSetup}
                  onChange={(e) => setSceneSetup(e.target.value)}
                  maxLength={5000}
                />
                <p className="text-xs text-muted-foreground">{sceneSetup.length}/5000</p>
              </div>
            </CardContent>
            <div className="flex gap-4 px-6 pb-6">
              <Button type="submit" className="flex-1" disabled={submitting || actors.length === 0}>
                {submitting ? "Starting…" : "Begin Audition"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <a href={`/worlds/${worldId}`}>Cancel</a>
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
