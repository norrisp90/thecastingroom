# Lessons Learned

## Next.js Static Export with Nested Dynamic Routes (2026-03-22)

### Problem
`output: "export"` with nested dynamic segments (e.g. `/worlds/[id]/actors/[actorId]`) fails with "missing generateStaticParams()" even when the function exists and returns `[]`.

### Root Cause
Next.js build checks `prerenderedRoutes.length > 0` (not just whether `generateStaticParams` exists). Returning `[]` means zero prerendered routes → `hasGenerateStaticParams = false` → error thrown.

### Solution
1. Return placeholder params instead of empty array: `return [{ actorId: "_" }]`
2. Add a `layout.tsx` at the parent dynamic segment with `generateStaticParams` returning a placeholder: `return [{ id: "_" }]`
3. Split every page under dynamic segments into `page.tsx` (server wrapper + `generateStaticParams`) and `client.tsx` (`"use client"` with actual UI component)
4. Wrap components using `useSearchParams()` in `<Suspense>` in the server page wrapper

### Pattern
```tsx
// page.tsx (server component)
import { Suspense } from "react";
import MyClient from "./client";

export function generateStaticParams() {
  return [{ paramName: "_" }];
}

export default function MyPage() {
  return <Suspense><MyClient /></Suspense>;
}
```

## SSR-Safe localStorage Access (2026-03-22)

### Problem
`localStorage` is not available during server-side prerendering. Any utility function that calls `localStorage.getItem()` at module level or during render will crash the build.

### Solution
Guard with `typeof window === "undefined"` at the top of any function that accesses browser APIs:
```ts
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}
```
Also: never call browser-API functions outside `useEffect` in component bodies.

## npm 11.x Corruption Bug

npm 11.3.0–11.9.0 corrupts `node_modules` (missing `package.json` files inside packages). Always use npm >= 11.10.1. If TypeScript or packages fail to resolve, check npm version first.

## Parallel authFetch Race Condition (2026-03-22)

### Problem
`WorldDetail` fires three `authFetch` calls in parallel (world, actors, auditions). If the JWT is expired, all three get 401. The first call's `refreshTokens()` succeeds and revokes the old refresh token. The second and third calls try to refresh with the nowrevoked token, fail, and call `logout()`.

### Solution
Use a shared promise (`refreshPromise`) in `refreshTokens()`. When the first caller starts a refresh, subsequent concurrent callers share the same in-flight promise instead of each making their own refresh request.

## Admin Users vs. World Permissions (2026-03-22)

### Problem
System-level admin users (`role: "admin"` in JWT) were subject to the same `WorldPermissions` check as regular users. If a `WorldPermissions` record was missing or the query failed, admins got 403.

### Solution
In every route handler that checks `getUserRole`, also check `request.user.role === "admin"` and grant owner-level access if the user is a system admin.

## CORS Origin Configuration (2026-03-22)

### Problem
`FRONTEND_URL` env var was expected to be a single origin string. If it was unset, CORS defaulted to `http://localhost:3000`, blocking the deployed SWA domain entirely. No way to allow both localhost and production.

### Solution
Split `FRONTEND_URL` on commas: `origin: FRONTEND_URL.split(",").map(s => s.trim())`. This allows `FRONTEND_URL=https://zealous-rock-090eeb003.2.azurestaticapps.net,http://localhost:3000` for multi-origin support.

## clearTimeout(0) Bug (2026-03-22)

### Problem
In `apiFetch`, the catch block called `clearTimeout(0)` instead of the actual timer ID, leaking timers and never clearing the cold-start notification timeout.

### Solution
Track the timer ID in a variable scoped to the loop iteration and clear it properly in both the try and catch blocks.

## Container App Dual-Container Issue

`az containerapp up` creates a second container alongside Bicep-provisioned ones. Always use `az containerapp update --yaml` with a single-container definition when fixing.
