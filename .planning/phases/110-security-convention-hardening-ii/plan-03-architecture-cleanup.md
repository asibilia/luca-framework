---
id: 110-03
title: "Architecture Cleanup: observer-emitter Move, LedgerFilters Type, Schema Coupling Docs, db.ts Thread-Safety Docs"
phase: 110
wave: 1
depends_on: []
complexity: SIMPLE
---

# Plan 110-03: Architecture Cleanup

## Objective

Address four architecture and documentation gaps identified in the re-audit. The `observer-emitter.ts`
file lives at the domain root of `packages/luca-framework/src/state/` — per the domain architecture
rule, the only file allowed at the domain root is `index.ts`; all helpers must live in `__helpers/`.
The `LedgerFilters` in `ledger.ts` is an `interface`, which should be a `type` alias per TypeScript
convention for simple object shapes. The observer-local schemas in `lib/types.ts` duplicate
luca-framework schemas — this coupling is undocumented and should be clarified with inline comments.
Finally, `db.ts` uses a mutable globalThis store with no documentation of its concurrency model.

## Context

- @packages/luca-framework/src/state/observer-emitter.ts — helper file at domain root instead of `__helpers/`
- @packages/luca-framework/src/state/bridge.ts — imports `emitObserverEvent` from `"./observer-emitter"` (must update to `"./__helpers/observer-emitter"`)
- @packages/luca-framework/src/state/index.ts — does NOT currently export observer-emitter (confirm)
- @packages/luca-framework/src/state/ledger.ts — `LedgerFilters` declared as `interface` on line 53
- @packages/luca-observer/lib/types.ts — contains observer-local mirrors of luca-framework schemas (LedgerEntrySchema, HarnessResultSnapshotSchema, etc.) without coupling documentation
- @packages/luca-observer/lib/db.ts — in-memory event store via globalThis with no thread-safety documentation

## Tasks

### Task 1: Move `observer-emitter.ts` to `__helpers/` per domain architecture rule

**Goal:** The domain architecture rule states the only `.ts` file allowed at the domain root is
`index.ts`. All other code lives in `__schemas/`, `__helpers/`, entity dirs, or named subdirs.
`observer-emitter.ts` is a helper file and must move to `state/__helpers/`.

**Files:**

- `packages/luca-framework/src/state/observer-emitter.ts` — move to `packages/luca-framework/src/state/__helpers/observer-emitter.ts`
- `packages/luca-framework/src/state/bridge.ts` — update import path

**Steps:**

1. Create the `__helpers/` directory if it does not already exist:
   ```bash
   ls packages/luca-framework/src/state/__helpers/ 2>/dev/null || echo "does not exist"
   ```
2. Move the file:
   ```bash
   git mv packages/luca-framework/src/state/observer-emitter.ts \
           packages/luca-framework/src/state/__helpers/observer-emitter.ts
   ```
3. In `bridge.ts`, update the import from:
   ```typescript
   import { emitObserverEvent } from "./observer-emitter";
   ```
   to:
   ```typescript
   import { emitObserverEvent } from "./__helpers/observer-emitter";
   ```
4. Verify no other files import from the old path:
   ```bash
   grep -rn "from.*state/observer-emitter\|from.*./observer-emitter" \
     packages/luca-framework/src/ --include="*.ts"
   ```
5. Confirm that `index.ts` does not export `observer-emitter` — the emitter is an internal bridge
   implementation detail and should not be in the public API barrel.

**Verification:**

- [ ] `packages/luca-framework/src/state/observer-emitter.ts` no longer exists
- [ ] `packages/luca-framework/src/state/__helpers/observer-emitter.ts` exists
- [ ] `bridge.ts` imports from `./__helpers/observer-emitter`
- [ ] `grep -rn "from.*./observer-emitter" src/` (at domain root level) returns no results
- [ ] `bunx --bun tsc --noEmit` passes in `packages/luca-framework`
- [ ] `bun test packages/luca-framework/` passes

### Task 2: Convert `LedgerFilters` from `interface` to `type` alias

**Goal:** `LedgerFilters` is a simple object shape with no inheritance and is used only as a
parameter type. TypeScript `type` aliases are preferred for plain object shapes that do not need
`extends` or declaration merging. This follows the project convention of using `interface` only
when extension semantics are needed.

**Files:**

- `packages/luca-framework/src/state/ledger.ts` — lines 53-59: change `interface` to `type`

**Steps:**

1. On lines 53-59 in `ledger.ts`, change:
   ```typescript
   export interface LedgerFilters {
     session_id?: string;
     event_type?: string;
     since?: string;
     limit?: number;
     tail?: number;
   }
   ```
   to:
   ```typescript
   export type LedgerFilters = {
     session_id?: string;
     event_type?: string;
     since?: string;
     limit?: number;
     tail?: number;
   };
   ```
2. No call site changes are needed — the type is structurally identical and TypeScript will accept
   the same object shapes.

**Verification:**

- [ ] `grep -n "interface LedgerFilters" packages/luca-framework/src/state/ledger.ts` returns no results
- [ ] `grep -n "type LedgerFilters" packages/luca-framework/src/state/ledger.ts` returns a match
- [ ] `bunx --bun tsc --noEmit` passes in `packages/luca-framework`
- [ ] Export in `index.ts` (`export type { LedgerFilters }`) still works

### Task 3: Document observer-local schema coupling with luca-framework schemas

**Goal:** The `lib/types.ts` file in `packages/luca-observer` contains 10+ schemas that are
described as "observer-local mirrors" of luca-framework types (e.g., `LedgerEntrySchema`,
`HarnessResultSnapshotSchema`, `IterationRecordSnapshotSchema`). These were intentionally duplicated
to avoid cross-package dependency. This design decision is not documented, leaving future developers
uncertain whether to update both copies or import from luca-framework. Add clear coupling
documentation.

**Files:**

- `packages/luca-observer/lib/types.ts` — add module-level and per-section comments

**Steps:**

1. Add a module-level JSDoc block at the top of `types.ts` (after imports) explaining the
   coupling strategy:
   ```typescript
   /**
    * Observer-local type definitions.
    *
    * ## Schema Coupling Policy
    *
    * Several schemas in this file are intentional observer-local mirrors of
    * schemas defined in `packages/luca-framework/src/state/` and
    * `packages/luca-framework/src/harness/`. They are duplicated — NOT imported —
    * to avoid a cross-package runtime dependency between luca-observer (Next.js app)
    * and luca-framework (Node/Bun CLI tool).
    *
    * **When luca-framework schemas change**, the corresponding observer-local mirrors
    * must be updated manually:
    * - `LedgerEntrySchema` mirrors `ledger.ts::ledgerEntrySchema`
    * - `HarnessResultSnapshotSchema` mirrors `harness.schemas.ts::HarnessResultSchema`
    *   (with snake_case field names; the original uses camelCase for internal use)
    * - `IterationRecordSnapshotSchema` mirrors luca-framework iteration schemas
    * - `SessionPlanSnapshotSchema` mirrors luca-framework planner schemas
    * - `TribunalResultSnapshotSchema` mirrors luca-framework tribunal schemas
    *
    * All observer-local schemas use snake_case for API compatibility, even when
    * the source schema uses camelCase for internal TypeScript use.
    *
    * @see packages/luca-framework/src/state/ledger.ts
    * @see packages/luca-framework/src/harness/__schemas/harness.schemas.ts
    */
   ```
2. Add a section divider comment before each mirrored schema group (the file already uses
   `// ─── Section Name ───` dividers, so follow that pattern):
   - Add `// NOTE: Observer-local mirror of luca-framework's LedgerEntry` before `LedgerEntrySchema`
   - Add `// NOTE: Observer-local mirror of luca-framework's HarnessResult (snake_case fields)` before `HarnessResultSnapshotSchema`
3. Update the existing per-schema JSDoc comments that say "Observer-local mirror of luca-framework's X"
   to also include the source file path, e.g.:
   ```typescript
   /**
    * Observer-local mirror of luca-framework's HarnessResult.
    *
    * Source: packages/luca-framework/src/harness/__schemas/harness.schemas.ts::HarnessResultSchema
    * Differences: uses snake_case (source uses camelCase for internal TypeScript types).
    * Update this schema when the source schema changes.
    *
    * Uses snake_case for API compatibility.
    */
   ```

**Verification:**

- [ ] Module-level JSDoc block exists and explains the coupling policy
- [ ] Each mirrored schema group has a `// NOTE:` comment with source reference
- [ ] Per-schema JSDoc includes source file path
- [ ] No new code added — documentation changes only
- [ ] `bunx --bun tsc --noEmit` passes in `packages/luca-observer`

### Task 4: Document db.ts mutable store thread-safety model

**Goal:** `db.ts` maintains a mutable in-memory store via `globalThis` that is shared across all
Next.js server requests. The store mutates arrays directly (`store.events.push()`, `store.events.shift()`,
`session.total_events++`). The existing comment mentions "HMR-safe" but does not address concurrency.
Document the thread-safety model explicitly so developers understand why this design is acceptable
and what its limitations are.

**Files:**

- `packages/luca-observer/lib/db.ts` — update module-level comment and `getStore()` JSDoc

**Steps:**

1. Expand the existing module-level comment block:
   ```typescript
   /**
    * In-memory event store.
    *
    * ## Design
    *
    * Uses an in-memory JavaScript object on `globalThis` to survive Next.js
    * hot module replacement (HMR) during development.
    *
    * ## Thread-Safety Model
    *
    * Node.js (and Bun) run JavaScript on a single thread with an event loop.
    * All request handlers in Next.js run on the same thread. Therefore:
    * - Array mutations (`push`, `shift`) are NOT subject to data races
    * - Counter increments (`nextId++`, `total_events++`) are NOT subject to races
    * - No locking, mutexes, or atomic operations are needed
    *
    * **Limitation**: This store is process-local. If the observer is deployed
    * across multiple processes (e.g., PM2 cluster mode, multiple Kubernetes pods),
    * events are NOT shared between processes. For multi-process deployments, replace
    * the globalThis store with an external store (Redis, SpacetimeDB, etc.).
    *
    * ## Memory Management
    *
    * Events are capped at MAX_EVENTS (default 10,000, configurable via
    * LUCA_OBSERVER_MAX_EVENTS). Oldest events are evicted when the cap is exceeded.
    * Sessions are not evicted automatically.
    *
    * @see SpacetimeDB integration planned for a future phase
    */
   ```
2. Add a brief comment on `getStore()` explaining the globalThis pattern:
   ```typescript
   /**
    * Get or initialize the singleton event store.
    *
    * Uses globalThis to survive Next.js HMR — module-level variables are
    * re-initialized on each HMR reload, but globalThis persists for the
    * lifetime of the process.
    */
   ```

**Verification:**

- [ ] Module-level comment explicitly addresses thread-safety model
- [ ] Comment explains single-threaded event loop rationale (no data races)
- [ ] Comment documents multi-process limitation
- [ ] `getStore()` has a JSDoc explaining the globalThis pattern
- [ ] No code changes — documentation only
- [ ] `bunx --bun tsc --noEmit` passes in `packages/luca-observer`

## Success Criteria

- [ ] `observer-emitter.ts` moved to `state/__helpers/observer-emitter.ts` — domain root is clean
- [ ] `bridge.ts` import updated to `./__helpers/observer-emitter`
- [ ] `LedgerFilters` is a `type` alias, not an `interface`
- [ ] `types.ts` module-level JSDoc documents the observer-local mirror policy
- [ ] Each mirrored schema has a `// NOTE:` comment referencing its source
- [ ] `db.ts` documents the single-threaded thread-safety model and multi-process limitation
- [ ] `bun test packages/luca-framework/` passes
- [ ] `bunx --bun tsc --noEmit` passes in both packages
