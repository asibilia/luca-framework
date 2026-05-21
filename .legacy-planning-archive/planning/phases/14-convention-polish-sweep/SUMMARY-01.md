# Phase 14 Plan 01 Summary: lodash orderBy Migration + MuninnDB Shared Types

## Status: COMPLETE

## Objective

Eliminate `Array.sort()` mutations in favor of lodash `orderBy` (M1) and unify duplicated MuninnDB type definitions into a shared types file (M5, M8).

## Tasks Completed

### Task 1: Replace Array.sort() with lodash orderBy in format.ts

- **Commit:** `48646d9b`
- **Files changed:** `src/shared/__helpers/format.ts`
- **Changes:** Replaced 3 `.sort()` calls in `toCursorFormat`, `toPiFormat`, and `toClaudeFormat` with `orderBy(sections, [(s) => s.order ?? 0], ["asc"])`. Added `import orderBy from "lodash/orderBy"`.

### Task 2: Replace Array.sort() with lodash orderBy in marketplace.ts

- **Commit:** `b67d1522`
- **Files changed:** `src/skills/__helpers/marketplace.ts`
- **Changes:** Replaced in-place `scored.sort()` mutation with immutable `const sorted = orderBy(scored, ["score"], ["desc"])`. Added `import orderBy from "lodash/orderBy"`.

### Task 3: Replace Array.sort() with lodash orderBy in ledger.ts

- **Commit:** `cc0dce19`
- **Files changed:** `packages/luca-framework/src/state/ledger.ts`
- **Changes:** Replaced in-place `rows.sort()` mutation with immutable `const sorted = orderBy(rows, [(r) => Number(r.sequence_number)], ["asc"])`, preserving BigInt-to-Number conversion. Added `import orderBy from "lodash/orderBy"`.

### Task 4: Create shared MuninnDB types file

- **Commit:** `af128cae`
- **Files created:** `packages/luca-observer/lib/muninn-types.ts`
- **Files changed:** `packages/luca-observer/lib/muninn-config.ts`, `packages/luca-observer/hooks/use-memory.ts`
- **Changes:** Created shared types file with superset of fields from both server and client. Server file now imports + re-exports from shared. Client file uses type aliases pointing to shared types. All downstream consumers (brain-panel, context-usage-bar, working-sections, memory-entries) continue to work via the re-exported aliases.

## Verification Results

| Check                                             | Result        |
| ------------------------------------------------- | ------------- |
| `bunx --bun tsc --noEmit`                         | PASS (exit 0) |
| No `.sort()` in format.ts                         | PASS          |
| No `.sort()` in marketplace.ts                    | PASS          |
| No `.sort()` in ledger.ts                         | PASS          |
| `muninn-types.ts` exists and exports shared types | PASS          |
| No duplicate type defs in muninn-config.ts        | PASS          |
| No duplicate type defs in use-memory.ts           | PASS          |

## Deviations

None. All tasks executed as planned.

## Findings (M1, M5, M8)

- **M1 (lodash orderBy):** 5 total `.sort()` call sites migrated (3 in format.ts, 1 in marketplace.ts, 1 in ledger.ts). All now use lodash `orderBy` per convention.
- **M5/M8 (MuninnDB types):** Unified 4 shared types (`MuninnEngram`, `MuninnActivation`, `MuninnSessionEntry`, `MuninnStatsResponse`) into single source of truth. Field set is superset -- server had `embed_dim`, `score_components`, `dormant`; client had `memory_type`, `state`, `updated_at`, `tags`, `why`. All fields now available in shared definition.
- **M12 (cold isolation):** Already resolved -- `COLD_ISOLATION_BLOCK` exists in `src/agents/__helpers/cold-isolation-block.ts`. No action needed.

## Manual Steps Required

- Run `bun run build:all` to regenerate output directories (`.claude/`, `.cursor/`, `.pi/`). Do NOT run during a Claude Code session.
