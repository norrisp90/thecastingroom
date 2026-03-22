# Lessons Learned

> This file tracks unique problems, gotchas, and patterns discovered during development.
> Updated at the end of every coding session.

## Session 1 — 2026-03-22 — Project Scaffolding

- **No local Node.js**: Dev machine has no Node.js installed. All project files are hand-created. CI/CD (GitHub Actions) handles `npm install`, build, and deploy. Never assume local `npm`/`npx` is available.

## Session 2 — 2026-03-22 — Deployment Debugging

- **Container App dual-container issue**: `az containerapp up` creates a *second* container alongside the Bicep-provisioned one. The real app container had no env vars and crashed. Fix: use `az containerapp update --yaml` with a single-container definition including all env vars. Also fixed Bicep to use `${baseName}-api` as container name instead of generic `api`.
- **Port mismatch**: Container App ingress targetPort (4000) must match the port the app listens on. The second container defaulted to port 80, causing a PortMismatch system log error.
- **npm 11.9.0 bug (npm/cli#8535)**: npm versions ~11.3.0–11.9.0 have a known bug that corrupts `node_modules` — packages install with missing `package.json` files (e.g., `node_modules/typescript/` had `bin/` and `lib/` but no `package.json`). This breaks `require.resolve()` and causes build failures. **Fix**: upgrade npm to >= 11.10.1 (`npm install -g npm@latest`).
- **Node.js v24 compatibility**: Next.js 15.x works with Node 24; Next.js 16.x does not (fails with `"id" argument must be of type string`).
- **SWA deployment**: Use `npx @azure/static-web-apps-cli deploy ./out --deployment-token $token --env production` to deploy static exports. The `out/` directory is produced by `next build` with `output: "export"` in config.
