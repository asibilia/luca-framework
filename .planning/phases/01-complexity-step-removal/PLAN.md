---
phase: 1
plan: 1
title: "Complexity Zero-Value Fix & /lu Routing Alignment"
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 01 Plan 1: Complexity Zero-Value Fix & /lu Routing Alignment

## Objective

Eliminate all zero-value iteration parameters and conditional step gating so that every workflow step runs meaningfully at every complexity level. After this plan, TRIVIAL and SIMPLE tasks get at least 1 iteration of plan verification, verify-fix, and memory recall -- matching the stated "always-on" policy. The /lu skill routing aligns with autopilot's mandatory pipeline.

## Context

@.planning/phases/01-complexity-step-removal/01-RESEARCH.md
@.planning/phases/01-complexity-step-removal/01-CONTEXT.md
@src/complexity/**schemas/complexity.schemas.ts
@src/complexity/**helpers/defaults.ts
@.planning/config.json
@src/skills/luca/lu.skill.ts
@src/agents/general/lu-cognition.agent.ts
@src/hooks/scripts/session-start.sh
@src/hooks/pi-extensions/\_\_helpers/session-init.ts

## Tasks

### 1. Tighten Schema Constraints

**Type:** auto
**TDD:** false
**Depends on:** none

Update `ComplexityGateSchema` in `src/complexity/__schemas/complexity.schemas.ts` to enforce minimum-1 iterations and add `recallDepth` as a validated field.

**Changes:**

1. Line 120: Change `planVerificationIterations: z.number().int().nonnegative()` to `planVerificationIterations: z.number().int().positive()`
2. Line 124: Change `verifyFixIterations: z.number().int().nonnegative()` to `verifyFixIterations: z.number().int().positive()`
3. After the `verificationMode` field (line 126), add: `recallDepth: z.number().int().min(1).nullable().optional()` with a JSDoc comment explaining semantics (positive integer = hard cap on recall entries; null = use tier-scaled defaults; omitted = no cap)

**Files to create/edit:**

- `src/complexity/__schemas/complexity.schemas.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The schema rejects `planVerificationIterations: 0` and `verifyFixIterations: 0`
- The schema accepts `recallDepth: null`, `recallDepth: 3`, and absent `recallDepth`
- The schema rejects `recallDepth: 0`

### 2. Fix Config & Default Values (4 files)

**Type:** auto
**TDD:** false
**Depends on:** 1

Update all four locations where the complexity matrix is defined to floor iteration values at 1 and include `recallDepth`.

**2a. `.planning/config.json`**

Update the `complexity.matrix` section:

- `TRIVIAL.planVerificationIterations`: 0 -> 1
- `TRIVIAL.verifyFixIterations`: 0 -> 1
- `TRIVIAL.recallDepth`: 0 -> 1
- `SIMPLE.planVerificationIterations`: 0 -> 1
- `SIMPLE.recallDepth`: 0 -> 1

**2b. `src/complexity/__helpers/defaults.ts`**

Add `recallDepth` field to every level in `DEFAULT_COMPLEXITY_MATRIX`:

- TRIVIAL: `recallDepth: 1`
- SIMPLE: `recallDepth: 1`
- MODERATE: `recallDepth: 3`
- COMPLEX: `recallDepth: null`
- CRITICAL: `recallDepth: null`

**2c. `src/hooks/scripts/session-start.sh` (lines 265-266)**

Fix the inline fallback matrix:

- `TRIVIAL`: `planVerificationIterations: 0` -> `1`, `verifyFixIterations: 0` -> `1`
- `SIMPLE`: `planVerificationIterations: 0` -> `1`

**2d. `src/hooks/pi-extensions/__helpers/session-init.ts` (lines 328-340)**

Fix the fallback matrix:

- `TRIVIAL.planVerificationIterations`: 0 -> 1
- `TRIVIAL.verifyFixIterations`: 0 -> 1
- `SIMPLE.planVerificationIterations`: 0 -> 1

**Files to create/edit:**

- `.planning/config.json`
- `src/complexity/__helpers/defaults.ts`
- `src/hooks/scripts/session-start.sh`
- `src/hooks/pi-extensions/__helpers/session-init.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -r "planVerificationIterations.*0\|verifyFixIterations.*0" src/ .planning/` returns zero matches (no remaining zeros)
- `grep -r "recallDepth.*0[^.]" .planning/config.json` returns zero matches

### 3. Align /lu Skill Routing to Mandatory Pipeline

**Type:** auto
**TDD:** false
**Depends on:** none

Update the Step 4 routing text in `src/skills/luca/lu.skill.ts` to remove conditional gate checks and make all pipeline steps unconditionally mandatory, matching the autopilot pattern.

**Changes to the task routing section (lines ~128-137):**

Replace the current conditional gate text:

```
**Task routing (via state machine or gate checks):**

For phase work, query the state machine or use `luca_gate_check` to determine which steps should run based on the classified complexity:

1. Check `research` gate (if required/optional): `Skill(skill: "phase-research")`
2. Check `discussion` gate (if required/optional/run): `Skill(skill: "phase-discuss")`
3. Always plan (if no plans exist): `Skill(skill: "phase-plan")`
4. Always execute: `Skill(skill: "phase-execute")`
```

With the mandatory pipeline text:

```
**Task routing (all steps mandatory):**

For phase work, execute ALL steps in order. Every step runs at every complexity level -- the only way to skip is explicit `--skip-*` flags:

1. Always discuss: `Skill(skill: "phase-discuss", args: "{phase_number}")`
2. Always plan (spawns research internally): `Skill(skill: "phase-plan", args: "{phase_number}")`
3. Always execute: `Skill(skill: "phase-execute", args: "{phase_number}")`
```

Also remove the reference to `luca_gate_check` -- the `Alternatively, hand off to the autopilot skill` sentence below can remain.

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The compiled skill text no longer contains "gate check" or "if required/optional"
- The routing list has 3 mandatory steps (discuss, plan, execute) with no conditionals

### 4. Remove Dead recallDepth==0 Branch in lu-cognition

**Type:** auto
**TDD:** false
**Depends on:** none

Update the "Complexity-Gated Recall Depth" instructions in `src/agents/general/lu-cognition.agent.ts` (lines 396-400) to remove the dead `recallDepth == 0` skip branch, since the minimum is now 1.

**Change the 4-step list:**

```
1. Read recallDepth from complexity matrix for current complexity level
2. IF recallDepth == 0: skip recall entirely (lite mode handles TRIVIAL/SIMPLE)
3. IF recallDepth is a number (e.g., 3): cap entries at recallDepth regardless of tier
4. IF recallDepth is null: use tier-scaled defaults below
```

**To a 3-step list:**

```
1. Read recallDepth from complexity matrix for current complexity level
2. IF recallDepth is a number (e.g., 1 for TRIVIAL, 3 for MODERATE): cap entries at recallDepth regardless of tier
3. IF recallDepth is null (COMPLEX/CRITICAL): use tier-scaled defaults below
```

**Files to create/edit:**

- `src/agents/general/lu-cognition.agent.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The agent text no longer contains "recallDepth == 0" or "skip recall entirely"

## Verification

After all 4 tasks are complete:

1. **Type check**: `bunx --bun tsc --noEmit` passes clean
2. **Zero-value audit**: `grep -rn "planVerificationIterations.*: 0\|verifyFixIterations.*: 0\|recallDepth.*: 0" src/ .planning/config.json` returns no matches
3. **Conditional gate audit**: `grep -n "gate_check\|if required/optional" src/skills/luca/lu.skill.ts` returns no matches
4. **Dead branch audit**: `grep -n "recallDepth == 0\|skip recall entirely" src/agents/` returns no matches
5. **Drift note**: After source changes, user must run `bun run build:all` outside of Claude Code session, then `bun run check:drift` to confirm generated outputs match. CRITICAL: Never run `bun run build:all` during a Claude Code session.

## Success Criteria

- All iteration parameters across all 4 matrix locations have a minimum value of 1
- The `ComplexityGateSchema` rejects zero values for `planVerificationIterations` and `verifyFixIterations`
- The `ComplexityGateSchema` validates `recallDepth` (min 1, nullable, optional)
- The /lu skill routes phase work through discuss -> plan -> execute unconditionally
- The lu-cognition agent has no dead zero-skip branch for recallDepth
- TypeScript compilation passes clean

## Output Specification

- Modified: `src/complexity/__schemas/complexity.schemas.ts` (schema tightening + recallDepth)
- Modified: `src/complexity/__helpers/defaults.ts` (add recallDepth to defaults)
- Modified: `.planning/config.json` (zero -> 1 fixes)
- Modified: `src/hooks/scripts/session-start.sh` (fallback matrix fix)
- Modified: `src/hooks/pi-extensions/__helpers/session-init.ts` (fallback matrix fix)
- Modified: `src/skills/luca/lu.skill.ts` (mandatory routing)
- Modified: `src/agents/general/lu-cognition.agent.ts` (remove dead branch)
