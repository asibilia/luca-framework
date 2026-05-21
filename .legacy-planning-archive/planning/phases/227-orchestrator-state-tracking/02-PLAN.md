---
phase: 227
plan: 2
type: improvement
autonomous: true
wave: 02
depends_on: [1]
---

# Phase 227 Plan 2: Fix Skill Spec State Tracking Gaps

## Objective

Fix all 5 orchestrator skill specs so that every state transition writes `current_state` to the context file using typed helpers (no `as any`), and all specs include the "NEVER inline" constraint. This closes the audit gaps that prevent pre-step hooks from enforcing sub-skill ordering.

## Context

@.planning/phases/227-orchestrator-state-tracking/01-CONTEXT.md
@src/skills/general/pr-address.skill.ts
@src/skills/luca/lu-phase-loop.skill.ts
@src/skills/general/phase-execute.skill.ts
@src/skills/general/verify.skill.ts
@src/skills/general/milestone-complete.skill.ts

## Tasks

### 1. Remove `as any` casts from phase-execute.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Remove all `as any` casts from `writePhaseExecuteContext()` calls in the template string content of `phase-execute.skill.ts`. Now that `current_state` is in the schema (Wave 01), the typed write helper accepts the field directly.

There are 8 occurrences of `as any` in this file. Replace each:

```
writePhaseExecuteContext({ current_state: "..." } as any)
```

with:

```
writePhaseExecuteContext({ current_state: "..." })
```

**Files to create/edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Grep for `as any` in the file returns zero results
- All `writePhaseExecuteContext` calls still include `current_state`
- `bunx --bun tsc --noEmit` passes

### 2. Add "NEVER inline" constraint to phase-execute.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Add a "NEVER inline" constraint to the phase-execute skill spec, matching the pattern used in lu.skill.ts and milestone-complete.skill.ts. Add it to the rules/constraints section of the template string:

```
**NEVER inline sub-skill logic.** If a sub-skill fails, re-invoke it. Do NOT copy its implementation into this orchestrator.
```

**Files to create/edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Grep for "NEVER inline" in the file returns at least one result
- `bunx --bun tsc --noEmit` passes

### 3. Remove `as any` casts from milestone-complete.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Remove all `as any` casts from `writeMilestoneCompleteContext()` calls in the template string content of `milestone-complete.skill.ts`. There are 5 occurrences.

Replace each:

```
writeMilestoneCompleteContext({ current_state: "..." } as any)
```

with:

```
writeMilestoneCompleteContext({ current_state: "..." })
```

**Files to create/edit:**

- `src/skills/general/milestone-complete.skill.ts`

**Verification:**

- Grep for `as any` in the file returns zero results
- All `writeMilestoneCompleteContext` calls still include `current_state`
- `bunx --bun tsc --noEmit` passes

### 4. Add current_state writes to pr-address.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Add `current_state` write instructions after every Skill() call in the pr-address skill spec. This is Gap 1 from the audit -- pr-address has ZERO state write instructions, so the pre-step hook cannot validate sub-skill ordering.

The pr-address state machine is: `idle -> fetched -> validated -> debated -> fixed -> learned -> pushed`

Add `writePrContext({ current_state: "..." })` instructions at these points in the template string:

1. After initialization: `writePrContext({ current_state: "idle" })`
2. After `Skill("pr-fetch")`: `writePrContext({ current_state: "fetched" })`
3. After `Skill("pr-validate")`: `writePrContext({ current_state: "validated" })`
4. After `Skill("pr-debate")` (or skip): `writePrContext({ current_state: "debated" })`
5. After `Skill("pr-fix")`: `writePrContext({ current_state: "fixed" })`
6. After `Skill("pr-learn")` (or skip): `writePrContext({ current_state: "learned" })`
7. After `Skill("pr-respond")`: `writePrContext({ current_state: "pushed" })`
8. On failure: `writePrContext({ current_state: "failed" })`

Also add a "CRITICAL: current_state Tracking" section to the spec matching the pattern in other orchestrators, and update the checklist to verify current_state writes.

**Files to create/edit:**

- `src/skills/general/pr-address.skill.ts`

**Verification:**

- Grep for `current_state` in the file returns at least 8 results (one per state + docs)
- Grep for `writePrContext` in the file returns at least 8 results
- No `as any` casts used
- `bunx --bun tsc --noEmit` passes

### 5. Add current_state writes to lu-phase-loop.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Add `current_state` write instructions to the lu-phase-loop skill spec during phase loop execution. This is Gap 2 from the audit -- lu-phase-loop has ZERO state write instructions during the phase loop.

The lu-phase-loop needs to write state at these points in the template string (using `writeLuContext` since it writes to the lu context file):

1. Before entering the phase loop: `writeLuContext({ current_state: "executing" })` (may already be set by lu orchestrator, but lu-phase-loop should confirm it)
2. After each phase-discuss call: document the state write
3. After each phase-plan call: document the state write
4. After each phase-execute call: document the state write
5. After milestone gate check: document the state write
6. On completion: `writeLuContext({ current_state: "complete" })` is already documented (line 676) -- verify it is in a code block with the actual write call

Add a brief "current_state Tracking" note to the constraints section explaining that the phase loop must write state transitions for hook enforcement.

**Files to create/edit:**

- `src/skills/luca/lu-phase-loop.skill.ts`

**Verification:**

- Grep for `current_state` in the file returns multiple results
- Grep for `writeLuContext` in the file returns multiple results
- No `as any` casts used
- `bunx --bun tsc --noEmit` passes

### 6. Migrate verify.skill.ts from manual I/O to typed helpers

**Type:** auto
**TDD:** false
**Depends on:** none

Replace manual file I/O patterns in verify.skill.ts with `writeVerifyContext()` calls. This is Gap 4 from the audit. The verify spec currently shows patterns like:

```typescript
await writeVerifyContext({} as any);
ctx.current_state = "idle";
```

Replace all such patterns with typed helper calls:

```typescript
await writeVerifyContext({ current_state: "idle" });
```

Also remove all `as any` casts from any remaining `writeVerifyContext` calls.

**Files to create/edit:**

- `src/skills/general/verify.skill.ts`

**Verification:**

- Grep for `as any` in the file returns zero results
- Grep for manual property assignment (`ctx.current_state =` or `ctx1.current_state =` etc.) returns zero results
- All state transitions use `writeVerifyContext({ current_state: "..." })` pattern
- `bunx --bun tsc --noEmit` passes

### 7. Add "NEVER inline" constraint to verify.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Add a "NEVER inline" constraint to the verify skill spec, matching the pattern used in lu.skill.ts and milestone-complete.skill.ts:

```
**NEVER inline sub-skill logic.** If a sub-skill fails, re-invoke it. Do NOT copy its implementation into this orchestrator.
```

**Files to create/edit:**

- `src/skills/general/verify.skill.ts`

**Verification:**

- Grep for "NEVER inline" in the file returns at least one result
- `bunx --bun tsc --noEmit` passes

## Verification

1. Run `bunx --bun tsc --noEmit` -- all files compile cleanly
2. Grep across all 5 skill spec files for `as any` -- zero results in any of them
3. Grep for `current_state` in `pr-address.skill.ts` -- at least 8 occurrences
4. Grep for `current_state` in `lu-phase-loop.skill.ts` -- multiple occurrences
5. Grep for "NEVER inline" in `phase-execute.skill.ts` and `verify.skill.ts` -- at least one occurrence each
6. Grep for manual property assignment patterns (`ctx.*current_state =`) in `verify.skill.ts` -- zero results

## Success Criteria

- All 5 orchestrator skill specs write `current_state` after every state transition
- Zero `as any` casts remain in any orchestrator skill spec
- All 5 specs include "NEVER inline" constraint
- verify.skill.ts uses exclusively typed helper calls (no manual file I/O)
- Pre-step hooks can now read `current_state` from every orchestrator's context file to enforce sub-skill ordering

## Output Specification

- 5 modified skill spec files:
  - `src/skills/general/phase-execute.skill.ts`
  - `src/skills/general/milestone-complete.skill.ts`
  - `src/skills/general/pr-address.skill.ts`
  - `src/skills/general/verify.skill.ts`
  - `src/skills/luca/lu-phase-loop.skill.ts`
