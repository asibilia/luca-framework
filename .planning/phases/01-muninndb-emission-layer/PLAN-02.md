---
phase: 1
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 01 Plan 2: Bridge & Hook Integration

## Objective

Wire the emitter module (built in Plan 1) into the existing state machine bridge and add a bridge CLI subcommand for hook scripts. After this plan, every state transition, field set, suspend, and resume automatically emits an engram to MuninnDB, and hook scripts can emit events via `run_bridge emit-event`.

## Context

Read these files to understand integration points:

- @packages/luca-framework/src/state/bridge.ts (primary integration target -- handleTransition, handleSetField, handleSuspend, handleResumePhase)
- @packages/luca-framework/src/emitter/index.ts (barrel from Plan 1 -- emit functions to call)
- @packages/luca-framework/src/emitter/\_\_helpers/emit-functions.ts (convenience functions: emitStateTransition, emitSessionStart, etc.)
- @src/hooks/scripts/\_lib/common.sh (run_bridge pattern for hook-to-framework communication)
- @.planning/phases/01-muninndb-emission-layer/01-CONTEXT.md (emission trigger points table)
- @.planning/phases/01-muninndb-emission-layer/01-RESEARCH.md (integration points section, bridge integration strategy)

## Tasks

### 1. Wire Emission Calls into All Bridge Handlers

**Type:** auto
**TDD:** false
**Depends on:** none (Plan 1 must be complete)

In `packages/luca-framework/src/state/bridge.ts`, add an import from the emitter module and wire fire-and-forget emission calls into all four bridge handlers that perform state/lifecycle operations. These all follow an identical pattern: a `void emit*()` call placed after the existing ledger/state write operation.

**Import to add:**

```typescript
import {
  emitStateTransition,
  emitPhaseStart,
  emitPhaseComplete,
} from "../emitter";
```

**Handler 1 -- handleTransition:**

After the existing `appendLedgerEntry(record).catch(...)` call, add:

```typescript
// Emit state transition to MuninnDB (fire-and-forget, non-blocking)
void emitStateTransition({
  previous_state: String(prevState),
  current_state: String(nextSnapshot.value),
  event_type: eventType,
  session_id: nextSnapshot.context.session_id,
  metadata: {
    milestone: nextSnapshot.context.current_milestone ?? undefined,
    phase: nextSnapshot.context.current_phase ?? undefined,
    complexity: nextSnapshot.context.complexity,
    branch: nextSnapshot.context.branch ?? undefined,
  },
});
```

**Handler 2 -- handleSetField:**

After the existing `appendLedgerEntry(fieldRecord).catch(...)` call, add:

```typescript
// Emit field change to MuninnDB (fire-and-forget)
void emitStateTransition({
  previous_state: String(snapshotJson!.value),
  current_state: String(snapshotJson!.value), // State unchanged on field set
  event_type: "field_set",
  session_id: (updatedContext.session_id as string) ?? "",
  metadata: {
    milestone: (updatedContext.current_milestone as string) ?? undefined,
    phase: (updatedContext.current_phase as number) ?? undefined,
    complexity: (updatedContext.complexity as string) ?? undefined,
  },
});
```

This reuses `emitStateTransition` since a field set is semantically a state observation (same state, different context).

**Handler 3 -- handleSuspend:**

After the `updateStateMd(actor)` call, add:

```typescript
// Emit phase suspend to MuninnDB (fire-and-forget)
void emitPhaseComplete({
  phase_id: phaseId,
  status: "suspended",
  session_id: sessionId,
  metadata: {
    milestone: nextSnapshot.context.current_milestone ?? undefined,
    phase: phaseId,
    complexity: nextSnapshot.context.complexity,
  },
});
```

Use `emitPhaseComplete` with status "suspended" (semantically a phase lifecycle event).

**Handler 4 -- handleResumePhase:**

After the `updateStateMd(actor)` call, add:

```typescript
// Emit phase resume to MuninnDB (fire-and-forget)
void emitPhaseStart({
  phase_id: phaseId,
  session_id: nextSnapshot.context.session_id,
  metadata: {
    milestone: nextSnapshot.context.current_milestone ?? undefined,
    phase: phaseId,
    complexity: nextSnapshot.context.complexity,
  },
});
```

Use `emitPhaseStart` since resuming a phase is semantically starting the next execution segment.

**Key requirements for all handlers:**

- Use `void` prefix (fire-and-forget pattern, consistent with bridge conventions)
- Import emit functions from `../emitter`
- Pass context fields as plain values (not the full context object)
- Optional metadata fields use `?? undefined` to avoid passing null
- Emission calls placed AFTER ledger/state writes, never before

**Files to edit:**

- `packages/luca-framework/src/state/bridge.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Import is at top of file, separated from other import groups
- All 4 handlers have emission calls after their respective ledger/state operations
- All emission calls use `void` prefix (not `.catch()` for emit functions since they never throw)
- No `await` on any emission call (non-blocking)

### 2. Add emit-event Bridge Subcommand

**Type:** auto
**TDD:** false
**Depends on:** 1

Add a new `emit-event` subcommand to the bridge CLI. This is how hook scripts emit events without needing to import TypeScript modules directly.

Changes to `packages/luca-framework/src/state/bridge.ts`:

1. Add `"emit-event"` to the `VALID_SUBCOMMANDS` array
2. Add `emit-event` to the `HELP_TEXT` under a new "Observability commands:" section
3. Create a `handleEmitEvent(args: string[])` function
4. Add the case to the switch statement in `runBridgeCli()`
5. Export `handleEmitEvent` from the module

The `handleEmitEvent` function:

- Required arg: `--type=<event_type>` (e.g., `session:start`, `phase:complete`, `agent:spawn`)
- Optional args: `--session=<session_id>`, `--data=<json>`, `--milestone=<version>`, `--phase=<number>`, `--complexity=<level>`, `--branch=<name>`
- If `--session` is not provided, try to read from state file (fallback to empty string)
- Builds the appropriate `EmissionEvent` and calls the corresponding emit function
- For `session:start`: calls `emitSessionStart()`
- For `session:end`: calls `emitSessionEnd()` (also flushes)
- For `phase:start`: calls `emitPhaseStart()`
- For `phase:complete`: calls `emitPhaseComplete()`
- For `decision:made`: calls `emitDecision()`
- For `agent:spawn`: calls `emitAgentSpawn()`
- For `agent:complete`: calls `emitAgentComplete()`
- For `finding:captured`: calls `emitFinding()`
- For generic/unknown types: calls `emitStateTransition()` as catch-all
- Output: `{ emitted: true, type: "<event_type>" }` JSON to stdout
- On failure: log to stderr but still exit 0 (emission failures are never fatal)

Update `HELP_TEXT` to include:

```
Observability commands (1):
  emit-event             Emit event to MuninnDB (--type=eventType [--session=id] [--data=json])
```

Update `VALID_SUBCOMMANDS` to include `"emit-event"`.

**Files to edit:**

- `packages/luca-framework/src/state/bridge.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Subcommand is in VALID_SUBCOMMANDS array
- `handleEmitEvent` is exported
- HELP_TEXT includes the new command
- Exit code is always 0 (emissions are never fatal)
- Dispatches to `emitAgentSpawn`, `emitAgentComplete`, and `emitFinding` for corresponding event types

### 3. Update Bridge Documentation (JSDoc and Rule File)

**Type:** auto
**TDD:** false
**Depends on:** 2

Update documentation to reflect the new `emit-event` subcommand.

**bridge.ts JSDoc:**

- Change subcommand count from 13 to 14
- Add `emit-event` to the subcommand list in the doc comment
- Update any related documentation strings

**`.claude/rules/state-machine-bridge.md` rule file:**

This is the source-of-truth rule file (root-level, not generated). Apply the following updates:

1. Replace any remaining "SpacetimeDB" references with "MuninnDB" in the observability section (stale naming from a previous architecture)
2. Remove the phantom `emit-context-snapshot` command if it appears in the rule (exists in rule text but not in actual code)
3. Add a new "Observability Commands (1)" section documenting `emit-event`:

```markdown
### Observability Commands (1)

| Command                                                 | Description            | Output                   |
| ------------------------------------------------------- | ---------------------- | ------------------------ |
| `emit-event --type=<type> [--session=id] [--data=json]` | Emit event to MuninnDB | JSON with emitted status |
```

4. Update the total subcommand count from "**Total: 13 subcommands**" to "**Total: 14 subcommands** (6 read + 2 write + 5 lifecycle + 1 observability)"

NOTE: Do NOT edit generated files in `.claude/` or `.cursor/` output directories. The file `.claude/rules/state-machine-bridge.md` is a source-of-truth rule file, not a generated output -- it is safe to edit directly.

**Files to edit:**

- `packages/luca-framework/src/state/bridge.ts` (JSDoc only)
- `.claude/rules/state-machine-bridge.md` (add emit-event documentation, fix stale references)

**Verification:**

- JSDoc says "14" subcommands
- `emit-event` appears in the JSDoc subcommand list
- Rule file documents the new subcommand under "Observability Commands (1)"
- No stale "SpacetimeDB" references remain in the rule file
- No phantom `emit-context-snapshot` command in the rule file
- Total count reads "14 subcommands" with category breakdown

## Verification

After all tasks complete:

1. `bunx --bun tsc --noEmit` passes with zero errors
2. `handleTransition` includes emission call after ledger entry
3. `handleSetField` includes emission call after ledger entry
4. `handleSuspend` includes emission call after STATE.md update
5. `handleResumePhase` includes emission call after STATE.md update
6. `emit-event` subcommand is registered and dispatched
7. All emission calls use `void` prefix (fire-and-forget)
8. No emission call uses `await` (non-blocking)
9. Bridge still functions correctly when MuninnDB is not running (emissions silently fail)

## Success Criteria

- Every state transition automatically emits an engram to MuninnDB
- Hook scripts can emit events via `run_bridge emit-event --type=session:start --session=<id>`
- Hook scripts can emit agent and finding events via the same subcommand
- Emission failures never crash the bridge or block state transitions
- Bridge subcommand count is accurately documented as 14
- The `state-machine-bridge.md` rule reflects the new `emit-event` subcommand with no stale references

## Output Specification

- Modified file: `packages/luca-framework/src/state/bridge.ts` (new import, 4 emission calls in handlers, new subcommand handler, updated JSDoc)
- Modified file: `.claude/rules/state-machine-bridge.md` (new subcommand documentation, stale reference cleanup)
- No new files created (all code lives in existing bridge.ts)
