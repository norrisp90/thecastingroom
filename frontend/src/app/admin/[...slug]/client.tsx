"use client";

import { useEffect, useState } from "react";
import { getUser, getToken } from "@/lib/auth";
import AdminDashboard from "./views/AdminDashboard";
import UserListView from "./views/UserListView";
import UserDetailView from "./views/UserDetailView";

export default function AdminRouterClient() {
  const [slug, setSlug] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }

    const user = getUser();
    if (user?.role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }

    const segments = window.location.pathname
      .replace(/^\/admin\/?/, "")
      .split("/")
      .filter(Boolean);
    setSlug(segments);
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  // /admin → dashboard
  if (slug.length === 0) {
    return <AdminDashboard />;
  }

  // /admin/users → user list
  if (slug.length === 1 && slug[0] === "users") {
    return <UserListView />;
  }

  // /admin/users/:userId → user detail
  if (slug.length === 2 && slug[0] === "users") {
    return <UserDetailView userId={slug[1]} />;
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Page not found</p>
    </main>
  );
}
