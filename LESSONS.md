# Lessons Learned

> This file tracks unique problems, gotchas, and patterns discovered during development.
> Updated at the end of every coding session.

## Session 1 — 2026-03-22 — Project Scaffolding

- **No local Node.js**: Dev machine has no Node.js installed. All project files are hand-created. CI/CD (GitHub Actions) handles `npm install`, build, and deploy. Never assume local `npm`/`npx` is available.
