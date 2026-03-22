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
