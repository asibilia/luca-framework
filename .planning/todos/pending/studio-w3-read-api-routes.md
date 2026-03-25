---
title: "Read-only API routes (GET /api/config, /api/state, /api/ledger)"
area: api
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: []
phase: studio-w3
estimated_size: S
priority: P1
---

## Context

The Studio needs server-side API routes to serve config, state, and ledger data to the frontend. These read-only routes are foundational -- they feed the server state atoms (Layer 1) and are required by the Home page, state inspector, and session views.

## Task

Implement three Next.js App Router API routes:

- `GET /api/config` -- Read and parse `.planning/config.json`, return with ETag header (`sha256(contents).substring(0, 16)`)
- `GET /api/state` -- Read and parse `.planning/state.json`
- `GET /api/ledger` -- Read `.planning/session-ledger.jsonl`, return last N entries (default 50, configurable via `?limit=` query param)

Each route should parse with the appropriate Zod schema and return structured JSON. Include error handling for missing files (return sensible defaults, not 500).

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (API Route Structure section) for the full route spec.

## Key Files

- New: `packages/luca-studio/app/api/config/route.ts`
- New: `packages/luca-studio/app/api/state/route.ts`
- New: `packages/luca-studio/app/api/ledger/route.ts`
- `.planning/config.json` (source file)
- `.planning/state.json` (source file)
- `.planning/session-ledger.jsonl` (source file)

## Verification

- `curl http://localhost:3000/api/config` returns parsed config JSON with ETag header
- `curl http://localhost:3000/api/state` returns parsed state JSON
- `curl http://localhost:3000/api/ledger?limit=10` returns last 10 ledger entries
- Missing files return empty/default responses, not errors
