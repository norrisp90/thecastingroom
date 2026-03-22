# The Casting Room

AI character development platform that uses **method acting frameworks** (Stanislavski, Strasberg, Adler, Meisner, Hagen, Chubbuck) to create deeply developed AI LLM character personas.

## Concept

- **Worlds** — Isolated project workspaces for different character sets
- **Actors** — Base characters defined via structured method-acting inputs (7 sections: Identity, Formative Events, Psychology, Inner World, Motivations, Behavior, Voice)
- **Roles** — Contextual behavioral overlays layered on top of Actors
- **Audition Room** — Interactive chat environment to test Actor+Role combinations against Azure OpenAI

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (static export) + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Fastify + TypeScript on Azure Container Apps (Consumption) |
| Database | Azure Cosmos DB NoSQL (free tier) |
| AI/LLM | Azure OpenAI (shared resource, PAYG) |
| Hosting | Azure Static Web Apps (Free) + Container Apps |
| IaC | Bicep |
| CI/CD | GitHub Actions |
| Auth | Custom JWT (bcrypt + refresh tokens) |

## UI Theme — Dark Theater

- **Headings**: Playfair Display (serif) — dramatic, theatrical
- **Body**: Inter (sans-serif) — clean, readable
- **Colors**: Near-black warm background, burgundy `#8B1A1A` (primary), gold `#C9A853` (secondary), warm cream `#F5E6D3` (text)

## Project Structure

```
frontend/          — Next.js static site
backend/           — Fastify API server
  src/
    plugins/       — Cosmos DB, Auth middleware
    routes/        — auth/, worlds/, actors/, auditions/
    services/      — Business logic & Azure OpenAI client
    types/         — TypeScript domain interfaces
infra/             — Bicep templates for Azure
.github/workflows/ — CI/CD pipelines
```

## Environment Variables (Backend)

| Variable | Description |
|----------|-------------|
| `COSMOS_ENDPOINT` | Azure Cosmos DB account endpoint |
| `COSMOS_KEY` | Cosmos DB primary key |
| `COSMOS_DATABASE` | Database name (default: `thecastingroom-db`) |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint (dungeon master RG) |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `FRONTEND_URL` | Frontend URL for CORS |
| `PORT` | Server port (default: 4000) |

## GitHub Secrets & Variables

### Secrets
- `AZURE_CREDENTIALS` — Service principal JSON for Azure login
- `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` — From "dungeon master" RG
- `JWT_SECRET` — Random secret for JWT signing
- `SWA_DEPLOYMENT_TOKEN` — Static Web App deployment token

### Variables
- `AZURE_RESOURCE_GROUP` — Resource group name (e.g., `rg-thecastingroom`)
- `BASE_NAME` — Base name for resources (default: `castingroom`)
- `FRONTEND_URL` — Deployed frontend URL

## Deployment

All deployment happens via GitHub Actions on push to `main`:
- `infra/**` changes → deploys Bicep infrastructure
- `backend/**` changes → builds Docker image and deploys to Container Apps
- `frontend/**` changes → builds static export and deploys to SWA

## Status

**Phase 1 — Foundation scaffold complete.** Auth, Worlds, Actors, Auditions, Prompt Compilation implemented. Ready for first Azure deployment.
