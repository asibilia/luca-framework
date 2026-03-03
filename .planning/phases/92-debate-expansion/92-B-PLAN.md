---
id: 92-B
title: "Verification Tribunal for T1/T3 conflicts"
phase: 92
wave: 2
complexity: MODERATE
todo: 37
---

# 92-B: Verification Tribunal for T1/T3 Conflicts

## Objective

When lu-verifier detects a conflict between T1 (harness/test results) and T3 (goal-backward analysis) signals -- specifically T1 PASS with T3 PARTIAL or FAIL -- trigger a structured debate between lu-test-writer, lu-verifier, and lu-integration-checker to diagnose the root cause. The debate produces a conflicting signals report classifying the discrepancy as one of three categories: tests incomplete, goal over-specified, or wiring issue. This replaces the current behavior of simply marking the verification as "human_needed" when T1 and T3 conflict, giving the user actionable diagnosis instead of a generic flag.

The lu-verifier's signal priority matrix (Step 9) currently maps `T1 STRONG PASS + T3 FAIL` to `human_needed` and `T1 PARTIAL + T3 PARTIAL` to `human_needed`. These cases surface a conflict but provide no diagnosis. The Verification Tribunal adds a debate round between three agents with complementary perspectives: lu-test-writer (understands what tests cover), lu-verifier (understands goal-backward analysis), and lu-integration-checker (understands cross-component wiring).

Token cost: +10-15k per conflict, gated to COMPLEX+ only.

## Context

@src/agents/general/lu-verifier.agent.ts -- Step 6.5 (T1 harness signal), Step 9 (signal priority matrix), Step 9.5 (T3 goal-backward check); defines the T1/T3 conflict detection points
@src/agents/general/lu-test-writer.agent.ts -- Generates test files from plan verification criteria; understands test coverage scope
@src/agents/general/lu-integration-checker.agent.ts -- Verifies cross-phase wiring; understands connection patterns
@src/agents/**schemas/tribunal.schemas.ts -- reviewFindingSchema, rebuttalSchema, unifiedRecommendationSchema (reusable patterns for structuring debate findings)
@src/agents/**helpers/tribunal-rebuttals.ts -- buildRebuttalPrompts, resolveRebuttals (pattern reference for prompt generation)
@src/agents/**helpers/tribunal-detector.ts -- shouldRunTribunal (complexity gating pattern)
@src/agents/index.ts -- Barrel exports for all agent infrastructure
@src/skills/general/phase-execute.skill.ts -- Step 7: spawns lu-verifier, collects VERIFICATION.md result
@src/complexity/**schemas/complexity.schemas.ts -- ComplexityLevel, complexity gating

The verification flow in phase-execute:

1. **Step 6.5:** Harness runs (test + typecheck + lint + build) -- produces T1 signal
2. **Step 7:** lu-verifier runs goal-backward analysis -- produces T3 signal
3. **Step 9 (inside verifier):** Combines T1 and T3 via signal priority matrix
4. **Conflict case:** T1 PASS + T3 PARTIAL/FAIL currently maps to `human_needed` with no further analysis

What the Verification Tribunal adds:

- **Debate participants:** Three agents with complementary diagnostic perspectives
- **Structured output:** Classification into one of three conflict categories
- **Actionable result:** Each category has a recommended remediation path
- **Reuses tribunal patterns:** Prompt structure and resolution patterns from 91-C infrastructure

## Tasks

### Task 1: Define verification conflict schemas

**Goal:** Create Zod schemas for T1/T3 conflict classification, debate participants, and resolution.

**Files:** `src/agents/__schemas/verification-tribunal.schemas.ts` (new)

**Steps:**

1. Create `verification-tribunal.schemas.ts` in `src/agents/__schemas/`
2. Define `conflictSignalSchema` -- the input that triggers the tribunal:
   - `phase`: number
   - `t1_status`: enum "strong_pass" | "partial" | "fail" | "absent"
   - `t1_evidence`: string (summary of what harness checks passed/failed)
   - `t3_status`: enum "pass" | "partial" | "fail" | "skip"
   - `t3_evidence`: string (summary of goal-backward findings)
   - `conflict_type`: enum "t1_pass_t3_partial" | "t1_pass_t3_fail" | "t1_partial_t3_partial"
3. Define `conflictCategorySchema` -- the diagnosis output:
   - `"tests_incomplete"` -- T1 passes because tests don't cover the failing T3 objectives; tests are too narrow
   - `"goal_over_specified"` -- T3 objectives go beyond what the plan actually required; goals are too broad
   - `"wiring_issue"` -- Components pass individually (T1) but don't connect properly (T3 fails on integration)
4. Define `diagnosticPerspectiveSchema` -- one participant's analysis:
   - `agent`: string (which agent provided this perspective)
   - `category_assessment`: conflictCategorySchema (what they think the root cause is)
   - `confidence`: number (0.0-1.0)
   - `evidence`: string (supporting evidence for their assessment)
   - `recommended_action`: string (what to do about it)
5. Define `verificationTribunalResultSchema`:
   - `phase`: number
   - `conflict_signal`: conflictSignalSchema
   - `perspectives`: array of diagnosticPerspectiveSchema (exactly 3)
   - `consensus_category`: conflictCategorySchema (majority agreement)
   - `consensus_confidence`: number (average confidence of agreeing perspectives)
   - `dissenting_perspective`: diagnosticPerspectiveSchema (optional, if no unanimous agreement)
   - `recommended_remediation`: string (actionable next step)
   - `estimated_token_cost`: number
   - `timestamp`: string

**Verification:**

- [ ] All schemas use snake_case per API conventions
- [ ] Schemas have JSDoc documentation
- [ ] Types exported via `z.infer`
- [ ] File follows kebab-case naming
- [ ] Schemas stay in T2 agents domain (correct tier)

### Task 2: Create verification tribunal helpers

**Goal:** Build pure functions for conflict detection, prompt generation, and consensus resolution.

**Files:** `src/agents/__helpers/verification-tribunal.ts` (new)

**Steps:**

1. Create `verification-tribunal.ts` in `src/agents/__helpers/`
2. Implement `detectT1T3Conflict(t1Status: string, t3Status: string): ConflictSignal | null`:
   - Returns a ConflictSignal when the T1/T3 combination maps to `human_needed` in the signal priority matrix
   - Returns null for non-conflicting combinations (both pass, both fail, etc.)
   - Specific conflict types:
     - `"t1_pass_t3_partial"`: T1 is strong_pass or partial, T3 is partial
     - `"t1_pass_t3_fail"`: T1 is strong_pass, T3 is fail (most serious)
     - `"t1_partial_t3_partial"`: Both partial (ambiguous)
3. Implement `shouldRunVerificationTribunal(conflict: ConflictSignal, complexity: string): boolean`:
   - Returns true only when complexity is COMPLEX or CRITICAL
   - Follows the same pattern as `shouldRunTribunal()` from tribunal-detector.ts
4. Implement `buildTestWriterDiagnosticPrompt(conflict: ConflictSignal): string`:
   - Ask lu-test-writer to analyze whether tests adequately cover the T3 objectives:

     ```
     A verification conflict has been detected: automated tests passed (T1) but
     goal-backward analysis found gaps (T3).

     **T1 Evidence:** {t1_evidence}
     **T3 Evidence:** {t3_evidence}

     As the test specification writer, assess:
     1. Do the existing tests cover the objectives that T3 flagged as incomplete?
     2. Are there specification gaps where the plan's verification criteria
        don't translate to test assertions?
     3. Is this a test coverage issue or a goal specification issue?

     Classify this conflict as one of:
     - tests_incomplete: Tests don't cover the failing T3 objectives
     - goal_over_specified: T3 objectives go beyond plan requirements
     - wiring_issue: Components pass individually but don't connect

     Return:
     CATEGORY: tests_incomplete | goal_over_specified | wiring_issue
     CONFIDENCE: 0.0-1.0
     EVIDENCE: [supporting evidence]
     ACTION: [recommended remediation]
     ```

5. Implement `buildVerifierDiagnosticPrompt(conflict: ConflictSignal): string`:
   - Ask lu-verifier to analyze whether T3 objectives are appropriate:

     ```
     A verification conflict has been detected between your goal-backward
     analysis (T3) and the automated test results (T1).

     **T1 Evidence:** {t1_evidence} (tests passed)
     **T3 Evidence:** {t3_evidence} (your analysis found gaps)

     As the goal-backward verifier, assess:
     1. Are your T3 objectives correctly derived from the plan?
     2. Could the plan have been satisfied without the T3 gaps you identified?
     3. Is this a case where tests are insufficient, or where your
        objectives exceeded plan scope?

     Classify and return in the same format as above.
     ```

6. Implement `buildIntegrationDiagnosticPrompt(conflict: ConflictSignal): string`:
   - Ask lu-integration-checker to analyze whether this is a wiring issue:

     ```
     A verification conflict has been detected: unit-level checks passed (T1)
     but goal-level analysis found gaps (T3).

     **T1 Evidence:** {t1_evidence}
     **T3 Evidence:** {t3_evidence}

     As the integration checker, assess:
     1. Could the T1-passing components fail to deliver the T3 goals
        because of missing connections between them?
     2. Are there barrel export gaps, missing imports, or broken wiring
        that unit tests wouldn't catch?
     3. Is this a classic "parts pass, system fails" integration issue?

     Classify and return in the same format as above.
     ```

7. Implement `resolveVerificationTribunal(perspectives: DiagnosticPerspective[]): VerificationTribunalResult`:
   - Determine consensus by majority vote on category_assessment
   - If 3-way split (each agent picks a different category), set consensus_category to the one with highest confidence
   - If 2-1 agreement, set consensus with the majority and record dissent
   - If unanimous, set consensus with average confidence
   - Map consensus category to recommended remediation:
     - `tests_incomplete` -> "Generate additional tests covering T3 gap objectives using lu-test-writer"
     - `goal_over_specified` -> "Review plan objectives and narrow T3 verification scope"
     - `wiring_issue` -> "Run lu-integration-checker on affected components to identify connection breaks"
   - Estimate token cost: ~5k per participant prompt (3 participants = ~15k)

**Verification:**

- [ ] All functions are pure
- [ ] detectT1T3Conflict returns null for non-conflicting cases
- [ ] shouldRunVerificationTribunal enforces complexity gate
- [ ] Diagnostic prompts are clear and specific to each agent's expertise
- [ ] Consensus resolution handles 3-way splits, 2-1 agreements, and unanimity
- [ ] JSDoc on all exported functions with @param, @returns, @example

### Task 3: Integrate tribunal into phase-execute verification flow

**Goal:** Update the phase-execute skill to optionally run the Verification Tribunal when lu-verifier reports a T1/T3 conflict.

**Files:** `src/skills/general/phase-execute.skill.ts`

**Steps:**

1. After Step 7 (lu-verifier returns VERIFICATION.md), add Step 7.5: Verification Tribunal (conditional):

   ````
   ### Step 7.5: Verification Tribunal (Conditional)

   **Gate check:**

   ```bash
   TRIBUNAL_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"verification_tribunal_enabled"[[:space:]]*:[[:space:]]*[a-z]*' | grep -o '[a-z]*$' || echo "false")
   ````

   **Skip if:** `TRIBUNAL_ENABLED` is "false" OR complexity is below COMPLEX, OR lu-verifier status is NOT `human_needed` due to T1/T3 conflict.

   **When lu-verifier returns `human_needed` with T1/T3 conflict:**

   Parse the VERIFICATION.md to extract T1 and T3 signal evidence.

   ```

   ```

2. Step 7.5.1: Spawn three diagnostic agents in PARALLEL:

   ```python
   # All three run simultaneously -- each brings a different diagnostic lens
   Task(
     prompt="""{test_writer_diagnostic_prompt}""",
     subagent_type="lu-test-writer",
     description="Diagnose T1/T3: test coverage perspective"
   )

   Task(
     prompt="""{verifier_diagnostic_prompt}""",
     subagent_type="lu-verifier",
     description="Diagnose T1/T3: goal specification perspective"
   )

   Task(
     prompt="""{integration_diagnostic_prompt}""",
     subagent_type="lu-integration-checker",
     description="Diagnose T1/T3: wiring perspective"
   )
   ```

3. Step 7.5.2: Resolve consensus -- parse responses, build tribunal result
4. Step 7.5.3: Display tribunal result:

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Luca >>> VERIFICATION TRIBUNAL
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   T1/T3 Conflict: {conflict_type}

   | Participant           | Category          | Confidence |
   |-----------------------|-------------------|------------|
   | lu-test-writer        | {category}        | {conf}     |
   | lu-verifier           | {category}        | {conf}     |
   | lu-integration-checker| {category}        | {conf}     |

   Consensus: {consensus_category} ({consensus_confidence})
   Recommended Action: {remediation}
   Token Cost: {cost}
   ```

5. Step 7.5.4: Route based on consensus:
   - `tests_incomplete` -> Suggest running lu-test-writer to generate additional tests, then re-run harness
   - `goal_over_specified` -> Suggest reviewing plan objectives, offer to narrow verification scope
   - `wiring_issue` -> Suggest running lu-integration-checker in detail, flag affected components

6. Append tribunal result to VERIFICATION.md under a new "Verification Tribunal" section

**Verification:**

- [ ] Tribunal only triggers on T1/T3 conflict AND COMPLEX+ AND enabled in config
- [ ] When tribunal is disabled, behavior is identical to current (human_needed status)
- [ ] All three diagnostic agents run in parallel
- [ ] Consensus category maps to actionable remediation
- [ ] Tribunal result is appended to VERIFICATION.md
- [ ] Token budget: +10-15k per conflict

### Task 4: Write tests for verification tribunal

**Goal:** Comprehensive tests for conflict detection, prompt generation, consensus resolution, and integration.

**Files:** `__tests__/src/agents/verification-tribunal.test.ts` (new)

**Steps:**

1. Conflict detection tests:
   - detectT1T3Conflict returns conflict for strong_pass + fail
   - detectT1T3Conflict returns conflict for strong_pass + partial
   - detectT1T3Conflict returns conflict for partial + partial
   - detectT1T3Conflict returns null for pass + pass (no conflict)
   - detectT1T3Conflict returns null for fail + any (T1 fail is gaps_found, not human_needed)
   - detectT1T3Conflict returns null for absent + pass (no conflict)
2. Gate tests:
   - shouldRunVerificationTribunal returns false for MODERATE complexity
   - shouldRunVerificationTribunal returns false for SIMPLE complexity
   - shouldRunVerificationTribunal returns true for COMPLEX complexity
   - shouldRunVerificationTribunal returns true for CRITICAL complexity
3. Prompt tests:
   - buildTestWriterDiagnosticPrompt includes T1 and T3 evidence
   - buildVerifierDiagnosticPrompt asks verifier to evaluate own objectives
   - buildIntegrationDiagnosticPrompt focuses on wiring patterns
   - All prompts request the standard CATEGORY/CONFIDENCE/EVIDENCE/ACTION format
4. Resolution tests:
   - resolveVerificationTribunal produces unanimous consensus (3-0 agreement)
   - resolveVerificationTribunal produces majority consensus (2-1 agreement)
   - resolveVerificationTribunal handles 3-way split (picks highest confidence)
   - resolveVerificationTribunal maps categories to correct remediation strings
   - resolveVerificationTribunal records dissenting perspective when present
   - Token cost estimate is approximately 15k (3 participants x 5k)

**Verification:**

- [ ] `bun test __tests__/src/agents/verification-tribunal.test.ts` passes
- [ ] Tests use `bun:test` imports
- [ ] Tests cover edge cases (all same category, all different, missing fields)

### Task 5: Update agents barrel and documentation

**Goal:** Export new schemas and helpers from the agents module barrel.

**Files:** `src/agents/index.ts`

**Steps:**

1. Add verification-tribunal schema exports to agents barrel:
   - `conflictSignalSchema`, `conflictCategorySchema`, `diagnosticPerspectiveSchema`, `verificationTribunalResultSchema`
   - Export types: `ConflictSignal`, `ConflictCategory`, `DiagnosticPerspective`, `VerificationTribunalResult`
2. Add verification-tribunal helper exports to agents barrel:
   - `detectT1T3Conflict`, `shouldRunVerificationTribunal`
   - `buildTestWriterDiagnosticPrompt`, `buildVerifierDiagnosticPrompt`, `buildIntegrationDiagnosticPrompt`
   - `resolveVerificationTribunal`
3. Ensure all new functions have JSDoc with @param, @returns, @example
4. Add module-level JSDoc to both new files explaining the verification tribunal pattern

**Verification:**

- [ ] Barrel contains only re-exports (barrel invariant)
- [ ] All new public APIs accessible via `~/agents`
- [ ] JSDoc is complete on all exported functions and types
- [ ] No duplicate exports with existing tribunal infrastructure

## Success Criteria

- [ ] `bun test __tests__/src/agents/verification-tribunal.test.ts` passes
- [ ] `bunx --bun tsc --noEmit` passes with no new type errors
- [ ] Tribunal is opt-in via `workflow.verification_tribunal_enabled` in config.json (default: false)
- [ ] Tribunal only activates for COMPLEX+ complexity with T1/T3 conflicts
- [ ] When tribunal is disabled, verification behavior is identical to current (no regression)
- [ ] Three diagnostic agents run in parallel (lu-test-writer, lu-verifier, lu-integration-checker)
- [ ] Consensus resolves to one of three actionable categories (tests_incomplete, goal_over_specified, wiring_issue)
- [ ] Each category maps to a specific remediation recommendation
- [ ] Token budget: +10-15k per conflict occurrence
- [ ] No cross-tier import violations (verification-tribunal stays in T2 agents domain)
- [ ] Tribunal result appended to VERIFICATION.md for audit trail
- [ ] Dissenting perspective is preserved and surfaced when consensus is not unanimous
