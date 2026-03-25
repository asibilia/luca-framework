---
title: "Runtime X02: Update boundary check script for workflow, adapters, eval domains"
area: runtime-architecture
created: 2026-03-24
source: docs/runtime-architecture/research/backlog-integration.md
depends_on: [X01]
phase: runtime-x
estimated_files: 1
---

## Context

The automated boundary checker (`scripts/check-domain-boundaries.ts`) validates import direction rules. It must be updated to include the three new domains with their correct tier assignments before any Phase A-E implementation begins.

## Task

### 1. Add new domains to DOMAIN_TIER map

**File:** `/Users/alecsibilia/Github/luca-framework/scripts/check-domain-boundaries.ts`

**Exact change — lines 22-36:**

OLD (current `DOMAIN_TIER` object):

```typescript
const DOMAIN_TIER: Record<string, number> = {
  shared: 0,
  complexity: 0,
  context: 1,
  planner: 1,
  harness: 1,
  iteration: 1,
  observability: 1,
  interop: 1,
  agents: 2,
  skills: 2,
  rules: 2,
  compilers: 3,
  hooks: 3,
};
```

NEW:

```typescript
const DOMAIN_TIER: Record<string, number> = {
  shared: 0,
  complexity: 0,
  context: 1,
  planner: 1,
  harness: 1,
  iteration: 1,
  observability: 1,
  interop: 1,
  workflow: 1,
  eval: 1,
  agents: 2,
  skills: 2,
  rules: 2,
  compilers: 3,
  hooks: 3,
  adapters: 3,
};
```

Three additions:

- `workflow: 1` — T1 Core (DAG engine, step contracts)
- `eval: 1` — T1 Core (evaluation framework)
- `adapters: 3` — T3 Build (IDE-specific adapters, terminal)

No other changes to the script are needed. The existing validation logic handles the new domains correctly:

- `sourceTier < targetTier` catches upward dependencies (e.g., eval (1) importing adapters (3) would not be caught because 1 < 3 is true — wait, this is the WRONG direction. Let me verify.)
- Actually: `sourceTier < targetTier` means "source is at a lower tier than target." If eval (T1, tier=1) imports adapters (T3, tier=3), then sourceTier=1 < targetTier=3 is TRUE, which triggers a violation. This is correct — T1 cannot import T3.
- If adapters (T3, tier=3) imports agents (T2, tier=2), then sourceTier=3 < targetTier=2 is FALSE, so no violation. This is correct — T3 can import T2.

The entity isolation rule (Rule 2) only applies to `ENTITY_DOMAINS` (agents, skills, rules), which are unchanged. No update needed there.

## Verification

- `bun run scripts/check-domain-boundaries.ts` passes with no violations (assuming no new domain directories exist yet — the script skips unknown domains)
- Once `src/workflow/`, `src/eval/`, and `src/adapters/` directories are created with code, the script correctly:
  - Allows workflow (T1) to import from shared (T0), complexity (T0), iteration (T1), context (T1)
  - Allows eval (T1) to import from workflow (T1), shared (T0)
  - Blocks eval (T1) from importing adapters (T3)
  - Allows adapters (T3) to import from agents (T2), skills (T2), rules (T2), workflow (T1), shared (T0)
  - Blocks workflow (T1) from importing agents (T2), skills (T2), rules (T2)
  - Blocks nothing from importing adapters (T3) — adapters is terminal
- `bunx --bun tsc --noEmit` passes

## Notes

- This is a 3-line change to a single file. It should be the first thing done before any runtime architecture implementation.
- The script will silently skip scanning `src/workflow/` etc. until those directories exist. This means X02 can be done immediately with zero side effects.
