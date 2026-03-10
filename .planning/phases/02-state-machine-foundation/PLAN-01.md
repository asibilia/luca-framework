---
phase: 2
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 2 Plan 1: State Machine Foundation for v4 Appetite, Guards, and Cooldown

## Objective

Extend the Luca workflow state machine with appetite-level tracking, new guard invocation points, and a cooldown state. This creates the typed foundation that all downstream v4 components (pre-mortem agent, process data collection, retro agent) depend on.

## Context

@packages/luca-framework/src/state/types.ts — WorkflowContext schema, events, and types
@packages/luca-framework/src/state/machine.ts — XState machine definition, actions, state transitions
@packages/luca-framework/src/state/guards.ts — Guard functions (pure, boolean-returning)
@packages/luca-framework/src/state/bridge.ts — CLI bridge (14 subcommands, SETTABLE_FIELDS, read/write handlers)
@packages/luca-framework/src/state/snapshot.ts — STATE.md generator (generateSnapshot)
@.planning/phases/02-state-machine-foundation/02-CONTEXT.md — Resolved design decisions

## Tasks

### 1. Extend WorkflowContext Schema (types.ts)

**Type:** auto
**TDD:** false
**Depends on:** none

Add appetite, pre-mortem, process data, and cooldown fields to `workflowContextSchema` in `types.ts`. Add `"cooldown"` to `WORKFLOW_STATES`. Add new event types to `workflowEventSchema`.

**Schema additions to `workflowContextSchema`:**

```
// Appetite (v4)
appetite_level: z.enum(["Micro", "Small", "Medium", "Large", "XL"]).default("Medium"),
appetite_token_ceiling: z.number().nonnegative().default(100000),
appetite_context_percent: z.number().min(0).max(100).default(50),
appetite_used_tokens: z.number().nonnegative().default(0),

// Pre-mortem result (v4 — populated by pre-mortem agent in Phase 3)
pre_mortem_result: z.object({
  risks: z.array(z.string()).default([]),
  mitigations: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0),
  timestamp: z.string().default(""),
}).optional(),

// Process data (v4 — populated by process data agent in Phase 4)
process_data: z.object({
  tokens_used: z.number().nonnegative().default(0),
  context_percent_used: z.number().min(0).max(100).default(0),
  agent_invocations: z.number().nonnegative().default(0),
  wall_clock_ms: z.number().nonnegative().default(0),
  timestamp: z.string().default(""),
}).optional(),

// Cooldown (v4)
cooldown_reason: z.string().optional(),
```

**State additions:**

- Add `"cooldown"` to `WORKFLOW_STATES` array

**Event additions to `workflowEventSchema`:**

- `COOLDOWN_COMPLETE` — triggers `cooldown` -> `idle`
- `SKIP_COOLDOWN` — triggers `complete` -> `idle` (bypass cooldown)
- `PREMORTEM_COMPLETE` — carries pre-mortem result data (for `discussing` guard)
- `PROCESS_DATA_COMPLETE` — carries process data (for `learning` guard)

**Files to create/edit:**

- `packages/luca-framework/src/state/types.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All new fields have Zod `.default()` or `.optional()` for backward compatibility
- `"cooldown"` appears in `WORKFLOW_STATES`
- New event types appear in `workflowEventSchema`
- `appetite_level` enum values match spec: Micro, Small, Medium, Large, XL

### 2. Add Guards for Appetite, Pre-mortem, and Process Data (guards.ts)

**Type:** auto
**TDD:** false
**Depends on:** 1

Add guard functions for the three new invocation points.

**New guards in `workflowGuards`:**

1. **`appetiteWithinBudget`** — checks `appetite_context_percent` against `process_data.context_percent_used`. Used at `wave_evaluating` boundary in phase actor. Returns true if no process data exists yet (first wave).

2. **`shouldRunPremortem`** — checks if pre-mortem gate is enabled via `context.gates.premortem`. Used in `discussing` state to determine whether to invoke pre-mortem agent. Returns false if gate is absent or false.

3. **`shouldRunProcessData`** — checks if process data gate is enabled via `context.gates.process_data`. Used in `learning` state to invoke process data collection after lu-learner. Returns false if gate is absent or false.

**Files to create/edit:**

- `packages/luca-framework/src/state/guards.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Guards are pure functions with `{ context, event }` signature
- Guards follow existing pattern (using `get` from lodash where appropriate)
- Guard names are added to `workflowGuards` object

### 3. Add Cooldown State and Update Transitions (machine.ts)

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Modify `machine.ts` to add the `cooldown` state and update existing transitions.

**Changes:**

1. **`complete` state** — change from `type: "final"` to a regular state with transitions:
   - On `COOLDOWN_COMPLETE` or default: transition to `cooldown`
   - On `SKIP_COOLDOWN`: transition to `idle` (with `resetContext` action)
   - Keep `RESET` handler if present

2. **New `cooldown` state:**
   - On `COOLDOWN_COMPLETE`: transition to `idle` (with `resetContext` action)
   - After `idleTimeout`: transition to `idle` (safety net — cooldown should not hang)

3. **New actions:**
   - `recordCooldownReason`: assign `cooldown_reason` from event data
   - `recordPremortemResult`: assign `pre_mortem_result` from `PREMORTEM_COMPLETE` event
   - `recordProcessData`: assign `process_data` from `PROCESS_DATA_COMPLETE` event

4. **`discussing` state** — add `PREMORTEM_COMPLETE` event handler that records result and continues to `planning` (guard-gated in future phases; for now, the event is wired but optional)

5. **`learning` state** — add `PROCESS_DATA_COMPLETE` event handler that records process data and continues to `committing`

6. **Update `committing` state** — when `COMMIT_COMPLETE` fires and `hasMorePhases` is false, transition to `complete` (which now routes to `cooldown`)

7. **Update `resetContext` action** — add clearing of new v4 fields to prevent carryover across sessions:
   - `pre_mortem_result: undefined`
   - `process_data: undefined`
   - `cooldown_reason: undefined`
   - `appetite_used_tokens: 0`

**Files to create/edit:**

- `packages/luca-framework/src/state/machine.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `complete` is no longer `type: "final"`
- `cooldown` state exists with `COOLDOWN_COMPLETE` -> `idle` transition
- `SKIP_COOLDOWN` from `complete` -> `idle` works
- `PREMORTEM_COMPLETE` event is handled in `discussing`
- `PROCESS_DATA_COMPLETE` event is handled in `learning`
- `resetContext` clears `pre_mortem_result`, `process_data`, `cooldown_reason`, `appetite_used_tokens`

### 4. Update Bridge CLI (bridge.ts)

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Update the bridge CLI to expose appetite fields and premortem gate check.

**Changes:**

1. **`handleReadStatus`** — add appetite fields to the output:
   - `appetite_level`
   - `appetite_token_ceiling`
   - `appetite_context_percent`
   - Add defaults for these in `statusDefaults`

2. **`SETTABLE_FIELDS`** — add to the allowlist:
   - `appetite_level`
   - `appetite_token_ceiling`
   - `appetite_context_percent`

3. **`handleGateCheck`** — no code change needed; `gate-check --gate=premortem` already works via `context.gates[gateName]` lookup. Just verify it works for the new gate name.

**Files to create/edit:**

- `packages/luca-framework/src/state/bridge.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `read-status` JSON output includes `appetite_level`, `appetite_token_ceiling`, `appetite_context_percent`
- `set-field --field=appetite_level --value="Small"` is accepted (field in allowlist)
- `gate-check --gate=premortem` returns `{ gate: "premortem", enabled: false }` by default

### 5. Update STATE.md Snapshot (snapshot.ts)

**Type:** auto
**TDD:** false
**Depends on:** 1

Add an Appetite section to `generateSnapshot()` that renders appetite fields in STATE.md.

**Changes:**

1. Add `cooldown: "Cooldown"` to the `formatState` labels map.

2. Add a new `## Appetite` section in `generateSnapshot()` after the Current Position section:

```markdown
## Appetite

- **Level:** Medium
- **Token Ceiling:** 100000
- **Context Budget:** 50%
```

Only render the section when `appetite_level` is present (which it always will be due to the `.default("Medium")`).

**Files to create/edit:**

- `packages/luca-framework/src/state/snapshot.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Generated STATE.md includes `## Appetite` section with Level, Token Ceiling, and Context Budget
- Cooldown label renders correctly in the Current Position status field
- `formatState("cooldown")` returns `"Cooldown"`

## Verification

After all tasks are complete, run the full typecheck to ensure no regressions:

```bash
bunx --bun tsc --noEmit
```

Manually verify by reading the modified files:

1. `types.ts` — new schema fields parse cleanly with `workflowContextSchema.parse({})`
2. `machine.ts` — `complete` state is non-final, `cooldown` state exists
3. `guards.ts` — three new guards present and typed correctly
4. `bridge.ts` — `SETTABLE_FIELDS` includes appetite fields, `read-status` output includes them
5. `snapshot.ts` — Appetite section renders, cooldown label present

## Success Criteria

- All five files modified with zero type errors
- Backward compatibility maintained: existing state JSON files parse without errors (all new fields have defaults)
- New `WORKFLOW_STATES` array includes `cooldown`
- New events (`COOLDOWN_COMPLETE`, `SKIP_COOLDOWN`, `PREMORTEM_COMPLETE`, `PROCESS_DATA_COMPLETE`) are in the event discriminated union
- Bridge `read-status` includes appetite data
- Bridge `set-field` can modify appetite fields
- STATE.md snapshot includes Appetite section
- `complete` state routes to `cooldown` by default, with `SKIP_COOLDOWN` bypass to `idle`

## Output Specification

Modified files:

- `packages/luca-framework/src/state/types.ts` — extended schema + events
- `packages/luca-framework/src/state/guards.ts` — 3 new guards
- `packages/luca-framework/src/state/machine.ts` — cooldown state + new actions/transitions
- `packages/luca-framework/src/state/bridge.ts` — appetite in read-status + SETTABLE_FIELDS
- `packages/luca-framework/src/state/snapshot.ts` — appetite section + cooldown label
