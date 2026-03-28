---
phase: 223
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 223 Plan 2: State Machine Orchestrator + Enforcement Layers

## Objective

Rewrite pr-address as a thin orchestrator that delegates entirely to sub-skills via Skill() calls, driven by the XState state machine from Wave 1. Apply all 5 anti-skip enforcement layers end-to-end as the proof-of-concept for the framework's enforcement architecture.

> Appetite: Large (~100,000 tokens remaining of 200,000 ceiling)

## Context

@src/skills/general/pr-address.skill.ts
@src/skills/**schemas/pr-address-context.schemas.ts (created in Wave 1)
@src/skills/**schemas/states/pr-address.states.ts (created in Wave 1)
@src/workflow/**helpers/skill-state-machine.ts
@src/workflow/**helpers/progressive-executor.ts
@src/workflow/**helpers/gap-detector.ts
@src/hooks/**helpers/hook-io.ts
@.planning/phases/223-anti-skip-pilot/01-CONTEXT.md
@.planning/phases/223-anti-skip-pilot/01-PREMORTEM.md

## Tasks

### 1. Rewrite pr-address as thin orchestrator

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 1 artifacts assumed complete)

Replace the current 815-line pr-address.skill.ts with a thin orchestrator that contains ONLY:

1. **Skill() calls** to the 6 sub-skills (pr-fetch, pr-validate, pr-debate, pr-fix, pr-learn, pr-respond)
2. **Context file reads** via `readPrContext()` to check conditions between steps
3. **State machine transitions** via events (FETCH_COMPLETE, VALIDATE_COMPLETE, etc.)

**PREMORTEM Constraint #3 (zero inline logic):** The orchestrator must NOT contain:

- `gh api` calls (moved to pr-fetch, pr-respond)
- Task() spawns (moved to pr-validate, pr-debate, pr-fix, pr-learn)
- YAML parsing or template interpolation
- Comment categorization logic
- Any business logic beyond reading context and choosing the next Skill() call

**Orchestrator flow:**

```
1. Parse args (PR number/URL/flags from Skill() args)
2. Initialize context file with context_version: 1
3. Skill("pr-fetch", "{pr_number}")         -> send FETCH_COMPLETE
4. Skill("pr-validate", "{pr_number}")      -> send CATEGORIZE_COMPLETE, then VALIDATE_COMPLETE
5. Read context: check split_verdicts
   - If split_verdicts present: Skill("pr-debate", "{pr_number}") -> send DEBATE_COMPLETE -> PLAN_COMPLETE
   - If no split_verdicts: send SKIP_DEBATE (explicit skip event, fail-closed)
6. Skill("pr-fix", "{pr_number}")           -> send FIX_COMPLETE -> VERIFY_COMPLETE
7. Read context: check valid_concerns count
   - If concerns exist: Skill("pr-learn", "{pr_number}") -> send LEARN_COMPLETE
   - If no concerns: send SKIP_LEARN (explicit skip event, fail-closed)
8. Skill("pr-respond", "{pr_number}")       -> send RESPOND_COMPLETE -> PUSH_COMPLETE
```

**Error handling (from CONTEXT.md Decision #3):**

- Required sub-skills (pr-fetch, pr-validate, pr-fix, pr-respond) that fail -> send ABORT -> terminal `failed` state
- Optional sub-skills (pr-debate, pr-learn) that fail -> record guard-exception skip entry -> continue to next state

**Vault routing, model resolution, and flag handling** must be preserved from the original (copy the relevant prompt sections).

**Files to edit:**

- `src/skills/general/pr-address.skill.ts` (full rewrite)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Orchestrator prompt contains only Skill() calls, context reads, and state transitions
- No `gh api` calls in orchestrator prompt
- No Task() calls in orchestrator prompt
- SKIP_DEBATE and SKIP_LEARN events are explicitly sent (not omitted)
- Error handling distinguishes required vs optional sub-skills
- `prAddressSkill` export name unchanged (backward compatible)

### 2. Create pr-address DAG definition

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/workflow/__helpers/pr-address-dag.ts` that defines the pr-address workflow as a `WorkflowDAG` (using the `WorkflowDAGSchema` from `workflow.schemas.ts`).

This DAG is consumed by the gap detector for coverage auditing. It is NOT used for runtime execution (the orchestrator prompt drives execution via Skill() calls). The DAG serves as the formal specification of what steps MUST execute.

**DAG steps (mapped from sub-skills):**

| Step ID       | Name                  | Handler     | dependsOn       | optional | Category |
| ------------- | --------------------- | ----------- | --------------- | -------- | -------- |
| pr-fetch      | Fetch PR data         | pr-fetch    | []              | false    | gate     |
| pr-categorize | Categorize comments   | pr-validate | [pr-fetch]      | false    | classify |
| pr-validate   | Validate concerns     | pr-validate | [pr-categorize] | false    | verify   |
| pr-debate     | Debate split verdicts | pr-debate   | [pr-validate]   | **true** | verify   |
| pr-plan       | Plan fixes            | pr-fix      | [pr-validate]   | false    | plan     |
| pr-fix        | Execute fixes         | pr-fix      | [pr-plan]       | false    | execute  |
| pr-verify     | Verify fixes          | pr-fix      | [pr-fix]        | false    | verify   |
| pr-learn      | Capture learnings     | pr-learn    | [pr-verify]     | **true** | learn    |
| pr-respond    | Post responses        | pr-respond  | [pr-verify]     | false    | commit   |
| pr-push       | Push changes          | pr-respond  | [pr-respond]    | false    | commit   |

**PREMORTEM Constraint #2:** pr-debate and pr-learn MUST be `optional: true`. This is the critical configuration that prevents the gap detector from emitting `fail` severity when SKIP_DEBATE or SKIP_LEARN events fire.

**Files to create:**

- `src/workflow/__helpers/pr-address-dag.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports `prAddressDAG` of type `WorkflowDAG`
- pr-debate step has `optional: true`
- pr-learn step has `optional: true`
- All other steps have `optional: false` (default)
- DAG has 10 steps total

### 3. Wire gap detector to pr-address orchestrator

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Add gap detection integration to the pr-address orchestrator. After the orchestrator completes (all Skill() calls done, state machine in `pushed` or `failed` state), it must run the gap detector against the pr-address DAG to verify coverage.

**Implementation approach:**

Add a final verification section to the pr-address orchestrator prompt that instructs the executor to:

1. Build a `DAGCheckpoint` from the orchestrator's execution trace:
   - `completedSteps`: Map each completed Skill() call to a step ID from the DAG
   - `skippedSteps`: For each SKIP_DEBATE or SKIP_LEARN event, create a `SkippedStepEntry` with `reason: "guard-false"` (orchestrator decided, not a guard exception)
   - `failedSteps`: For any failed sub-skill, record the error

2. Call `detectGaps(prAddressDAG, checkpoint)` to audit coverage

3. Report the gap audit result:
   - If `status === "clean"`: Log success, proceed
   - If `status === "gaps_found"` with only `warning` severity: Log warnings, proceed (optional steps missing is acceptable)
   - If `status === "gaps_found"` with any `fail` severity: Log error, halt — required steps were silently skipped

This wiring ensures Layer 4 (gap detection) is active for the pr-address pilot.

**Files to edit:**

- `src/skills/general/pr-address.skill.ts` (add gap detection section to orchestrator prompt)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Orchestrator prompt includes gap detection step after all Skill() calls
- Gap detector is invoked with the pr-address DAG
- Clean execution (no gaps) is the expected outcome for a successful run
- SKIP_DEBATE and SKIP_LEARN are recorded as structured skip entries, not gaps

### 4. Create pre-step enforcement hook for pr-address

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/hooks/scripts/pre-step-pr-address.ts` — a PreToolUse hook that fires before Skill() invocations during pr-address execution.

**Purpose (Layer 3 from Phase 222):** Verify that the state machine is in the correct state before each sub-skill runs. If the orchestrator attempts to call a sub-skill out of order, the hook blocks the call.

**Implementation:**

1. Use `parseHookInput()` from hook-io.ts to read stdin
2. Extract the tool name — only act on Skill tool calls
3. Extract the skill name from tool_input (first positional arg or `skill` field)
4. If the skill name matches a pr-address sub-skill (pr-fetch, pr-validate, pr-debate, pr-fix, pr-learn, pr-respond):
   - Read `/tmp/pr-address-context.json` to determine current state
   - Validate that the state machine would accept the corresponding event
   - If the state transition would be invalid: `exitBlock("pr-address: cannot run {skill} from state {currentState}")`
   - If valid: allow (exit 0)
5. Use `guardPreStep()` for 200ms TTL dedup (Phase 222 PREMORTEM Constraint #2)

**Note on scope:** This hook is a proof-of-concept. It validates the pr-address sub-skill ordering specifically. Phase 224 will generalize this pattern for all decomposed skills.

**Files to create:**

- `src/hooks/scripts/pre-step-pr-address.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Hook uses `parseHookInput`, `guardPreStep`, `exitBlock` from hook-io.ts
- Hook only activates for pr-address sub-skill names
- Hook reads state from context file to validate ordering
- Hook uses 200ms TTL via `guardPreStep`

### 5. Register hook in settings

**Type:** auto
**TDD:** false
**Depends on:** 4

Register the pre-step-pr-address hook in the hooks configuration so it fires during Claude Code sessions.

**Implementation:**

Add the hook to `src/hooks/__helpers/hook-registry.ts` (or wherever hooks are registered) following the existing pattern for PreToolUse hooks. The hook should:

- Fire on PreToolUse event for Skill tool
- Run the compiled shell wrapper from `.claude/hooks/`
- Be scoped to the pr-address sub-skill names

**Important:** Do NOT edit `.claude/hooks/` directly (generated-file-guard rule). Edit the source in `src/hooks/` and the build system will generate the wrapper.

**Files to edit:**

- `src/hooks/__helpers/hook-registry.ts` (or equivalent registration file)
- `src/hooks/__helpers/generate-shell-wrappers.ts` (if needed for new hook entry)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Hook appears in the hook registry
- Hook is configured for PreToolUse event type
- No direct edits to `.claude/hooks/` directory

### 6. Add bridge audit-gaps integration for pr-address

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Verify that the existing `luca-bridge audit-gaps` subcommand (from Phase 222) can accept the pr-address DAG for gap auditing.

**Implementation:**

The bridge `audit-gaps` subcommand already exists from Phase 222. This task ensures it works with the pr-address DAG by:

1. Verifying the `prAddressDAG` export is compatible with the `detectGaps()` function signature
2. Adding a documentation comment in `pr-address-dag.ts` showing how to invoke via bridge:
   ```bash
   luca-bridge audit-gaps --dag=pr-address --checkpoint=/tmp/pr-address-checkpoint.json
   ```
3. If the bridge subcommand needs a DAG registry/lookup mechanism, add the pr-address DAG to it

**Files to edit:**

- `src/workflow/__helpers/pr-address-dag.ts` (add bridge documentation)
- Bridge DAG registry if one exists (check `packages/luca-framework/src/state/bridge.ts`)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- pr-address DAG is importable and type-compatible with `detectGaps`
- Documentation shows bridge invocation pattern

### 7. End-to-end verification checklist

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 1, 2, 3, 4, 5, 6

Final verification that all 5 anti-skip enforcement layers are wired for pr-address.

**Layer verification checklist:**

| Layer                   | Mechanism                     | File                                                                       | Verification                                        |
| ----------------------- | ----------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| L0: Skill Decomposition | 6 atomic sub-skills           | `src/skills/general/pr-{fetch,validate,debate,fix,learn,respond}.skill.ts` | Each sub-skill has a single responsibility boundary |
| L1: State Machine       | XState machine with 12 states | `src/skills/__schemas/states/pr-address.states.ts`                         | Machine accepts all events from CONTEXT.md          |
| L2: Context File        | Versioned JSON with safeParse | `src/skills/__schemas/pr-address-context.schemas.ts`                       | `context_version: z.literal(1)` present             |
| L3: Pre-Step Hook       | PreToolUse enforcement        | `src/hooks/scripts/pre-step-pr-address.ts`                                 | Hook blocks out-of-order sub-skill calls            |
| L4: Gap Detector        | Post-execution coverage audit | `src/workflow/__helpers/pr-address-dag.ts`                                 | DAG has 10 steps, pr-debate/pr-learn optional       |

**Orchestrator zero-inline-logic gate:**

- Read through pr-address.skill.ts and confirm it contains ONLY:
  - Skill() calls to the 6 sub-skills
  - Context file reads via `readPrContext()`
  - State machine transition references
  - Arg parsing and flag handling
  - Vault routing and model resolution (passthrough config)
- Confirm it does NOT contain:
  - `gh api` calls
  - Task() spawns
  - YAML parsing
  - Comment categorization logic
  - Template interpolation for PR comments

**Files to review:**

- All files created/modified in Wave 1 and Wave 2

**Verification:**

- All 5 layers are present and connected
- Orchestrator passes zero-inline-logic gate
- `bunx --bun tsc --noEmit` passes
- PREMORTEM constraints 1-3 are all satisfied

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors across all Wave 2 files
2. pr-address.skill.ts is a thin orchestrator with zero inline logic
3. pr-address DAG has 10 steps with correct optional flags
4. Gap detector integration produces `clean` status for complete execution
5. Pre-step hook blocks out-of-order sub-skill calls
6. All 5 enforcement layers are verifiably wired

## Success Criteria

- pr-address rewritten as thin orchestrator (~200 lines vs original ~815)
- All 5 anti-skip enforcement layers demonstrably active
- State machine drives execution with explicit SKIP events for conditional paths
- Gap detector can audit pr-address execution for coverage
- Pre-step hook enforces sub-skill ordering
- Zero inline logic in orchestrator (PREMORTEM Constraint #3)
- pr-debate and pr-learn correctly marked as optional (PREMORTEM Constraint #2)
- Context file includes version field with safeParse (PREMORTEM Constraint #1)

## Output Specification

- `src/skills/general/pr-address.skill.ts` — rewritten thin orchestrator
- `src/workflow/__helpers/pr-address-dag.ts` — DAG definition for gap detection
- `src/hooks/scripts/pre-step-pr-address.ts` — pre-step enforcement hook
- Hook registry updated with new hook
- Bridge integration verified for pr-address DAG
