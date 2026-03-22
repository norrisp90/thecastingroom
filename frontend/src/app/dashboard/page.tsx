"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

interface World {
  id: string;
  name: string;
  description: string;
  genre: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    // Decode user from stored data
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        // ignore parse errors
      }
    }

    // Fetch worlds
    apiFetch("/api/worlds", {
      headers: { Authorization: `Bearer ${token}` },
    }, { onColdStart: () => setColdStart(true) })
      .then(async (res) => {
        if (res.status === 401) {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("user");
          window.location.href = "/login";
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setWorlds(data.worlds || data || []);
        }
      })
      .catch(() => {
        // network error — stay on page
      })
      .finally(() => {
        setLoading(false);
        setColdStart(false);
      });
  }, []);

  function handleLogout() {
    const refreshToken = localStorage.getItem("refreshToken");
    const token = localStorage.getItem("accessToken");
    if (refreshToken && token) {
      apiFetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl text-secondary">The Casting Room</h1>
        <div className="flex items-center gap-4">
          {user && (
            <span className="text-sm text-muted-foreground">
              {user.displayName}
              {user.role === "admin" && (
                <span className="ml-2 text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded">
                  Admin
                </span>
              )}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      </header>

      <div className="container py-8 space-y-8">
        {coldStart && (
          <p className="text-sm text-muted-foreground text-center animate-pulse">
            Waking up the server… this may take a moment.
          </p>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl">Your Worlds</h2>
            <Button asChild>
              <a href="/worlds/new">Create World</a>
            </Button>
          </div>

          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : worlds.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">
                  You haven&apos;t created any worlds yet.
                </p>
                <Button asChild>
                  <a href="/worlds/new">Create Your First World</a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {worlds.map((world) => (
                <a key={world.id} href={`/worlds/${world.id}`}>
                  <Card className="hover:border-secondary/50 transition-colors cursor-pointer">
                    <CardHeader>
                      <CardTitle className="text-lg">{world.name}</CardTitle>
                      <CardDescription>{world.genre}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {world.description}
                      </p>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
