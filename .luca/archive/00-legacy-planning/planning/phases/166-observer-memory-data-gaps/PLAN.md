---
phase: 166
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 166 Plan 1: Fix Observer Memory Page Data Gaps

## Objective

Fix 3 issues that prevent data from displaying on the observer `/memory` page:

1. `checkpoint` and `zone-history` API routes use `process.cwd()` directly, which resolves to the Next.js server's working directory rather than the project root — files are never found.
2. The `checkpoint` route reads `.context-checkpoint.json`, which only exists after compaction events. The live session data is in `.context-metrics.json`.
3. The `context-check-throttled` hook only writes `session:observation-*` engrams on zone transitions, so steady-state "peak" sessions produce zero observations for the memory page to display.

## Context

- @packages/luca-observer/app/api/context-metrics/route.ts — reference `findProjectRoot()` implementation
- @packages/luca-observer/app/api/muninn/checkpoint/route.ts — fix target (path + file source)
- @packages/luca-observer/app/api/muninn/zone-history/route.ts — fix target (path only)
- @src/hooks/impl/context-check-throttled.ts — add initial observation write
- @packages/luca-observer/components/memory/recall-effectiveness.tsx — improve empty state message

## Tasks

### 1. Fix checkpoint route: path resolution + correct data source

**Type:** auto
**TDD:** false
**Depends on:** —

The `/api/muninn/checkpoint/route.ts` has two bugs:

**Bug A — Path:** Uses `process.cwd()` which in Next.js dev mode resolves to the Next.js package directory, not the project root. Apply the same `findProjectRoot()` + env-var pattern used by `/api/context-metrics/route.ts`.

**Bug B — File:** Reads `.context-checkpoint.json`, which only exists after a compact event. The always-present live data file is `.context-metrics.json`, written every ~60 seconds by the statusline hook. Switch to reading `.context-metrics.json` and parse it with the existing `ContextMetricsSchema` (inline it in this file as done in the reference route, or import `CheckpointResponseSchema` only if it already covers the same shape — prefer the field-forward approach from `context-metrics/route.ts` so the existing `CheckpointResponseSchema` validation still passes).

The `checkpoint_age_seconds` computation from `checked_at` is correct and should be preserved.

**Files to create/edit:**

- `packages/luca-observer/app/api/muninn/checkpoint/route.ts`

**Verification:**

- `access`, `findProjectRoot` are imported from `node:fs/promises` and `node:path`
- The file path references `.context-metrics.json`, not `.context-checkpoint.json`
- `findProjectRoot(process.cwd())` is called with `LUCA_PROJECT_DIR` / `WORKSPACE_ROOT` env-var override, matching the pattern in the reference route
- `checkpoint_age_seconds` computation is preserved

### 2. Fix zone-history route: path resolution

**Type:** auto
**TDD:** false
**Depends on:** —

The `/api/muninn/zone-history/route.ts` reads `.context-metrics.json` (correct file) but uses `process.cwd()` (incorrect path). Apply the same `findProjectRoot()` pattern.

Copy `findProjectRoot()` verbatim from the reference route and update the `filePath` construction to use the resolved workspace root.

**Files to create/edit:**

- `packages/luca-observer/app/api/muninn/zone-history/route.ts`

**Verification:**

- `access` imported from `node:fs/promises`
- `resolve` imported from `node:path`
- `findProjectRoot()` function present
- `filePath` uses `join(workspaceRoot, ".planning", ".context-metrics.json")`

### 3. Add initial observation write to context-check-throttled hook

**Type:** auto
**TDD:** false
**Depends on:** —

The observation write in `context-check-throttled.ts` is gated by `if (currSev > prevSev)` — it only fires when the zone worsens. During a typical session that stays in "peak", no observations are ever written to MuninnDB, so the `/memory` page shows empty.

Add a first-invocation observation write that fires unconditionally on the first time the hook runs in a session (i.e., when the throttle file does not exist). This gives the memory page at least one observation from session start.

Implementation approach:

- Detect first invocation: the throttle file does not exist when the check reaches the "write timestamp" step. Capture this as a boolean `isFirstInvocation` before writing the throttle file.
- After the existing zone transition observation block (after the `if (currSev > prevSev)` block), add a separate `if (isFirstInvocation)` block that writes an observation with `source: "session_start"`.
- Reuse the same git branch / diff / phase context reading logic. Extract it into a small helper within `main()` or inline it, keeping the code readable without duplication.
- The observation concept key should be `session:observation-${Date.now()}` with tags `["session", "observation", "session-start"]`.

**Files to create/edit:**

- `src/hooks/impl/context-check-throttled.ts`

**Verification:**

- `isFirstInvocation` is set to `true` when the throttle file does not exist before writing it
- A `session:observation-*` engram is written with `source: "session_start"` inside the `if (isFirstInvocation)` block
- The existing zone-transition observation block is unchanged
- Hook still exits 0 (all new code inside try/catch)

### 4. Improve recall-effectiveness empty state message

**Type:** auto
**TDD:** false
**Depends on:** —

The current empty state says "Metrics are captured during memory operations," which is not accurate for this project — `metric:*` engrams are only written by the phase-execute verification pipeline. Update the message to match the CONTEXT.md decision: explain that metrics are collected during phase execution, so the section stays empty during normal interactive sessions.

**Files to create/edit:**

- `packages/luca-observer/components/memory/recall-effectiveness.tsx`

**Verification:**

- `EmptyState` message updated to communicate that metrics are collected during phase execution, not manual memory operations
- `title` and `message` props are the only changes — component logic is untouched

## Verification

1. Run `bunx --bun tsc --noEmit` — no new type errors
2. Manually start the observer (`bun run dev` inside `packages/luca-observer`) and navigate to `/memory`
3. Confirm checkpoint section shows data (zone, usage_percent, checkpoint_age_seconds) rather than all-null defaults
4. Confirm zone-history section renders the current entry rather than an empty timeline
5. Confirm observations list has at least one entry after a fresh session with the updated hook
6. Confirm the recall effectiveness empty state shows the phase-execution message when no metrics exist

## Success Criteria

- `/memory` page checkpoint card shows live `zone` and `usage_percent` values
- `/memory` page zone-history section shows at least the current snapshot entry
- Observations section populates from session start (not only after zone worsening)
- Recall effectiveness section displays an informative empty state for non-autopilot sessions
- No TypeScript errors introduced

## Output Specification

4 modified files:

- `packages/luca-observer/app/api/muninn/checkpoint/route.ts`
- `packages/luca-observer/app/api/muninn/zone-history/route.ts`
- `src/hooks/impl/context-check-throttled.ts`
- `packages/luca-observer/components/memory/recall-effectiveness.tsx`
