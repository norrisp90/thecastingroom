"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetch, getUser, logout } from "@/lib/auth";
import type { AdminUserView, UserWorldPermission } from "@/lib/api";

interface Props {
  userId: string;
}

export default function UserDetailView({ userId }: Props) {
  const [user, setUser] = useState<AdminUserView | null>(null);
  const [worlds, setWorlds] = useState<UserWorldPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteWorld, setConfirmDeleteWorld] = useState<string | null>(null);
  const currentUser = getUser();
  const isSelf = userId === currentUser?.id;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userRes, worldsRes] = await Promise.all([
        authFetch(`/api/admin/users/${userId}`, {}, { onColdStart: () => setColdStart(true) }),
        authFetch(`/api/admin/users/${userId}/worlds`),
      ]);

      if (userRes.ok) setUser(await userRes.json());
      if (worldsRes.ok) {
        const data = await worldsRes.json();
        setWorlds(data.worlds || []);
      }
    } catch {
      // handled silently
    } finally {
      setLoading(false);
      setColdStart(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function toggleRole() {
    if (!user || isSelf) return;
    setActionLoading(true);
    try {
      const newRole = user.role === "admin" ? "user" : "admin";
      const res = await authFetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) await loadData();
    } catch {
      // handled silently
    } finally {
      setActionLoading(false);
    }
  }

  async function toggleDisabled() {
    if (!user || isSelf) return;
    setActionLoading(true);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !user.disabled }),
      });
      if (res.ok) await loadData();
    } catch {
      // handled silently
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteUserAction() {
    if (isSelf) return;
    setActionLoading(true);
    try {
      const res = await authFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok) window.location.href = "/admin/users";
    } catch {
      // handled silently
    } finally {
      setActionLoading(false);
    }
  }

  async function changeWorldRole(worldId: string, newRole: string) {
    setActionLoading(true);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/worlds/${worldId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) await loadData();
    } catch {
      // handled silently
    } finally {
      setActionLoading(false);
    }
  }

  async function removeFromWorld(worldId: string) {
    setActionLoading(true);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/worlds/${worldId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConfirmDeleteWorld(null);
        await loadData();
      }
    } catch {
      // handled silently
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="text-2xl text-secondary">
            The Casting Room
          </a>
          <span className="text-sm text-muted-foreground">
            / <a href="/admin" className="hover:text-secondary">Admin</a>
            {" / "}
            <a href="/admin/users" className="hover:text-secondary">Users</a>
            {" / "}Detail
          </span>
        </div>
        <div className="flex items-center gap-4">
          {currentUser && (
            <span className="text-sm text-muted-foreground">
              {currentUser.displayName}
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

      <div className="container py-8 space-y-6">
        {coldStart && (
          <p className="text-sm text-muted-foreground text-center animate-pulse">
            Waking up the server…
          </p>
        )}

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !user ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">User not found.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* User Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 flex-wrap">
                  {user.displayName}
                  {user.role === "admin" && (
                    <span className="text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded font-normal">
                      Admin
                    </span>
                  )}
                  {user.disabled && (
                    <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded font-normal">
                      Disabled
                    </span>
                  )}
                  {isSelf && (
                    <span className="text-xs text-muted-foreground font-normal">(you)</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Email</span>
                    <p>{user.email}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Role</span>
                    <p className="capitalize">{user.role}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <p>{new Date(user.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Login</span>
                    <p>{user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : "Never"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Worlds</span>
                    <p>{user.worldCount ?? worlds.length}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p>{user.disabled ? "Disabled" : "Active"}</p>
                  </div>
                </div>

                {!isSelf && (
                  <div className="flex items-center gap-2 pt-4 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={toggleRole}
                    >
                      {user.role === "admin" ? "Demote to User" : "Promote to Admin"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={toggleDisabled}
                    >
                      {user.disabled ? "Enable Account" : "Disable Account"}
                    </Button>
                    {confirmDelete ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={actionLoading}
                          onClick={deleteUserAction}
                        >
                          Confirm Delete
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmDelete(true)}
                      >
                        Delete User
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* World Memberships */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">World Memberships</CardTitle>
              </CardHeader>
              <CardContent>
                {worlds.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No world memberships.</p>
                ) : (
                  <div className="space-y-3">
                    {worlds.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0 flex-wrap"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{w.worldName || w.worldId}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            Role: {w.role} · Granted: {new Date(w.grantedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <select
                            className="text-sm bg-background border border-border rounded px-2 py-1"
                            value={w.role}
                            disabled={actionLoading}
                            onChange={(e) => changeWorldRole(w.worldId, e.target.value)}
                          >
                            <option value="owner">Owner</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          {confirmDeleteWorld === w.worldId ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={actionLoading}
                                onClick={() => removeFromWorld(w.worldId)}
                              >
                                Confirm
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDeleteWorld(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setConfirmDeleteWorld(w.worldId)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <div className="pt-4">
          <Button variant="outline" asChild>
            <a href="/admin/users">← Back to Users</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
