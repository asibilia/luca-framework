---
phase: 14
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
gap_closure: true
findings: [M1, M5, M8]
---

# Phase 14 Plan 1: lodash orderBy Migration + MuninnDB Shared Types

## Objective

Eliminate `Array.sort()` mutations in favor of lodash `orderBy` (M1) and unify duplicated MuninnDB type definitions into a shared types file (M5, M8). M12 (cold isolation prompt extraction) is already resolved -- `COLD_ISOLATION_BLOCK` exists in `src/agents/__helpers/cold-isolation-block.ts` and all 5 reviewer agents import it.

## Context

@src/shared/**helpers/format.ts
@src/skills/**helpers/marketplace.ts
@packages/luca-framework/src/state/ledger.ts
@packages/luca-observer/lib/muninn-config.ts
@packages/luca-observer/hooks/use-memory.ts
@.claude/rules/lodash-preference.md

## Tasks

### 1. Replace Array.sort() with lodash orderBy in format.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the 3 `.sort()` calls in `src/shared/__helpers/format.ts` (lines 44, 75, 93) with lodash `orderBy`. These sort `Section[]` arrays by the `order` property. The current pattern `[...sections].sort(...)` already creates a copy (good), but should use `orderBy` for convention compliance.

**Current pattern (lines 44, 75, 93):**

```typescript
const body = [...sections].sort((a, b) => (a.order || 0) - (b.order || 0));
```

**Target pattern:**

```typescript
import orderBy from "lodash/orderBy";
// ...
const body = orderBy(sections, [(s) => s.order ?? 0], ["asc"]);
```

**Files to edit:**

- `src/shared/__helpers/format.ts` -- add `import orderBy from "lodash/orderBy"`, replace 3 sort calls

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All 3 `.sort()` calls in format.ts replaced with `orderBy`
- No other changes to the file's behavior (orderBy returns a new array, matching `[...sections].sort()` semantics)

### 2. Replace Array.sort() with lodash orderBy in marketplace.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the `.sort()` call in `src/skills/__helpers/marketplace.ts` (line 107) with lodash `orderBy`. This sorts `scored` array by score descending. The current pattern mutates the `scored` array in-place.

**Current pattern (line 107):**

```typescript
scored.sort((a, b) => b.score - a.score);
```

**Target pattern:**

```typescript
import orderBy from "lodash/orderBy";
// ...
const sorted = orderBy(scored, ["score"], ["desc"]);
return sorted.map(({ entry }) => entry);
```

**Files to edit:**

- `src/skills/__helpers/marketplace.ts` -- add `import orderBy from "lodash/orderBy"`, replace sort call, adjust return

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The `.sort()` call in marketplace.ts replaced with `orderBy`
- Return value semantics preserved (array of entries sorted by score desc)

### 3. Replace Array.sort() with lodash orderBy in ledger.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the `.sort()` call in `packages/luca-framework/src/state/ledger.ts` (line 391) with lodash `orderBy`. This sorts `rows` by `sequence_number` ascending. The current pattern mutates the `rows` array in-place.

**Current pattern (line 391):**

```typescript
rows.sort((a, b) => Number(a.sequence_number) - Number(b.sequence_number));
```

**Target pattern:**

```typescript
import orderBy from "lodash/orderBy";
// ...
const sorted = orderBy(rows, [(r) => Number(r.sequence_number)], ["asc"]);
```

Note: `sequence_number` may be a BigInt from SpacetimeDB, hence the `Number()` conversion must be preserved.

**Files to edit:**

- `packages/luca-framework/src/state/ledger.ts` -- add `import orderBy from "lodash/orderBy"`, replace sort call, assign to `sorted`, use `sorted` in subsequent slice operations

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The `.sort()` call in ledger.ts replaced with `orderBy`
- `Number()` conversion preserved for BigInt safety
- Subsequent `result` slicing operations use the new sorted variable

### 4. Create shared MuninnDB types file

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-observer/lib/muninn-types.ts` as the single source of truth for MuninnDB API response types. Both `muninn-config.ts` (server-side) and `use-memory.ts` (client-side) currently define overlapping but slightly divergent interfaces.

The shared file should contain the superset of fields from both sources. Then update both files to import from the shared types file.

**Types to unify:**

| Server (`muninn-config.ts`) | Client (`use-memory.ts`) | Shared name           |
| --------------------------- | ------------------------ | --------------------- |
| `MuninnEngram`              | `Engram`                 | `MuninnEngram`        |
| `MuninnActivation`          | `ActivationItem`         | `MuninnActivation`    |
| `MuninnSessionEntry`        | `SessionEntry`           | `MuninnSessionEntry`  |
| `MuninnStatsResponse`       | `StatsResponse`          | `MuninnStatsResponse` |

Field reconciliation (use superset):

- `MuninnEngram`: server has `embed_dim?`, client has `memory_type?`, `state?`, `updated_at?` -- include all
- `MuninnActivation`: server has `score_components?`, `dormant?` -- client has `tags?`, `memory_type?`, `why?` -- include all
- `MuninnSessionEntry`: identical across both
- `MuninnStatsResponse`: server has full `coherence` shape, client has partial -- use server's full shape

**Files to create:**

- `packages/luca-observer/lib/muninn-types.ts` -- shared type definitions

**Files to edit:**

- `packages/luca-observer/lib/muninn-config.ts` -- remove type definitions, import from `./muninn-types`
- `packages/luca-observer/hooks/use-memory.ts` -- remove type definitions, import from `~/lib/muninn-types`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No type definitions remain in `muninn-config.ts` or `use-memory.ts` (except `MuninnClient`, `MuninnMemoryData`, `MuninnHealthResponse` which are unique to their files)
- Both files import from `muninn-types.ts`
- The `MuninnHealthResponse` interface stays in `muninn-config.ts` (server-only, not used client-side)

## Verification

1. `bunx --bun tsc --noEmit` exits 0
2. No `Array.sort()` calls remain in `format.ts`, `marketplace.ts`, or `ledger.ts`
3. `grep -r "\.sort(" src/shared/__helpers/format.ts src/skills/__helpers/marketplace.ts packages/luca-framework/src/state/ledger.ts` returns empty
4. `muninn-types.ts` exists and exports `MuninnEngram`, `MuninnActivation`, `MuninnSessionEntry`, `MuninnStatsResponse`
5. No duplicate type definitions in `muninn-config.ts` or `use-memory.ts`

## Success Criteria

- All 5 `Array.sort()` call sites in the 3 audited files replaced with lodash `orderBy`
- MuninnDB types unified into single shared source file
- TypeScript compilation clean
- No behavioral changes (sort order and return values preserved)

## Output Specification

- Modified: `src/shared/__helpers/format.ts`
- Modified: `src/skills/__helpers/marketplace.ts`
- Modified: `packages/luca-framework/src/state/ledger.ts`
- Created: `packages/luca-observer/lib/muninn-types.ts`
- Modified: `packages/luca-observer/lib/muninn-config.ts`
- Modified: `packages/luca-observer/hooks/use-memory.ts`

## Post-Execution Note

After all Phase 14 plans complete, the user must manually run `bun run build:all` outside Claude Code to sync generated outputs. This is required because `build:all` crashes Claude Code.
