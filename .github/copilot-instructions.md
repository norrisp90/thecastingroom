# The Casting Room — Copilot Instructions

## Project Overview

AI character development platform. Next.js 15 frontend (static export) deployed to Azure Static Web Apps. Node.js/Express backend deployed to Azure Container Apps. Cosmos DB for persistence. Azure OpenAI (shared instance) for AI features.

## Azure Resources

- **Resource Group**: `rg-thecastingroom` (swedencentral)
- **Container App**: `castingroom-api` — backend API on port 4000
- **Static Web App**: `castingroom-web` at `https://zealous-rock-090eeb003.2.azurestaticapps.net` (westeurope, Free tier)
- **Cosmos DB**: `castingroom-cosmos` (free tier, swedencentral)
- **Shared OpenAI**: `oai-dungeon-master-njyc6qwbprtjs` in `rg-dungeon-master` — default model: `gpt-41-mini`
- **ACR**: `ca3e2fd943a5acr`
- **Storage**: `castingroomstor` · **App Insights**: `castingroom-insights`

## Known Gotchas

- **Container App dual-container issue**: `az containerapp up` creates a second container alongside Bicep-provisioned ones. Always use `az containerapp update --yaml` with a single-container definition when fixing. Bicep uses `${baseName}-api` as container name (not generic `api`).
- **Port mismatch**: Container App ingress targetPort (4000) must match the app's listening port. Mismatched ports show as PortMismatch in system logs.
- **npm 11.x bug (npm/cli#8535)**: npm 11.3.0–11.9.0 corrupts `node_modules` (missing `package.json` files). Always use npm >= 11.10.1. If TypeScript or other packages fail to resolve, check npm version first.
- **Node.js v24 + Next.js**: Next.js 15.x works with Node 24. Next.js 16.x does NOT (fails with `"id" argument must be of type string`).
- **SWA deployment**: Deploy static exports with `npx @azure/static-web-apps-cli deploy ./out --deployment-token $token --env production`. The `out/` directory comes from `next build` with `output: "export"`.
- **ACR registry in Bicep**: Do NOT add `registries` config to the Container App Bicep resource. The `azure/container-apps-deploy-action` handles ACR registry configuration automatically. Adding it causes a chicken-and-egg problem where the Container App can't provision because the managed identity doesn't have AcrPull yet.
- **AcrPull role assignment**: The GitHub Actions service principal has `Contributor` role, which cannot create role assignments. AcrPull must be granted manually: `az role assignment create --assignee <MI-principalId> --role AcrPull --scope <ACR-resource-id>`.
- **Container App stuck provisioning**: If `provisioningState` is stuck at `InProgress`, delete the Container App (`az containerapp delete`) and recreate via the Deploy Infrastructure workflow, then re-grant AcrPull and re-configure ACR registry.
- **Backend workflow dockerfilePath**: The `dockerfilePath` in `azure/container-apps-deploy-action` is relative to `appSourcePath`, not the repo root. Use `./Dockerfile` (not `./backend/Dockerfile`) when `appSourcePath: ./backend`.
- **Next.js static export + dynamic routes**: `generateStaticParams()` must return at least one entry (not `[]`). Use `[{ slug: ["_"] }]`. Split pages into `page.tsx` (server wrapper with `generateStaticParams`) + `client.tsx` (`"use client"`). Wrap `useSearchParams()` in `<Suspense>`.
- **SSR-safe localStorage**: Guard with `typeof window === "undefined"` — SSR prerendering has no browser APIs. Never call browser-API functions outside `useEffect`.
- **Parallel authFetch race condition**: When multiple `authFetch` calls fire in parallel and the JWT is expired, all get 401 and race to refresh. The first revokes the old refresh token, causing the rest to fail and trigger logout. **Solution**: use a shared `refreshPromise` so concurrent callers share one in-flight refresh (implemented in `frontend/src/lib/auth.ts`).
- **Admin users vs. WorldPermissions**: System-level admins (`role: "admin"` in JWT) must bypass `WorldPermissions` checks. Every route handler that calls `getUserRole` should also check `request.user.role === "admin"` and grant owner-level access.
- **CORS multi-origin**: `FRONTEND_URL` env var supports comma-separated origins. Backend splits on commas: `origin: FRONTEND_URL.split(",").map(s => s.trim())`. Set to `https://zealous-rock-090eeb003.2.azurestaticapps.net,http://localhost:3000` for both production + local.
- **SWA rewrite + useParams() broken**: SWA rewrites `/worlds/*` to `/worlds/_.html`. Next.js `useParams()` returns the build-time placeholder `["_"]`, NOT the actual URL. **Solution**: parse `window.location.pathname` in a `useEffect` instead of using `useParams()`. This applies to ALL catch-all routes in static export deployed to SWA.
- **@fastify/cors v11 methods default**: `@fastify/cors` v11 only returns `GET,HEAD,POST` in `Access-Control-Allow-Methods` by default, blocking PUT/PATCH/DELETE at the browser preflight stage. **Solution**: always set `methods: ["GET","HEAD","PUT","PATCH","POST","DELETE"]` explicitly in the CORS config.
- **SSE streaming + CORS bypass**: Using `reply.raw.writeHead()` for SSE bypasses Fastify's response pipeline, so `@fastify/cors` headers are never sent. **Solution**: manually include CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials`) in the `writeHead()` call, and call `reply.hijack()` to prevent Fastify from double-sending.
- **OpenAI VNet firewall**: The shared OpenAI resource (`oai-dungeon-master-njyc6qwbprtjs`) has `defaultAction: Deny` with VNet rules. The Container App's outbound IP (`20.240.169.142`) must be in the IP allow list: `az cognitiveservices account network-rule add --name oai-dungeon-master-njyc6qwbprtjs --resource-group rg-dungeon-master --ip-address <outbound-ip>`. If the Container App is recreated, the outbound IP may change — re-add it.
- **Azure OpenAI Realtime API — WebSocket relay**: Voice auditions use a WebSocket relay through the backend. Browser connects to `wss://backend/api/worlds/:id/auditions/:id/realtime-ws?token=JWT`, backend opens a WS to `wss://oai-*.openai.azure.com/openai/realtime?api-version=2024-10-01-preview&deployment=gpt-realtime-mini` with `api-key` header, and relays messages bidirectionally. Browser captures mic audio via AudioWorklet → PCM16 base64 → Realtime API `input_audio_buffer.append` events; receives `response.audio.delta` base64 PCM16 → decodes and plays via AudioContext. Current realtime model: `gpt-realtime-mini`.

## Build & Deploy Commands

```bash
# Frontend
cd frontend && npm install && npx next build
# Deploy to SWA
$swaToken = az staticwebapp secrets list --name castingroom-web --resource-group rg-thecastingroom --query "properties.apiKey" -o tsv
npx @azure/static-web-apps-cli deploy ./out --deployment-token $swaToken --env production

# Backend (via ACR + Container Apps)
az containerapp up --name castingroom-api --resource-group rg-thecastingroom --source ./backend
```

## Conventions

- TypeScript throughout (frontend and backend)
- Backend listens on port 4000 (`PORT` env var)
- Frontend uses `output: "export"` for static generation
- Bicep infrastructure in `infra/main.bicep`
- GitHub Actions workflows in `.github/workflows/`
