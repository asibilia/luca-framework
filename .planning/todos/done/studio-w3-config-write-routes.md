---
title: "Config write API routes (6 PUT endpoints for config.json sections)"
area: api
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w3-validation-pipeline]
phase: studio-w3
estimated_size: M
priority: P1
---

## Context

The Studio must support editing `.planning/config.json` through section-specific PUT endpoints. Each section has its own Zod schema, and writes must go through the full validation pipeline (schema + semantic + atomic write).

## Task

Implement six PUT routes for config.json section editing:

- `PUT /api/config/workflow` -- Workflow section
- `PUT /api/config/gates` -- Gates section
- `PUT /api/config/harness` -- Harness section
- `PUT /api/config/complexity` -- Complexity matrix
- `PUT /api/config/lu` -- Lu orchestration section
- `PUT /api/config/planner` -- Planner section

Each route must:

1. Accept JSON body with the section payload
2. Validate with appropriate Zod schema (`safeParse()`, reject 422 with structured errors)
3. Run semantic validation (e.g., at least one harness check enabled, required gates present)
4. Perform atomic write (`.tmp` + `rename()`)
5. Return updated section with new ETag

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (API Route Structure and Validation Pipeline sections) for detailed specs.

## Key Files

- New: `packages/luca-studio/app/api/config/[section]/route.ts`
- `src/shared/__schemas/lu-config.schemas.ts` (LuConfigSchema)
- `src/complexity/__schemas/complexity.schemas.ts` (ComplexityConfigSchema)
- `src/harness/__schemas/harness.schemas.ts` (HarnessConfigSchema)
- `.planning/config.json` (target file)

## Verification

- Each PUT route accepts valid section data and returns 200 with updated content
- Invalid data returns 422 with Zod error details
- Semantic violations return 422 with descriptive messages
- File writes are atomic (no partial writes on crash)
- ETag is returned on success
