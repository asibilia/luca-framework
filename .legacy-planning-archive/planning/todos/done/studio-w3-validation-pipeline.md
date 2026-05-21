---
title: "Validation pipeline (schema + semantic + atomic write)"
area: api
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: []
phase: studio-w3
estimated_size: M
priority: P1
---

## Context

Every write operation in the Studio must pass through a three-step validation pipeline to ensure data integrity. This is a shared middleware/utility consumed by all write routes (config PUT routes, entity PUT routes, routing table routes).

## Task

Build a reusable validation pipeline with three steps:

1. **Schema parse:** `safeParse()` against the appropriate Zod schema. Reject 422 with structured Zod error output.
2. **Semantic validation:** Domain-specific checks beyond Zod:
   - DAG cycle detection (workflow steps cannot create cycles)
   - Nonexistent agent references (steps referencing agents that don't exist)
   - At least one harness check must remain enabled
   - Required gates cannot be removed
   - Model routing must cover all 5 complexity levels
3. **Atomic write:** Write to `.tmp` sibling file, then `rename()` into place. Prevents partial writes on crash.

Design as composable middleware that each route can configure with its specific schema and semantic validators.

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (Validation Pipeline and Security/Safety sections) for the full spec.

## Key Files

- New: `packages/luca-studio/lib/validation-pipeline.ts`
- New: `packages/luca-studio/lib/semantic-validators.ts`
- New: `packages/luca-studio/lib/atomic-write.ts`
- Existing Zod schemas across `src/` domains

## Verification

- Schema validation rejects invalid data with structured Zod errors (422)
- Semantic validators catch domain violations (e.g., cycle detection, missing agents)
- Atomic write creates `.tmp` file then renames (no partial writes)
- Pipeline is composable -- routes configure it with their specific schema + validators
- All write routes share this pipeline (no duplicated validation logic)
