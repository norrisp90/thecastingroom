"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch, getUser, logout } from "@/lib/auth";
import type { AdminUserView } from "@/lib/api";

export default function UserListView() {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const currentUser = getUser();
  const pageSize = 20;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);

      const res = await authFetch(`/api/admin/users?${params}`, {}, { onColdStart: () => setColdStart(true) });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
      }
    } catch {
      // handled silently
    } finally {
      setLoading(false);
      setColdStart(false);
    }
  }, [page, search]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function toggleRole(userId: string, currentRole: string) {
    setActionLoading(userId);
    try {
      const newRole = currentRole === "admin" ? "user" : "admin";
      const res = await authFetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) await loadUsers();
    } catch {
      // handled silently
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleDisabled(userId: string, currentlyDisabled: boolean) {
    setActionLoading(userId);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !currentlyDisabled }),
      });
      if (res.ok) await loadUsers();
    } catch {
      // handled silently
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteUser(userId: string) {
    setActionLoading(userId);
    try {
      const res = await authFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        setConfirmDelete(null);
        await loadUsers();
      }
    } catch {
      // handled silently
    } finally {
      setActionLoading(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="min-h-screen">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="text-2xl text-secondary">
            The Casting Room
          </a>
          <span className="text-sm text-muted-foreground">
            / <a href="/admin" className="hover:text-secondary">Admin</a> / Users
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
        <div className="flex items-center justify-between">
          <h2 className="text-xl">User Management</h2>
          <span className="text-sm text-muted-foreground">{total} user{total !== 1 ? "s" : ""}</span>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
          <Input
            placeholder="Search by name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" variant="outline">Search</Button>
          {search && (
            <Button type="button" variant="ghost" onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}>
              Clear
            </Button>
          )}
        </form>

        {coldStart && (
          <p className="text-sm text-muted-foreground text-center animate-pulse">
            Waking up the server…
          </p>
        )}

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : users.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No users found.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {users.map((u) => {
              const isSelf = u.id === currentUser?.id;
              return (
                <Card key={u.id} className={u.disabled ? "opacity-60" : ""}>
                  <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                    <a
                      href={`/admin/users/${u.id}`}
                      className="flex-1 min-w-0 hover:text-secondary"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{u.displayName}</span>
                        {u.role === "admin" && (
                          <span className="text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded">
                            Admin
                          </span>
                        )}
                        {u.disabled && (
                          <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded">
                            Disabled
                          </span>
                        )}
                        {isSelf && (
                          <span className="text-xs text-muted-foreground">(you)</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Last login: {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}
                      </p>
                    </a>

                    {!isSelf && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionLoading === u.id}
                          onClick={() => toggleRole(u.id, u.role)}
                        >
                          {u.role === "admin" ? "Demote" : "Promote"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionLoading === u.id}
                          onClick={() => toggleDisabled(u.id, !!u.disabled)}
                        >
                          {u.disabled ? "Enable" : "Disable"}
                        </Button>
                        {confirmDelete === u.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={actionLoading === u.id}
                              onClick={() => deleteUser(u.id)}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDelete(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setConfirmDelete(u.id)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )}

        <div className="pt-4">
          <Button variant="outline" asChild>
            <a href="/admin">← Back to Admin</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
