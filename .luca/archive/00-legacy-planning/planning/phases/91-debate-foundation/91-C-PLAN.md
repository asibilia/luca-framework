---
id: 91-C
title: "Design Tribunal - phase-execute code review debate PoC"
phase: 91
wave: 2
complexity: COMPLEX
todo: 36
---

# 91-C: Design Tribunal -- Phase-Execute Code Review Debate PoC

## Objective

Transform the existing parallel-but-isolated code review step (phase-execute Step 8) into a multi-round debate: after independent review, detect disagreements across reviewers, run a rebuttal round where conflicting agents challenge each other, and produce unified recommendations with confidence ratings. This is the full debate pattern proof-of-concept, gated behind COMPLEX+ complexity.

All 4 research agents independently identified phase-execute code review as the #1 highest-impact debate opportunity because 5 reviewers already run in parallel but never interact or challenge each other, leading to potentially contradictory or redundant findings.

## Context

@src/skills/general/phase-execute.skill.ts -- Step 8: Code Quality Review (lines ~1065-1347), spawns 5 reviewers in parallel, merges findings, routes by severity
@src/agents/general/dx-advocate.agent.ts -- DX reviewer (conventions, coding standards)
@src/agents/general/code-simplifier.agent.ts -- Simplification reviewer (DRY, complexity)
@src/agents/general/code-architect.agent.ts -- Architecture reviewer (tiers, boundaries)
@src/agents/general/security-auditor.agent.ts -- Security reviewer (injection, validation)
@src/agents/general/ui.agent.ts -- Tailwind/styling reviewer (used as tailwind-auditor)
@src/agents/**schemas/agent.schemas.ts -- AgentConfig schema
@src/agents/**helpers/create-agent.ts -- createAgent factory
@src/complexity/\_\_schemas/complexity.schemas.ts -- ComplexityLevel, complexity gating

The current code review flow in phase-execute:

1. **Phase 1 (existing):** 5 reviewers analyze the same diff independently in parallel
2. **Merge (existing):** Combine all issues, deduplicate by file:line
3. **Route (existing):** Present CRITICAL/HIGH/MEDIUM/LOW findings to user

What is missing:

- **No cross-pollination:** Reviewers never see each other's findings
- **No conflict detection:** If dx-advocate says "add documentation" and code-simplifier says "remove unnecessary comments" for the same code, both survive unquestioned
- **No confidence calibration:** All findings have equal weight regardless of agreement between reviewers
- **No rebuttal mechanism:** Reviewers cannot challenge or validate each other's conclusions

## Tasks

### Task 1: Define tribunal schemas

**Goal:** Create Zod schemas for disagreement detection, rebuttal rounds, and unified recommendations.

**Files:** `src/agents/__schemas/tribunal.schemas.ts` (new)

**Steps:**

1. Create `tribunal.schemas.ts` in `src/agents/__schemas/`
2. Define `reviewFindingSchema` (normalized from reviewer YAML output):
   - `id`: string (hash of file:line:agent)
   - `severity`: enum "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
   - `file`: string
   - `line`: number (optional)
   - `issue`: string
   - `suggestion`: string
   - `source_agent`: string
3. Define `disagreementSchema`:
   - `id`: string
   - `file`: string
   - `line`: number (optional)
   - `conflicting_findings`: array of reviewFindingSchema (2+ findings that conflict)
   - `conflict_type`: enum:
     - `"contradictory"` -- agents recommend opposite actions (add vs remove)
     - `"severity_mismatch"` -- agents flag same issue at different severity levels
     - `"scope_overlap"` -- agents flag overlapping but non-identical issues in same area
   - `detected_by`: literal "orchestrator"
4. Define `rebuttalSchema`:
   - `finding_id`: string (the finding being challenged)
   - `challenger_agent`: string
   - `challenge`: string (why the finding may be wrong)
   - `defender_response`: string (original agent's defense)
   - `resolution`: enum "upheld" | "withdrawn" | "modified"
   - `modified_finding`: reviewFindingSchema (optional, if resolution is "modified")
5. Define `unifiedRecommendationSchema`:
   - `finding`: reviewFindingSchema
   - `confidence`: number (0.0-1.0)
   - `agreement_count`: number (how many reviewers agree)
   - `dissent_count`: number (how many reviewers disagree)
   - `debate_history`: array of rebuttalSchema (empty if no debate occurred)
6. Define `tribunalResultSchema`:
   - `phase`: number
   - `total_findings`: number
   - `disagreements_detected`: number
   - `rebuttals_conducted`: number
   - `findings_withdrawn`: number
   - `findings_modified`: number
   - `unified_recommendations`: array of unifiedRecommendationSchema
   - `debate_token_cost`: number (estimated)
   - `timestamp`: string

**Verification:**

- [ ] All schemas use snake_case per API conventions
- [ ] Schemas have JSDoc documentation
- [ ] Types exported via `z.infer`
- [ ] File is in T2 entity domain (agents) -- acceptable since tribunal orchestration is agent-adjacent

### Task 2: Create disagreement detection logic

**Goal:** Build a pure function that analyzes independent reviewer outputs and identifies conflicts.

**Files:** `src/agents/__helpers/tribunal-detector.ts` (new)

**Steps:**

1. Create `tribunal-detector.ts` in `src/agents/__helpers/`
2. Implement `normalizeFindings(reviewerOutputs: Array<{agent: string, rawOutput: string}>): ReviewFinding[]`:
   - Parse YAML `issues:` blocks from each reviewer's output
   - Normalize to ReviewFinding schema
   - Generate deterministic IDs from file:line:agent hash
3. Implement `detectDisagreements(findings: ReviewFinding[]): Disagreement[]`:
   - Group findings by file (and optionally line range +/- 5 lines)
   - For each group with 2+ findings from different agents:
     - Check for **contradictory** conflicts: one suggests adding code while another suggests removing code in the same area (keyword matching: "add" vs "remove", "more" vs "less", "complex" vs "simple")
     - Check for **severity mismatch**: same file:line flagged at 2+ severity levels with 2+ level gap (e.g., CRITICAL vs LOW)
     - Check for **scope overlap**: overlapping file ranges with non-identical issues from different agents
   - Return array of Disagreement objects (may be empty if no conflicts found)
4. Implement `shouldRunTribunal(disagreements: Disagreement[], complexity: string): boolean`:
   - Returns true only when:
     - Complexity is COMPLEX or CRITICAL
     - At least 1 disagreement is detected
     - At least 1 disagreement involves CRITICAL or HIGH severity

**Verification:**

- [ ] normalizeFindings handles YAML parsing errors gracefully (returns empty array for malformed)
- [ ] detectDisagreements correctly identifies all three conflict types
- [ ] shouldRunTribunal enforces complexity gate
- [ ] All functions are pure

### Task 3: Create rebuttal orchestration logic

**Goal:** Build the rebuttal round orchestration that generates cross-agent challenge prompts.

**Files:** `src/agents/__helpers/tribunal-rebuttals.ts` (new)

**Steps:**

1. Create `tribunal-rebuttals.ts` in `src/agents/__helpers/`
2. Implement `buildRebuttalPrompts(disagreements: Disagreement[]): Array<{challenger: string, defender: string, prompt: string}>`:
   - For each disagreement, create a prompt pair:
     - **Challenger prompt:** "Agent {A} flagged {issue} at {file}:{line} as {severity}. You flagged a conflicting finding: {your_finding}. Do you maintain your position? If so, explain why {A}'s finding is incorrect or lower priority. If you agree with {A}, withdraw your finding."
     - **Defender prompt:** "Agent {B} challenges your finding at {file}:{line}: '{challenge_text}'. Defend your finding or withdraw/modify it."
   - For severity mismatches: ask both agents to justify their severity rating
   - For contradictory findings: ask each agent to explain why the other's approach is wrong
   - For scope overlaps: ask agents to clarify if their findings are about the same issue or different aspects
3. Implement `resolveRebuttals(rebuttals: Rebuttal[]): UnifiedRecommendation[]`:
   - For each original finding:
     - If no rebuttal occurred (no disagreement): confidence = 0.8, agreement_count = 1
     - If rebuttal resulted in "upheld": confidence = 0.9, increment agreement_count
     - If rebuttal resulted in "withdrawn": remove finding from unified list
     - If rebuttal resulted in "modified": use modified_finding, confidence = 0.7
   - For findings with no disagreement (majority of findings): pass through unchanged with confidence = 0.8
4. Implement `buildTribunalResult(phase: number, allFindings: ReviewFinding[], disagreements: Disagreement[], rebuttals: Rebuttal[], unifiedRecs: UnifiedRecommendation[]): TribunalResult`

**Verification:**

- [ ] Rebuttal prompts are clear and actionable
- [ ] Resolution logic handles all three outcomes (upheld, withdrawn, modified)
- [ ] Findings without disagreements pass through unchanged
- [ ] Token cost estimation is included in result

### Task 4: Integrate tribunal into phase-execute code review

**Goal:** Update the phase-execute skill's Step 8 to optionally run the Design Tribunal after independent review.

**Files:** `src/skills/general/phase-execute.skill.ts`

**Steps:**

1. After Step 8 (all reviewers return), add a new Step 8.5: Design Tribunal (conditional):
   - Gate: complexity is COMPLEX+ AND `workflow.tribunal_enabled` is true (default: false) AND disagreements detected
2. Step 8.5.1: Normalize and detect:
   - Collect all reviewer outputs from Step 8
   - Call `normalizeFindings()` to parse and normalize
   - Call `detectDisagreements()` to identify conflicts
   - Call `shouldRunTribunal()` to decide whether to proceed
3. Step 8.5.2: Display tribunal start:

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Luca ► DESIGN TRIBUNAL
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   {N} disagreements detected across {M} reviewers.
   Running rebuttal round...
   ```

4. Step 8.5.3: Rebuttal round:
   - For each disagreement, spawn rebuttal agents in PARALLEL:
     - Challenger agent: Task with the challenger prompt (use the same reviewer agent type)
     - Defender agent: Task with the defender prompt (use the same reviewer agent type)
   - Parse responses to determine resolution (upheld/withdrawn/modified)
5. Step 8.5.4: Unify recommendations:
   - Call `resolveRebuttals()` to produce final unified recommendations
   - Call `buildTribunalResult()` to produce the full tribunal result
   - Replace the original merged findings with unified recommendations
6. Step 8.5.5: Display tribunal result:

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Luca ► TRIBUNAL COMPLETE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   | Metric                | Value |
   |-----------------------|-------|
   | Disagreements found   | {N}   |
   | Rebuttals conducted   | {N}   |
   | Findings withdrawn    | {N}   |
   | Findings modified     | {N}   |
   | Estimated token cost  | {N}   |
   ```

7. Step 8.1 routing is unchanged -- still routes by severity, but now uses tribunal-refined findings when tribunal ran

**Verification:**

- [ ] Tribunal only runs when all gates pass (COMPLEX+, enabled, disagreements found)
- [ ] When tribunal is not enabled, behavior is identical to current
- [ ] Rebuttal agents are spawned in parallel (not sequential)
- [ ] Token budget is tracked and displayed
- [ ] Original Step 8.1 routing logic is unchanged

### Task 5: Connect to metrics infrastructure

**Goal:** When 91-A's metrics infrastructure is available, record tribunal outcomes.

**Files:** `src/skills/general/phase-execute.skill.ts`

**Steps:**

1. After tribunal completes (or after standard review if tribunal not run):
   - Build review metrics using `buildReviewMetrics()` from 91-A
   - Set `debate_enabled` to true when tribunal ran
   - Set `disagreements_detected` to count from tribunal
   - Append metrics to `.planning/metrics.json`
2. This step is best-effort: if metrics infrastructure is not available, skip gracefully

**Verification:**

- [ ] Metrics are recorded when 91-A infrastructure is available
- [ ] Graceful fallback when metrics infrastructure is not yet built

### Task 6: Write tests for tribunal infrastructure

**Goal:** Comprehensive tests for detection, rebuttals, and resolution.

**Files:** `__tests__/src/agents/tribunal-detector.test.ts` (new), `__tests__/src/agents/tribunal-rebuttals.test.ts` (new)

**Steps:**

1. Detection tests:
   - normalizeFindings parses valid YAML reviewer output
   - normalizeFindings handles malformed output gracefully
   - detectDisagreements identifies contradictory findings (add vs remove)
   - detectDisagreements identifies severity mismatches (CRITICAL vs LOW)
   - detectDisagreements identifies scope overlaps
   - detectDisagreements returns empty array when no conflicts
   - shouldRunTribunal respects complexity gate (returns false for MODERATE)
   - shouldRunTribunal requires CRITICAL/HIGH disagreements
2. Rebuttal tests:
   - buildRebuttalPrompts generates correct challenger/defender pairs
   - buildRebuttalPrompts handles all three conflict types
   - resolveRebuttals correctly handles upheld findings (increased confidence)
   - resolveRebuttals correctly removes withdrawn findings
   - resolveRebuttals correctly substitutes modified findings
   - resolveRebuttals passes through non-debated findings unchanged
3. Integration tests:
   - Full pipeline: normalize -> detect -> build prompts -> resolve -> unified result
   - Empty disagreements produce no tribunal activity
   - TribunalResult aggregates counts correctly

**Verification:**

- [ ] `bun test __tests__/src/agents/tribunal-detector.test.ts` passes
- [ ] `bun test __tests__/src/agents/tribunal-rebuttals.test.ts` passes
- [ ] Tests cover edge cases (empty inputs, single reviewer, all reviewers agree)

### Task 7: Update barrel exports and documentation

**Goal:** Export new schemas and functions from the agents module.

**Files:** `src/agents/index.ts`

**Steps:**

1. Add tribunal schema exports to agents barrel
2. Add tribunal helper exports to agents barrel
3. Add JSDoc to all new functions with @example blocks
4. Add module-level JSDoc to both new files

**Verification:**

- [ ] Barrel contains only re-exports
- [ ] All new public APIs are accessible via `~/agents`
- [ ] JSDoc is complete

## Success Criteria

- [ ] `bun test __tests__/src/agents/tribunal-detector.test.ts` passes
- [ ] `bun test __tests__/src/agents/tribunal-rebuttals.test.ts` passes
- [ ] `bunx --bun tsc --noEmit` passes with no new type errors
- [ ] Tribunal is opt-in via `workflow.tribunal_enabled` in config.json (default: false)
- [ ] Tribunal only activates for COMPLEX+ complexity with detected disagreements
- [ ] Non-debated findings pass through unchanged (no regression)
- [ ] Token budget: +20-30k per phase for tribunal when active
- [ ] phase-execute skill Step 8 behavior is identical when tribunal is disabled
- [ ] No cross-tier import violations (tribunal stays in T2 agents domain)
- [ ] Rebuttal agents run in parallel (no sequential bottleneck)
