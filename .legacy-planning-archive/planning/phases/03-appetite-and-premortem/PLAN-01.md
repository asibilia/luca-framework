---
phase: 3
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 3 Plan 1: Appetite Declaration System

## Objective

Implement the appetite declaration system (#99) — the "fixed appetite, variable scope" constraint that gives developers control over investment ceilings. This plan creates the appetite utility helpers, wires the bridge SETTABLE_FIELDS update, adds appetite guard logic to phase-execute, and adds appetite awareness to lu-planner.

## Context

Read these files for implementation context:

- @packages/luca-framework/src/state/utils/ — Existing state utilities (budget-utils.ts, cli-utils.ts, complexity-utils.ts) for pattern reference
- @packages/luca-framework/src/state/bridge.ts — Bridge CLI with SETTABLE_FIELDS allowlist (line ~443)
- @src/skills/general/phase-execute.skill.ts — Source skill file for appetite guard insertion
- @src/agents/luca/lu-planner.agent.ts — Planner agent to add appetite constraint awareness
- @.planning/phases/03-appetite-and-premortem/03-CONTEXT.md — Resolved gray areas and implementation decisions

## Tasks

### 1. Create appetite-utils.ts helper

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-framework/src/state/utils/appetite-utils.ts` with pure utility functions for appetite level inference and token budget lookup.

Functions to implement:

1. `inferAppetiteFromComplexity(complexity: ComplexityLevel): AppetiteLevel | null`
   - Returns `"Micro"` for TRIVIAL, `"Small"` for SIMPLE, `null` for MODERATE+ (developer must declare)

2. `getAppetiteTokenCeiling(level: AppetiteLevel): number`
   - Lookup table: Micro=25000, Small=50000, Medium=100000, Large=200000, XL=400000

3. `getAppetiteContextPercent(level: AppetiteLevel): number`
   - Lookup table: Micro=30, Small=40, Medium=50, Large=60, XL=70

Import `ComplexityLevel` from `~/complexity`. The appetite level type already exists in `packages/luca-framework/src/state/types.ts` (the `appetite_level` enum field). Use a local string literal union type matching the existing schema values: `"Micro" | "Small" | "Medium" | "Large" | "XL"`.

Follow the pattern of existing files in `packages/luca-framework/src/state/utils/` (e.g., `complexity-utils.ts`). Use JSDoc documentation per mandatory-documentation rule. Use `Bun.file` or pure functions only — no classes.

**Files to create:**

- `packages/luca-framework/src/state/utils/appetite-utils.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes with no errors from the new file
- All three functions are exported and properly typed
- Import path `~/complexity` resolves correctly (T0 -> T1 import is valid per module-boundary rules)

### 2. Add appetite_used_tokens to bridge SETTABLE_FIELDS

**Type:** auto
**TDD:** false
**Depends on:** none

Add `"appetite_used_tokens"` to the `SETTABLE_FIELDS` array in `packages/luca-framework/src/state/bridge.ts` (line ~443). This allows skills to track token consumption via `set-field --field=appetite_used_tokens --value=N`.

The field already exists in the state machine's WorkflowContext (added in Phase 2 #106). It just needs to be exposed through the bridge CLI's allowlist.

**Files to edit:**

- `packages/luca-framework/src/state/bridge.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The SETTABLE_FIELDS array contains `"appetite_used_tokens"` alongside the existing `"appetite_level"`, `"appetite_token_ceiling"`, and `"appetite_context_percent"` entries

### 3. Add appetite guard to phase-execute skill

**Type:** auto
**TDD:** false
**Depends on:** 1

Add appetite guard instructions to `src/skills/general/phase-execute.skill.ts`. Insert a new section in the skill content that checks appetite budget at wave boundaries.

The appetite guard follows the same pattern as the existing "Pre-wave context budget check" (around line 353 in the current source). Add the appetite check AFTER the context budget check but BEFORE spawning executors for the wave.

**Guard logic to add:**

1. Before each wave, read appetite state from bridge:

   ```bash
   APPETITE_JSON=$(bun run packages/luca-framework/src/state/bridge.ts read-field --field=appetite_level 2>/dev/null || echo '{"value":null}')
   APPETITE_TOKENS=$(bun run packages/luca-framework/src/state/bridge.ts read-field --field=appetite_used_tokens 2>/dev/null || echo '{"value":0}')
   APPETITE_CEILING=$(bun run packages/luca-framework/src/state/bridge.ts read-field --field=appetite_token_ceiling 2>/dev/null || echo '{"value":0}')
   ```

2. If `appetite_level` is set and `appetite_token_ceiling > 0`:
   - Calculate `percent_used = (appetite_used_tokens / appetite_token_ceiling) * 100`
   - If `percent_used >= 80 and < 100`: Log warning, continue execution
   - If `percent_used >= 100`: PAUSE and present developer options:
     - (a) Extend appetite by N tokens (update ceiling via bridge set-field)
     - (b) Scope-cut remaining work (mark remaining plans as deferred)
     - (c) Halt and preserve progress (write .continue-here.md and stop)

3. After each wave completes, update `appetite_used_tokens` via bridge:
   ```bash
   bun run packages/luca-framework/src/state/bridge.ts set-field --field=appetite_used_tokens --value=NEW_TOTAL 2>/dev/null || true
   ```

Add this as a new subsection within the "Execute Waves" step (Step 4), between the context budget check and the executor spawning.

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The skill content includes appetite guard logic with 80% warning and 100% pause thresholds
- The guard uses bridge CLI commands (not direct state machine access)
- The guard follows the same pattern as the existing context budget check

### 4. Add appetite constraint awareness to lu-planner

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `src/agents/luca/lu-planner.agent.ts` to include appetite-aware planning instructions. Add a new section or extend the existing `planning_methodology` section.

**Instructions to add:**

1. Before creating plans, read appetite state from bridge:

   ```bash
   APPETITE_JSON=$(bun run packages/luca-framework/src/state/bridge.ts read-status 2>/dev/null || echo '{}')
   ```

2. If appetite is set:
   - Shape scope to fit within the declared token budget
   - If creating multiple plans, distribute the budget across plans proportionally
   - If total estimated scope exceeds budget: flag to the orchestrator that scope exceeds appetite
   - Prefer fewer, focused plans over many broad ones when budget is tight

3. If `appetite_level < complexity floor` (e.g., Micro appetite for a MODERATE task):
   - Flag the conflict explicitly in the plan output
   - Suggest decomposition or deferral options

Add this as a new section named `appetite_awareness` with order 8 (after `quality_guidelines`).

**Files to edit:**

- `src/agents/luca/lu-planner.agent.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The planner agent config includes appetite awareness instructions
- Instructions reference bridge CLI for reading appetite state

### 5. Add appetite declaration step to phase-discuss skill

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `src/skills/general/phase-discuss.skill.ts` to include an appetite declaration step after discussion completes but before emitting the state transition.

**Logic to add (after CONTEXT.md write, before next steps):**

1. Read complexity from bridge
2. Call `inferAppetiteFromComplexity(complexity)` logic:
   - If TRIVIAL: auto-set appetite to Micro via bridge `set-field`
   - If SIMPLE: auto-set appetite to Small via bridge `set-field`
   - If MODERATE+: prompt developer to declare appetite level:

     ```
     Appetite Declaration Required

     Complexity is {COMPLEXITY}. Choose your investment ceiling:

     | Level  | Token Budget | Context Budget | Best For                    |
     |--------|-------------|----------------|-----------------------------|
     | Medium | 100,000     | 50%            | Standard feature (default)  |
     | Large  | 200,000     | 60%            | Cross-cutting work          |
     | XL     | 400,000     | 70%            | Architectural change        |

     Select appetite level (Medium/Large/XL):
     ```

   - Set the chosen level + corresponding token ceiling + context percent via bridge set-field

3. Add bridge set-field commands:
   ```bash
   bun run packages/luca-framework/src/state/bridge.ts set-field --field=appetite_level --value='"Medium"' 2>/dev/null || true
   bun run packages/luca-framework/src/state/bridge.ts set-field --field=appetite_token_ceiling --value=100000 2>/dev/null || true
   bun run packages/luca-framework/src/state/bridge.ts set-field --field=appetite_context_percent --value=50 2>/dev/null || true
   ```

Add this as a new step after the CONTEXT.md write step in both interactive and auto modes.

**Files to edit:**

- `src/skills/general/phase-discuss.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The skill includes appetite declaration logic
- TRIVIAL/SIMPLE auto-infer; MODERATE+ prompts the developer
- Bridge set-field commands are used for state persistence

## Verification

1. `bunx --bun tsc --noEmit` passes across all modified and new files
2. `appetite-utils.ts` exports three pure functions with correct return types
3. `SETTABLE_FIELDS` in bridge.ts includes `appetite_used_tokens`
4. phase-execute skill includes appetite guard at wave boundaries (80%/100% thresholds)
5. lu-planner agent includes appetite-aware planning instructions
6. phase-discuss skill includes appetite declaration step

## Success Criteria

- Appetite levels (Micro/Small/Medium/Large/XL) are fully defined with token budgets and context percents
- TRIVIAL/SIMPLE tasks auto-infer appetite; MODERATE+ requires developer declaration
- Appetite guard pauses execution at 100% budget and warns at 80%
- Planner shapes scope to fit within declared budget
- All state changes flow through the bridge CLI (no direct state machine manipulation from skills)

## Output Specification

- New file: `packages/luca-framework/src/state/utils/appetite-utils.ts`
- Modified: `packages/luca-framework/src/state/bridge.ts` (SETTABLE_FIELDS)
- Modified: `src/skills/general/phase-execute.skill.ts` (appetite guard)
- Modified: `src/agents/luca/lu-planner.agent.ts` (appetite awareness)
- Modified: `src/skills/general/phase-discuss.skill.ts` (appetite declaration)
