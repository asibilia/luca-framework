---
id: 93-A
title: "Root Cause Tribunal for debug fix validation"
phase: 93
wave: 1
complexity: MODERATE
todo: 38
---

# 93-A: Root Cause Tribunal for Debug Fix Validation

## Objective

When lu-debugger proposes a fix for a root cause, activate a Root Cause Tribunal that challenges whether the fix addresses the true cause or merely treats a symptom. The tribunal follows a challenge-defense pattern: lu-verifier independently reproduces the original bug, tests whether the proposed fix resolves it, checks for side effects, and challenges with "Is this treating the symptom or the cause?" If disagreement arises, the debugger defends with evidence while the verifier presents a counterargument, and a third agent (lu-integration-checker) acts as arbiter. The resolution is either "verified fix" or "needs deeper investigation."

This builds on the Verification Tribunal infrastructure from Phase 92-B (T1/T3 conflict resolution) and the Design Tribunal from Phase 91-C (code review debate). The Root Cause Tribunal reuses the same functional patterns (schemas, prompt builders, consensus resolution) but applies them to the debugging domain: debugger-proposed fixes rather than verification conflicts or review disagreements.

The tribunal is gated to COMPLEX+ phases with multi-issue debugging only. Estimated token cost: +20-30k per complex failure set.

## Context

@src/agents/general/lu-debugger.agent.ts -- the debug agent that proposes root causes and fixes; its structured returns (ROOT CAUSE FOUND, DEBUG COMPLETE) are the trigger signals
@src/agents/general/lu-verifier.agent.ts -- the verifier agent; will serve as the challenger that independently tests the proposed fix
@src/agents/\_\_schemas/verification-tribunal.schemas.ts -- T1/T3 tribunal schemas (follow same Zod patterns for new schemas)
@src/agents/\_\_helpers/verification-tribunal.ts -- T1/T3 tribunal helpers (follow same functional patterns: detect, gate, build prompts, resolve)
@src/agents/\_\_schemas/tribunal.schemas.ts -- core Design Tribunal schemas from 91-C (rebuttalSchema, unifiedRecommendationSchema patterns)
@src/agents/\_\_helpers/tribunal-detector.ts -- shouldRunTribunal pattern for complexity gating
@src/agents/\_\_helpers/tribunal-rebuttals.ts -- rebuttal prompt patterns (challenger/defender architecture)
@src/agents/index.ts -- barrel exports; must add new exports here
@src/skills/general/phase-execute.skill.ts -- orchestrator that spawns debuggers in the UAT diagnosis flow (Route C, lines ~1641-1669); integration point for the tribunal
@src/skills/general/debug.skill.ts -- the /debug orchestrator that spawns lu-debugger; secondary integration point
@src/complexity/\_\_schemas/complexity.schemas.ts -- ComplexityLevel, COMPLEXITY_ORDER, meetsThreshold for gating

## Tasks

### Task 1: Define root cause tribunal schemas

**Goal:** Create Zod schemas for the root cause tribunal domain: proposed fix signal, challenge categories, diagnostic perspectives, and tribunal result.

**Files:** `src/agents/__schemas/root-cause-tribunal.schemas.ts` (new)

**Steps:**

1. Create `root-cause-tribunal.schemas.ts` in `src/agents/__schemas/`
2. Define `proposedFixSignalSchema` -- the input that triggers the tribunal:
   - `phase`: z.number().int().positive() -- phase where debugging occurred
   - `debug_session_id`: z.string() -- debug session identifier
   - `root_cause`: z.string() -- the root cause proposed by lu-debugger
   - `proposed_fix`: z.string() -- description of the fix applied or suggested
   - `files_changed`: z.array(z.string()) -- files modified by the fix
   - `evidence_summary`: z.string() -- summary of evidence supporting the root cause
   - `issue_count`: z.number().int().positive() -- number of issues in the debug session (for multi-issue gating)
3. Define `ROOT_CAUSE_CHALLENGE_CATEGORIES` as const array and `rootCauseChallengeCategory` schema:
   - `"symptom_treatment"` -- fix addresses a symptom, not the underlying cause
   - `"verified_fix"` -- fix correctly addresses the root cause
   - `"side_effects"` -- fix resolves the original issue but introduces new problems
   - `"incomplete_fix"` -- fix partially addresses root cause but misses related issues
4. Define `rootCausePerspectiveSchema` -- one agent's assessment:
   - `agent`: z.string() -- which agent provided this perspective
   - `category_assessment`: rootCauseChallengeCategorySchema
   - `confidence`: z.number().min(0).max(1)
   - `evidence`: z.string() -- evidence supporting the assessment
   - `reproduction_result`: z.string() -- result of attempting to reproduce the original bug
   - `side_effects_found`: z.array(z.string()).default([]) -- any side effects detected
   - `recommended_action`: z.string()
5. Define `rootCauseTribunalResultSchema`:
   - `phase`: z.number().int().positive()
   - `proposed_fix_signal`: proposedFixSignalSchema
   - `perspectives`: z.array(rootCausePerspectiveSchema).length(3)
   - `consensus_category`: rootCauseChallengeCategorySchema
   - `consensus_confidence`: z.number().min(0).max(1)
   - `dissenting_perspective`: rootCausePerspectiveSchema.optional()
   - `resolution`: z.enum(["verified_fix", "needs_deeper_investigation"])
   - `recommended_action`: z.string()
   - `estimated_token_cost`: z.number().int().nonnegative()
   - `timestamp`: z.string()
6. Export all schemas, const arrays, and inferred types

**Verification:**

- [ ] All schemas use snake_case per API conventions
- [ ] Schemas have JSDoc documentation with purpose and snake_case notice
- [ ] Types exported via `z.infer`
- [ ] File follows kebab-case naming
- [ ] File stays in T2 agents domain (no imports from skills, rules, or T3)
- [ ] No class usage, all functional patterns

### Task 2: Create root cause tribunal helpers

**Goal:** Build pure functions for fix signal detection, complexity gating, prompt generation for the three tribunal agents, and consensus resolution.

**Files:** `src/agents/__helpers/root-cause-tribunal.ts` (new)

**Steps:**

1. Create `root-cause-tribunal.ts` in `src/agents/__helpers/`
2. Import from `../__schemas/root-cause-tribunal.schemas` (same-domain import, allowed)
3. Implement `detectProposedFix(phase, debugSessionId, rootCause, proposedFix, filesChanged, evidenceSummary, issueCount): ProposedFixSignal | null`:
   - Validates the input via `proposedFixSignalSchema.safeParse()`
   - Returns null if validation fails (incomplete or malformed debug output)
   - Returns the parsed ProposedFixSignal on success
4. Implement `shouldRunRootCauseTribunal(fixSignal: ProposedFixSignal | null, complexity: string): boolean`:
   - Returns false if fixSignal is null
   - Returns false if complexity is below COMPLEX (uses same pattern as `shouldRunVerificationTribunal`)
   - Returns false if `fixSignal.issue_count < 2` (single-issue debugging does not warrant a tribunal)
   - Returns true otherwise
   - Follow the `qualifyingComplexities` pattern from verification-tribunal.ts
5. Implement `buildDebuggerDefensePrompt(fixSignal: ProposedFixSignal): string`:
   - Ask lu-debugger to defend its proposed fix:
   - Include root cause, proposed fix, evidence summary, files changed
   - Ask: "Present your evidence that this fix addresses the root cause, not just a symptom"
   - Ask: "What would happen if we reverted this fix? Would the original issue return?"
   - Ask: "Have you considered related failure modes that share the same root cause?"
   - Request response format: CATEGORY / CONFIDENCE / EVIDENCE / REPRODUCTION_RESULT / SIDE_EFFECTS / ACTION
6. Implement `buildVerifierChallengePrompt(fixSignal: ProposedFixSignal): string`:
   - Ask lu-verifier to independently challenge the fix:
   - Include root cause, proposed fix, evidence summary, files changed
   - Ask: "Can you independently reproduce the original bug to confirm it was real?"
   - Ask: "Does the proposed fix actually resolve the reproduction, or does the bug manifest differently?"
   - Ask: "Is this treating the symptom or the cause? What evidence distinguishes the two?"
   - Ask: "What side effects might this fix introduce?"
   - Request same response format
7. Implement `buildArbiterPrompt(fixSignal: ProposedFixSignal): string`:
   - Ask lu-integration-checker to act as arbiter:
   - Include root cause, proposed fix, evidence summary, files changed
   - Ask: "Given the files changed, does this fix create orphaned references, broken imports, or downstream failures?"
   - Ask: "Is the fix scoped correctly, or does it touch too much / too little?"
   - Ask: "Would a different approach (broader fix, narrower fix, different root cause) be more robust?"
   - Request same response format
8. Implement `resolveRootCauseTribunal(phase, fixSignal, perspectives): RootCauseTribunalResult`:
   - Follow the exact same consensus resolution pattern as `resolveVerificationTribunal`:
     - Count votes per category
     - Find majority (2+ votes) or highest-confidence tiebreaker for 3-way split
     - Record dissenting perspective
     - Calculate consensus confidence (average of agreeing voters)
   - Map consensus category to resolution:
     - `"verified_fix"` -> resolution: `"verified_fix"`, action: "Fix is validated. Proceed with commit."
     - `"symptom_treatment"` -> resolution: `"needs_deeper_investigation"`, action: "Fix treats a symptom. Re-investigate with focus on the underlying mechanism."
     - `"side_effects"` -> resolution: `"needs_deeper_investigation"`, action: "Fix resolves the original issue but introduces side effects. Address side effects before proceeding."
     - `"incomplete_fix"` -> resolution: `"needs_deeper_investigation"`, action: "Fix partially addresses root cause. Expand scope to cover related failure modes."
   - Estimate token cost: ~8k per participant prompt (3 participants = ~24k)
   - Parse result through `rootCauseTribunalResultSchema`
9. Add comprehensive JSDoc on all exported functions with `@param`, `@returns`, `@example`

**Verification:**

- [ ] All functions are pure (no side effects, no I/O)
- [ ] detectProposedFix returns null for invalid inputs
- [ ] shouldRunRootCauseTribunal enforces COMPLEX+ gate AND issue_count >= 2
- [ ] Prompt builders include specific questions tailored to each agent's expertise
- [ ] Prompts request standardized response format
- [ ] Consensus resolution handles unanimity, 2-1 majority, and 3-way split
- [ ] Resolution maps to exactly two outcomes: verified_fix or needs_deeper_investigation
- [ ] No class usage, all functional patterns

### Task 3: Integrate tribunal into debug and phase-execute skills

**Goal:** Update the debug skill and phase-execute skill to optionally invoke the Root Cause Tribunal after lu-debugger returns a root cause with a fix.

**Files:** `src/skills/general/debug.skill.ts`, `src/skills/general/phase-execute.skill.ts`

**Steps:**

1. In `debug.skill.ts`, after Step 4 ("Handle Agent Return"), add Step 4.5: Root Cause Tribunal (conditional):
   - **Gate check:** Read complexity from STATE.md. Read `root_cause_tribunal_enabled` from `.planning/config.json` (default: false). Read issue count from the debug session file.
   - **Skip if:** tribunal is disabled, OR complexity is below COMPLEX, OR issue count < 2, OR lu-debugger did NOT return `## ROOT CAUSE FOUND` or `## DEBUG COMPLETE`.
   - **When gated in:** Parse the debugger's return to extract root_cause, proposed_fix, files_changed, evidence_summary. Build a ProposedFixSignal.
   - Step 4.5.1: Spawn three tribunal agents in PARALLEL:
     - lu-debugger with `buildDebuggerDefensePrompt` (defends its own fix)
     - lu-verifier with `buildVerifierChallengePrompt` (challenges the fix)
     - lu-integration-checker with `buildArbiterPrompt` (arbitrates)
   - Step 4.5.2: Parse responses, resolve consensus via `resolveRootCauseTribunal`
   - Step 4.5.3: Display tribunal result (table format matching Verification Tribunal display)
   - Step 4.5.4: Route based on resolution:
     - `"verified_fix"` -> Proceed to commit/fix flow as normal
     - `"needs_deeper_investigation"` -> Suggest re-running `/debug` with narrowed focus based on tribunal findings

2. In `phase-execute.skill.ts`, in Route C ("UAT issues found", around line 1651), after "Spawn parallel debug agents to diagnose root causes":
   - Add a note/instruction that when debug agents return ROOT CAUSE FOUND during UAT diagnosis, the orchestrator should check tribunal gating conditions and optionally spawn a Root Cause Tribunal before creating fix plans
   - This is a lighter-touch integration: a conditional step between diagnosis and fix planning
   - Gate: same conditions (tribunal enabled in config, COMPLEX+, multi-issue debugging)

**Verification:**

- [ ] Tribunal only triggers on ROOT CAUSE FOUND / DEBUG COMPLETE AND COMPLEX+ AND enabled in config AND issue_count >= 2
- [ ] When tribunal is disabled, behavior is identical to current (no regression)
- [ ] All three agents run in parallel (3 Task calls in same message)
- [ ] Resolution routes to correct follow-up action
- [ ] Display format matches existing tribunal display patterns (Verification Tribunal from 92-B)
- [ ] Token budget: +20-30k per complex failure set

### Task 4: Write tests for root cause tribunal

**Goal:** Comprehensive tests covering all root cause tribunal functions: fix signal detection, gating, prompt generation, consensus resolution.

**Files:** `__tests__/src/agents/root-cause-tribunal.test.ts` (new)

**Steps:**

1. Create test file following the exact pattern of `__tests__/src/agents/verification-tribunal.test.ts`:
   - Import from `bun:test` (describe, test, expect)
   - Import functions from `../../../src/agents/__helpers/root-cause-tribunal`
   - Import types from `../../../src/agents/__schemas/root-cause-tribunal.schemas`
   - Create `makeProposedFixSignal()` helper with sensible defaults
   - Create `makePerspective()` helper with sensible defaults (reuse name pattern from verification-tribunal.test.ts)

2. Fix signal detection tests (`detectProposedFix`):
   - Returns valid ProposedFixSignal for complete valid input
   - Returns null for missing required fields (no root_cause, no proposed_fix)
   - Preserves all input fields in the returned signal
   - Validates phase is positive integer

3. Gate tests (`shouldRunRootCauseTribunal`):
   - Returns true for COMPLEX with valid signal and issue_count >= 2
   - Returns true for CRITICAL with valid signal and issue_count >= 2
   - Returns false for MODERATE (below threshold)
   - Returns false for SIMPLE
   - Returns false when signal is null
   - Returns false when issue_count is 1 (single-issue, no tribunal needed)

4. Prompt builder tests:
   - `buildDebuggerDefensePrompt` includes root_cause and proposed_fix in output
   - `buildDebuggerDefensePrompt` asks about symptom vs cause distinction
   - `buildVerifierChallengePrompt` includes root_cause and proposed_fix
   - `buildVerifierChallengePrompt` asks about reproduction and side effects
   - `buildArbiterPrompt` includes files_changed context
   - `buildArbiterPrompt` asks about scoping and alternative approaches
   - All prompts request the standardized CATEGORY/CONFIDENCE/EVIDENCE/ACTION format

5. Resolution tests (`resolveRootCauseTribunal`):
   - Resolves unanimous "verified_fix" consensus (3-0) with resolution "verified_fix"
   - Resolves majority "symptom_treatment" (2-1) with resolution "needs_deeper_investigation"
   - Handles 3-way split (picks highest confidence)
   - Maps "verified_fix" category to resolution "verified_fix"
   - Maps "symptom_treatment" category to resolution "needs_deeper_investigation"
   - Maps "side_effects" category to resolution "needs_deeper_investigation"
   - Maps "incomplete_fix" category to resolution "needs_deeper_investigation"
   - Records dissenting perspective when present
   - Estimated token cost is approximately 24k (3 participants x 8k)
   - Result timestamp is a valid string

**Verification:**

- [ ] `bun test __tests__/src/agents/root-cause-tribunal.test.ts` passes
- [ ] Tests use `bun:test` imports (describe, test, expect)
- [ ] Tests cover edge cases: all same category, all different, null inputs
- [ ] Test file follows kebab-case naming

### Task 5: Update agents barrel exports

**Goal:** Export all new schemas, types, and helper functions from the agents module barrel.

**Files:** `src/agents/index.ts`

**Steps:**

1. Add root-cause-tribunal schema exports (after the existing verification-tribunal exports block):

   ```
   // Root cause tribunal schemas
   export {
     ROOT_CAUSE_CHALLENGE_CATEGORIES,
     rootCauseChallengeCategorySchema,
     proposedFixSignalSchema,
     rootCausePerspectiveSchema,
     rootCauseTribunalResultSchema,
   } from "./__schemas/root-cause-tribunal.schemas";
   ```

2. Add root-cause-tribunal type exports:

   ```
   export type {
     RootCauseChallengeCategory,
     ProposedFixSignal,
     RootCausePerspective,
     RootCauseTribunalResult,
   } from "./__schemas/root-cause-tribunal.schemas";
   ```

3. Add root-cause-tribunal helper exports:

   ```
   // Root cause tribunal helpers
   export {
     detectProposedFix,
     shouldRunRootCauseTribunal,
     buildDebuggerDefensePrompt,
     buildVerifierChallengePrompt,
     buildArbiterPrompt,
     resolveRootCauseTribunal,
   } from "./__helpers/root-cause-tribunal";
   ```

4. Verify barrel contains ONLY re-export statements (barrel invariant)

**Verification:**

- [ ] Barrel contains only `export { ... } from` and `export type { ... } from` statements
- [ ] All new public APIs accessible via `~/agents`
- [ ] No duplicate exports with existing tribunal infrastructure
- [ ] No logic, constants, or registries in the barrel
- [ ] Export grouping follows existing pattern (schemas block, then types block, then helpers block)

## Success Criteria

- [ ] `bun test __tests__/src/agents/root-cause-tribunal.test.ts` passes
- [ ] `bunx --bun tsc --noEmit` passes with no new type errors
- [ ] Tribunal is opt-in via `workflow.root_cause_tribunal_enabled` in config.json (default: false)
- [ ] Tribunal only activates for COMPLEX+ complexity with multi-issue debugging (issue_count >= 2)
- [ ] When tribunal is disabled, debug behavior is identical to current (no regression)
- [ ] Three agents participate: lu-debugger (defender), lu-verifier (challenger), lu-integration-checker (arbiter)
- [ ] All three agents spawn in parallel
- [ ] Consensus resolves to one of four categories: verified_fix, symptom_treatment, side_effects, incomplete_fix
- [ ] Categories map to exactly two resolutions: "verified_fix" or "needs_deeper_investigation"
- [ ] Each resolution maps to a specific actionable recommendation
- [ ] Token budget: +20-30k per complex failure set
- [ ] No cross-tier import violations (root-cause-tribunal stays in T2 agents domain)
- [ ] Tribunal result includes dissenting perspective when consensus is not unanimous
- [ ] All schemas use snake_case, all files use kebab-case, all code uses functional patterns
