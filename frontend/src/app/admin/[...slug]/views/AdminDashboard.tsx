"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetch, getUser, logout } from "@/lib/auth";
import type { AdminStats } from "@/lib/api";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const user = getUser();

  useEffect(() => {
    authFetch("/api/admin/stats", {}, { onColdStart: () => setColdStart(true) })
      .then(async (res) => {
        if (res.ok) setStats(await res.json());
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setColdStart(false);
      });
  }, []);

  return (
    <main className="min-h-screen">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="text-2xl text-secondary">
            The Casting Room
          </a>
          <span className="text-sm text-muted-foreground">/ Admin</span>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <span className="text-sm text-muted-foreground">
              {user.displayName}
              <span className="ml-2 text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded">
                Admin
              </span>
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign Out
          </Button>
        </div>
      </header>

      <div className="container py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl">Admin Dashboard</h2>
          <Button asChild>
            <a href="/admin/users">Manage Users</a>
          </Button>
        </div>

        {coldStart && (
          <p className="text-sm text-muted-foreground text-center animate-pulse">
            Waking up the server…
          </p>
        )}

        {loading ? (
          <p className="text-muted-foreground">Loading stats…</p>
        ) : stats ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.totalUsers}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Admins
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.adminCount}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Disabled Accounts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.disabledCount}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active (7 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.recentlyActive}</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="text-muted-foreground">Failed to load stats.</p>
        )}

        <div className="pt-4">
          <Button variant="outline" asChild>
            <a href="/dashboard">← Back to Dashboard</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
