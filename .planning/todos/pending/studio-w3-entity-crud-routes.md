---
title: "Entity CRUD API routes (agents, skills, rules)"
area: api
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w2-ts-round-trip, studio-w3-validation-pipeline]
phase: studio-w3
estimated_size: L
priority: P1
---

## Context

The Studio needs API routes to browse and edit entity files (agents, skills, rules). GET routes parse TypeScript source files using the canonical template extraction pattern. PUT routes use template-based code generation via the TypeScript round-trip utilities.

## Task

Implement entity browsing and editing routes:

- `GET /api/entities/agents` -- List all agents with parsed frontmatter
- `GET /api/entities/agents/[name]` -- Single agent (parsed frontmatter + sections)
- `PUT /api/entities/agents/[name]` -- Write agent (frontmatter + sections -> TypeScript)
- `GET /api/entities/skills` -- List all skills with frontmatter
- `PUT /api/entities/skills/[name]` -- Write skill
- `GET /api/entities/rules` -- List all rules with frontmatter
- `PUT /api/entities/rules/[name]` -- Write rule

GET routes must use the TS round-trip read path. PUT routes must validate with the appropriate Zod schema, use `serializeSectionContent()` for the write path, and trigger typecheck via sidecar.

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (Entity Editing routes and TypeScript Round-Trip sections) for detailed specs.

## Key Files

- New: `packages/luca-studio/app/api/entities/agents/route.ts`
- New: `packages/luca-studio/app/api/entities/agents/[name]/route.ts`
- New: `packages/luca-studio/app/api/entities/skills/route.ts`
- New: `packages/luca-studio/app/api/entities/skills/[name]/route.ts`
- New: `packages/luca-studio/app/api/entities/rules/route.ts`
- New: `packages/luca-studio/app/api/entities/rules/[name]/route.ts`
- `packages/luca-studio/lib/ts-round-trip.ts` (from W2)

## Verification

- `GET /api/entities/agents` returns array of agent summaries with frontmatter
- `GET /api/entities/agents/lu-router` returns full parsed config
- `PUT /api/entities/agents/lu-router` writes valid TypeScript and returns 200
- Invalid config returns 422 with structured errors
- `bunx --bun tsc --noEmit` passes after any PUT operation
