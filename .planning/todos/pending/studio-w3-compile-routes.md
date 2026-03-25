---
title: "Compilation API routes (POST /api/compile, GET /api/compile/status)"
area: api
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w2-compilation-sidecar]
phase: studio-w3
estimated_size: S
priority: P1
---

## Context

After editing an entity via the Studio UI, the user needs to trigger incremental compilation to update the generated output files (e.g., `.claude/agents/lu-router.md`). These routes proxy compilation requests to the sidecar process running on localhost:3457.

## Task

Implement two Next.js API routes:

- `POST /api/compile` -- Accepts `{ domain: "agents"|"skills"|"rules", name: string }`, proxies to the compilation sidecar, returns `{ status, output_path, duration_ms }` or error details
- `GET /api/compile/status` -- Returns current compilation state (idle, compiling, last result)

The routes act as a proxy between the Next.js frontend and the Bun sidecar. Handle sidecar unavailability gracefully (503 with descriptive message).

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (Sidecar API section) for the endpoint spec.

## Key Files

- New: `packages/luca-studio/app/api/compile/route.ts`
- New: `packages/luca-studio/app/api/compile/status/route.ts`

## Verification

- `POST /api/compile` with valid domain/name returns compilation result
- Sidecar unavailable returns 503 with clear error message
- `GET /api/compile/status` returns current state
- Compilation errors from sidecar are forwarded with appropriate HTTP status
