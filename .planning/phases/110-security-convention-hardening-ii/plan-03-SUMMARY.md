# Plan 110-03 SUMMARY: Architecture Cleanup

**Phase:** 110 | **Wave:** 1 | **Issue:** #44
**Status:** Complete
**Commits:** 4 (+ 1 auto-fix for test import path)

---

## Tasks Completed

### Task 1: Move observer-emitter.ts to \_\_helpers/

**Status:** Done

- Created `packages/luca-framework/src/state/__helpers/` directory
- Moved `observer-emitter.ts` via `git mv` (history preserved)
- Updated import in `bridge.ts` from `"./observer-emitter"` to `"./__helpers/observer-emitter"`
- `index.ts` barrel does not export `observer-emitter` (confirmed — internal detail only)
- Auto-fix applied: moved the corresponding test file from
  `__tests__/packages/luca-framework/src/state/observer-emitter.test.ts` to
  `__tests__/packages/luca-framework/src/state/__helpers/observer-emitter.test.ts`
  and updated its import path to match the new source location

**Verification:**

- `bunx --bun tsc --noEmit` passes in `packages/luca-framework` (EXIT:0)
- No files import from the old `"./observer-emitter"` path
- Domain root is now clean: only `index.ts` at `src/state/`

---

### Task 2: Convert LedgerFilters from interface to type alias

**Status:** Done

- Changed `export interface LedgerFilters {` to `export type LedgerFilters = {` in
  `packages/luca-framework/src/state/ledger.ts` (lines 53-59)
- Added closing `;` per type alias convention
- No call site changes required (structurally identical)

**Verification:**

- `bunx --bun tsc --noEmit` passes (EXIT:0)
- `grep "interface LedgerFilters"` returns no results
- `grep "type LedgerFilters"` returns a match on line 53

---

### Task 3: Document observer-local schema coupling

**Status:** Done

Added to `packages/luca-observer/lib/types.ts`:

1. **Module-level JSDoc block** at the top (after the `import { z }` line) explaining:
   - Why schemas are duplicated (not imported) — cross-package dependency isolation
   - Which observer-local schemas mirror which luca-framework schemas
   - When/how to keep them in sync
   - `@see` references to source files

2. **`// NOTE:` comments** before each mirrored schema group:
   - `// NOTE: Observer-local mirror of luca-framework's LedgerEntry` before `LedgerEntrySchema`
   - `// NOTE: Observer-local mirrors of luca-framework's harness check schemas` before `ParsedErrorSnapshotSchema`
   - `// NOTE: Observer-local mirrors of luca-framework's iteration schemas` before `ConvergenceSignalsSnapshotSchema`
   - `// NOTE: Observer-local mirrors of luca-framework's planner schemas` before `WSJFScoredItemSnapshotSchema`
   - `// NOTE: Observer-local mirrors of luca-framework's tribunal/code-review schemas` before `ReviewFindingSnapshotSchema`

3. **Enriched per-schema JSDoc** for each mirrored schema — added `Source:` and
   `Update this schema when the source schema changes.` lines

**No code changes** — documentation only.

Note: `bunx --bun tsc --noEmit` in `packages/luca-observer` exits with 14 pre-existing errors in
`app/` page components (type mismatches between `z.infer` optional fields and page component
prop requirements). These pre-existed before Plan 110 and are unrelated to Task 3.

---

### Task 4: Document db.ts thread-safety model

**Status:** Done

Updated `packages/luca-observer/lib/db.ts`:

1. **Expanded module-level comment** with a full `## Thread-Safety Model` section documenting:
   - Single-threaded event loop rationale (no data races for push/shift/++)
   - Multi-process limitation (process-local store, not shared across PM2/K8s replicas)
   - Memory management (MAX_EVENTS cap, eviction policy, session retention)
   - `@see SpacetimeDB integration planned for a future phase`

2. **JSDoc for `getStore()`** explaining the globalThis pattern:
   - Why globalThis is used (HMR survival — module-level vars re-initialize, globalThis persists)

**No code changes** — documentation only.

---

## Verification Summary

| Check                               | luca-framework   | luca-observer                           |
| ----------------------------------- | ---------------- | --------------------------------------- |
| `bunx --bun tsc --noEmit`           | PASS (EXIT:0)    | Pre-existing errors (unrelated to plan) |
| `bun test packages/luca-framework/` | 483 pass, 2 fail | N/A                                     |

### Pre-existing test failures (not introduced by this plan)

2 tests fail in `__tests__/packages/luca-framework/src/state/__helpers/observer-emitter.test.ts`:

- `emitObserverEvent > environment gating > does not call fetch when LUCA_OBSERVER_URL is unset`
- `emitObserverEvent > environment gating > does not call fetch when LUCA_OBSERVER_URL is empty string`

These tests assert that `emitObserverEvent()` should NOT call fetch when `LUCA_OBSERVER_URL` is
unset/empty. However, the implementation intentionally defaults to `http://localhost:3456` (a
legitimate localhost endpoint) when the env var is absent, so fetch IS called. This is a
test/implementation mismatch that predated Plan 110 — the tests were run on the old path and
showed this same failure (the test file existed at the old path, was moved to `__helpers/`, and
the same 2 tests continue to fail).

---

## Domain Root Status

`packages/luca-framework/src/state/` now contains only:

- `index.ts` (barrel — the only file allowed at domain root)
- `__helpers/observer-emitter.ts` (moved from domain root)
- All other subdirs: `__schemas/`, `actors/`, `utils/`

The domain architecture rule is now fully satisfied for the `state/` domain.
