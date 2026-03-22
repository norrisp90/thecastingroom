"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authFetch } from "@/lib/auth";

export default function NewWorldPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [toneGuidelines, setToneGuidelines] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [coldStart, setColdStart] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setColdStart(false);

    try {
      const res = await authFetch("/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          genre,
          toneGuidelines,
        }),
      }, { onColdStart: () => setColdStart(true) });

      if (!res.ok) {
        const data = await res.json();
        const msg = typeof data.error === "string" ? data.error : "Failed to create world";
        setError(msg);
        return;
      }

      const world = await res.json();
      window.location.href = `/worlds/${world.id}`;
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
        <a href="/dashboard" className="text-2xl text-secondary hover:opacity-80 transition-opacity">
          The Casting Room
        </a>
      </header>

      <div className="flex justify-center px-4 py-8">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-3xl text-secondary">Create a New World</CardTitle>
            <CardDescription>
              Define the setting and tone for your characters
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {coldStart && (
                <p className="text-sm text-muted-foreground text-center animate-pulse">
                  Waking up the server… this may take a moment.
                </p>
              )}
              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  World Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g. Victorian London, Far Future Colony"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="genre" className="text-sm font-medium">
                  Genre
                </label>
                <Input
                  id="genre"
                  type="text"
                  placeholder="e.g. Drama, Sci-Fi, Fantasy, Historical"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">
                  Description
                </label>
                <textarea
                  id="description"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Describe the world — its history, atmosphere, and key elements"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="tone" className="text-sm font-medium">
                  Tone Guidelines
                </label>
                <textarea
                  id="tone"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Overall tone direction — e.g. 'Dark and brooding with dry wit' or 'Light-hearted and whimsical'"
                  value={toneGuidelines}
                  onChange={(e) => setToneGuidelines(e.target.value)}
                  maxLength={2000}
                />
              </div>
            </CardContent>
            <CardFooter className="flex gap-4">
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Creating…" : "Create World"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <a href="/dashboard">Cancel</a>
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </main>
  );
}
