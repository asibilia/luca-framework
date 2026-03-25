# Phase 4: W3 Validation Pipeline First — Context

## Decisions

### 1. Validation Pipeline Architecture [from brainstorm]

**Decision:** Three-step pipeline consumed by all write routes:

1. **Schema parse:** `safeParse()` against Zod schema. Reject 422 with structured Zod error output.
2. **Semantic validation:** Domain-specific checks beyond Zod:
   - DAG cycle detection (workflow steps)
   - Nonexistent agent references
   - At least one harness check must remain enabled
   - Required gates cannot be removed
   - Model routing must cover all 5 complexity levels
3. **Atomic write:** Write to `.tmp` sibling, then `rename()` into place.

Design as composable middleware: each route configures with its specific schema + semantic validators.

### 2. Read API Routes [straightforward]

**Decision:** Three Next.js App Router routes:

- `GET /api/config` — Read `.planning/config.json`, return with ETag header
- `GET /api/state` — Read `.planning/state.json`
- `GET /api/ledger` — Read `.planning/session-ledger.jsonl`, return last N entries

Missing files return sensible defaults (empty objects/arrays), not 500.

### 3. ETag Implementation [from brainstorm]

**Decision:** `sha256(contents).substring(0, 16)` as ETag on all GET responses. Will be consumed by the ETag locking middleware in v8.1.0.

## Phase Constraints

- Validation pipeline MUST complete before Phase 5 write routes consume it
- Read API routes are independent and can be built in parallel with pipeline
- All work within packages/luca-studio/
- Imports Zod schemas from src/ domains (read-only, no tier violation)
