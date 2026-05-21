---
title: "Step Enforcement Phase 1: XState Value Normalization"
area: state-machine
created: 2026-03-31
source: conversation — pipeline step enforcement planning session
priority: high
depends_on: []
blocks: step-enforcement-phase-2-compound-sub-states
---

## Context

During `/lu` end-to-end testing, the LLM skipped code review with no enforcement preventing it. Root cause: once the state machine reaches `executing`, the enforcement hook (`pre-step-lu.ts`) allows ALL phase agents because they all list `executing` as a valid state. Steps can run in any order or be skipped entirely.

The correct fix is XState compound sub-states (making `executing` a compound state with child states for each pipeline step). But compound states change `snapshot.value` from a string (`"executing"`) to an object (`{ executing: "reviewing" }`), which breaks 22 call sites across 6 files that use `String(snapshot.value)`.

**This todo is Phase 1:** Create a `resolveStateValue()` normalization utility and replace all 22 call sites. This is a safe, zero-behavior-change prerequisite that makes Phase 2 (compound states) have zero additional breakage.

Expert panel (3 agents: XState expert, architecture reviewer, migration analyst) unanimously agreed on this two-phase strategy. XState v5 documentation confirms `invoke` and `states` coexist on the same node — the existing `phaseActor` stays alive across sub-state transitions.

## Task

### Wave 1.1: Create utility

**New file: `packages/luca-framework/src/state/__helpers/resolve-state-value.ts`**

Two functions:

1. `resolveStateValue(value: unknown): string` — Normalizes XState snapshot value to top-level state string. Handles both flat (`"executing"` → `"executing"`) and compound (`{ executing: "reviewing" }` → `"executing"`). Falls back to `"idle"`.

2. `resolveStatePath(value: unknown): string` — Extracts full state path. Returns `"executing.reviewing"` for `{ executing: "reviewing" }`, or `"executing"` for flat strings. Falls back to `"idle"`.

Export both from `packages/luca-framework/src/state/index.ts` barrel.

### Wave 1.2: Replace all 22 call sites

**`packages/luca-framework/src/state/bridge.ts`** (15 call sites):

- Line 131: `String(written.value)` → `resolveStateValue(written.value)`
- Line 134: `String(written.value)` → `resolveStateValue(written.value)`
- Line 192: `String(snapshot.value)` → `resolveStateValue(snapshot.value)`
- Line 569: `String(snapshotJson!.value)` → `resolveStateValue(snapshotJson!.value)`
- Line 570: `String(snapshotJson!.value)` → `resolveStateValue(snapshotJson!.value)`
- Line 584: `String(snapshotJson!.value)` → `resolveStateValue(snapshotJson!.value)`
- Line 585: `String(snapshotJson!.value)` → `resolveStateValue(snapshotJson!.value)`
- Line 600: `String(snapshotJson!.value)` → `resolveStateValue(snapshotJson!.value)`
- Line 672: `String(nextSnapshot.value)` → `resolveStateValue(nextSnapshot.value)`
- Line 686: `String(nextSnapshot.value)` → `resolveStateValue(nextSnapshot.value)`
- Line 719: `String(nextSnapshot.value) === "idle"` → `resolveStateValue(nextSnapshot.value) === "idle"`
- Line 914: `String(snapshot.value)` → `resolveStateValue(snapshot.value)`
- Line 930: `String(nextSnapshot.value) === String(prevState)` → `resolveStateValue(nextSnapshot.value) === resolveStateValue(prevState)`
- Line 978: `String(nextSnapshot.value)` → `resolveStateValue(nextSnapshot.value)`

**`packages/luca-framework/src/state/machine.ts`** (1 call site):

- Line 674: `snapshot.value as string` → `resolveStateValue(snapshot.value)` (in `getAllowedEvents`)

**`packages/luca-framework/src/state/snapshot.ts`** (1 call site — JSDoc example):

- Line 214: Update doc example to use `resolveStateValue(snapshot.value)`

**`src/hooks/__helpers/orchestrator-gate-config.ts`** (1 call site):

- Line 179: `String(raw.value ?? "idle")` → `resolveStateValue(raw.value ?? "idle")`

**`src/hooks/__helpers/enforcement-hook-factory.ts`** (1 call site):

- Line 310: `String((raw as Record<string, unknown>).value ?? "idle")` → `resolveStateValue((raw as Record<string, unknown>).value)`

**`src/hooks/scripts/statusline.ts`** (1 call site):

- Line 77: `(get(raw, "value", "idle") as string).toLowerCase()` → `resolveStateValue(get(raw, "value", "idle")).toLowerCase()`

### Wave 1.3: Update `computePipelinePosition` signature

**`packages/luca-framework/src/state/__helpers/pipeline-position.ts`**:

- Add second optional parameter `fullStatePath?: string`
- Extend `PipelinePosition` type with compound positions: `"executing.discussing"`, `"executing.planning"`, `"executing.running"`, `"executing.harnessing"`, `"executing.verifying"`, `"executing.reviewing"`, `"executing.learning"`, `"executing.committing"`
- When `fullStatePath` is provided and matches `executing.*`, return the compound position
- When not provided, return `"executing"` as before (backward compat)

**`src/hooks/__helpers/enforcement-hook-factory.ts`**:

- When `use_computed_position` is true, also compute `resolveStatePath(raw.value)` and pass as second arg to `computePipelinePosition()`

### Wave 1.4: Verify

- `bunx --bun tsc --noEmit` passes
- `grep -rn "String(.*snapshot\.value\|String(.*\.value\|\.value as string" packages/luca-framework/src/state/ src/hooks/` — expect 0 matches
- Existing behavior is identical (all states are still flat strings)

## Notes

- The `orchestrator-gate-config.ts` edit gate should NOT pass `fullStatePath` to `computePipelinePosition()` — it only needs the coarse position for edit permission checking
- Only the enforcement hook factory (`use_computed_position: true` path) needs the finer positions
- This phase ships independently and can be validated in isolation before Phase 2
- Total: 8 files modified, 22 call sites replaced, 1 new file created
