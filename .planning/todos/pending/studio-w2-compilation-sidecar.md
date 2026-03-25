---
title: "Compilation sidecar (Bun process on TCP localhost:3457)"
area: infrastructure
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: []
phase: studio-w2
estimated_size: M
priority: P1
---

## Context

`bun run build:all` crashes Claude Code sessions (documented in MEMORY.md). The Studio needs per-entity incremental compilation without invoking the full pipeline. A standalone Bun sidecar process imports compilation functions and exposes them via local HTTP.

## Task

Build a standalone Bun process that:

- Listens on TCP localhost:3457
- Imports compilation functions from `src/compilers/__helpers/compile.ts`
- Exposes `POST /compile` endpoint accepting `{ domain, name }` and returning `{ status, output_path, duration_ms }`
- Handles crash recovery and port conflict detection
- Managed by `bun run --watch` in dev for auto-restart on source changes
- Never invokes `bun run build:all`

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (Compilation Problem section) and `docs/brainstorm/observer-studio-rework/6.research-architecture.md` (R2) for sidecar design.

## Key Files

- New: `packages/luca-studio/sidecar/compiler.ts` (or similar)
- `src/compilers/__helpers/compile.ts` (compileAgent, compileSkill, compileRule)
- `scripts/build-compile.ts` (reference for full pipeline)
- `package.json` (new script for sidecar startup)

## Verification

- `curl http://localhost:3457/compile -X POST -d '{"domain":"agents","name":"lu-router"}'` returns success JSON
- Compiled output appears at expected path (e.g., `.claude/agents/lu-router.md`)
- Sidecar handles invalid domain/name gracefully (400 response)
- Port conflict produces clear error message
