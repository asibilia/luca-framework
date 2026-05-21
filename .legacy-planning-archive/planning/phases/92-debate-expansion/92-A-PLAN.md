---
id: 92-A
title: "Milestone audit adversarial debate round"
phase: 92
wave: 1
complexity: COMPLEX
todo: 35
---

# 92-A: Milestone Audit Adversarial Debate Round

## Objective

Add an optional adversarial debate round to the milestone-audit skill. After the existing 6 parallel subagents complete their independent reviews, normalize their findings through the tribunal infrastructure, detect disagreements, and run a rebuttal round where conflicting reviewers challenge each other. Produce a unified consensus report with confidence ratings. This transforms milestone audits from isolated reviews into cross-validated assessments, gated behind COMPLEX+ complexity and an opt-in config flag.

The milestone-audit skill already spawns 6 reviewers in parallel (lu-integration-checker, dx-advocate, code-simplifier, code-architect, tailwind-auditor, security-auditor) but they never interact -- their findings are simply merged. High-severity contradictions (e.g., code-architect says "extract module" while code-simplifier says "inline for simplicity") pass through unquestioned.

## Context

@src/skills/general/milestone-audit.skill.ts -- Steps 3-4: spawns 6 reviewers in parallel, merges findings by severity, creates MILESTONE-AUDIT.md
@src/agents/**schemas/tribunal.schemas.ts -- reviewFindingSchema, disagreementSchema, rebuttalSchema, unifiedRecommendationSchema, tribunalResultSchema
@src/agents/**helpers/tribunal-detector.ts -- normalizeFindings, detectDisagreements, shouldRunTribunal
@src/agents/**helpers/tribunal-rebuttals.ts -- buildRebuttalPrompts, resolveRebuttals, buildTribunalResult
@src/agents/index.ts -- Barrel exports for all tribunal infrastructure
@src/complexity/**schemas/complexity.schemas.ts -- ComplexityLevel, complexity gating
@src/skills/**schemas/skill.schemas.ts -- SkillConfig, SkillFrontmatter
@src/skills/**helpers/create-skill.ts -- createSkill factory

The tribunal infrastructure from Phase 91-C provides:

1. **Finding normalization:** `normalizeFindings()` parses reviewer YAML/JSON/array output into structured `ReviewFinding[]`
2. **Disagreement detection:** `detectDisagreements()` groups by file:line, classifies conflicts (contradictory, severity_mismatch, scope_overlap)
3. **Tribunal gating:** `shouldRunTribunal()` gates on COMPLEX+ complexity and CRITICAL/HIGH disagreements
4. **Rebuttal prompts:** `buildRebuttalPrompts()` generates challenger/defender prompt pairs
5. **Resolution:** `resolveRebuttals()` produces unified recommendations with confidence scores
6. **Aggregation:** `buildTribunalResult()` produces structured result with counts and token cost

## Tasks

### Task 1: Define milestone debate schemas

**Goal:** Create Zod schemas specific to milestone audit debate context -- extending tribunal schemas with milestone-specific metadata.

**Files:** `src/skills/__schemas/milestone-debate.schemas.ts` (new)

**Steps:**

1. Create `milestone-debate.schemas.ts` in `src/skills/__schemas/`
2. Define `milestoneDebateConfigSchema` with fields:
   - `enabled`: boolean (default false) -- opt-in flag
   - `min_complexity`: string (default "COMPLEX") -- minimum complexity to activate
   - `max_rebuttal_rounds`: number (default 1) -- cap on debate iterations
   - `token_budget`: number (default 40000) -- max token cost for debate round
3. Define `milestoneDebateResultSchema` extending tribunalResultSchema concept:
   - `milestone_version`: string (e.g., "v2.5.1")
   - `reviewer_count`: number (how many reviewers participated)
   - `cross_phase_disagreements`: number (disagreements spanning multiple phases)
   - `tribunal_result`: tribunalResultSchema (re-use from agents)
   - `consensus_summary`: string (1-3 sentence synthesis)
4. Export types via `z.infer`

**Verification:**

- [ ] All schemas use snake_case per API conventions
- [ ] Schemas have JSDoc documentation
- [ ] Types exported via `z.infer`
- [ ] File follows kebab-case naming

### Task 2: Create milestone debate orchestration helper

**Goal:** Build a helper that orchestrates the debate flow specific to milestone audits -- coordinating between independent review outputs and tribunal infrastructure.

**Files:** `src/skills/__helpers/milestone-debate.ts` (new)

**Steps:**

1. Create `milestone-debate.ts` in `src/skills/__helpers/`
2. Implement `shouldRunMilestoneDebate(config: MilestoneDebateConfig, complexity: string, reviewerOutputs: Record<string, unknown>): { should_run: boolean, reason: string }`:
   - Check config.enabled is true
   - Check complexity meets config.min_complexity threshold
   - Normalize findings via `normalizeFindings()` from `~/agents`
   - Detect disagreements via `detectDisagreements()` from `~/agents`
   - Check tribunal gate via `shouldRunTribunal()` from `~/agents`
   - Return decision with human-readable reason
3. Implement `buildMilestoneRebuttalContext(disagreements: Disagreement[], milestoneVersion: string): RebuttalPromptPair[]`:
   - Call `buildRebuttalPrompts()` from `~/agents`
   - Augment prompts with milestone-specific context (cross-phase scope, milestone version)
   - Return enhanced prompt pairs
4. Implement `buildMilestoneDebateResult(milestoneVersion: string, reviewerCount: number, allFindings: ReviewFinding[], disagreements: Disagreement[], rebuttals: Rebuttal[], recommendations: UnifiedRecommendation[]): MilestoneDebateResult`:
   - Call `buildTribunalResult()` from `~/agents` for core result
   - Count cross-phase disagreements (findings from different phases)
   - Generate consensus summary from unified recommendations
   - Return complete milestone debate result

**Verification:**

- [ ] All functions are pure (except I/O wrappers)
- [ ] Imports only from `~/agents` (T2 -> T2 same-tier import is acceptable for skills reusing agent infrastructure)
- [ ] JSDoc on all exported functions with @param, @returns, @example

### Task 3: Update milestone-audit skill with debate round

**Goal:** Add Step 4.5 (Design Tribunal) to the milestone-audit skill, between the existing parallel review (Step 4) and the audit report creation (Step 5).

**Files:** `src/skills/general/milestone-audit.skill.ts`

**Steps:**

1. After Step 4 "Milestone-wide Code Quality Review" and before Step 5 "Create Audit Report", add Step 4.5: Milestone Debate Round (conditional)
2. Step 4.5 gate check -- add instructions for the orchestrator:

   ````
   ### 4.5 Adversarial Debate Round (Conditional)

   **Gate check:**

   ```bash
   # Read debate config
   DEBATE_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"milestone_debate_enabled"[[:space:]]*:[[:space:]]*[a-z]*' | grep -o '[a-z]*$' || echo "false")
   COMPLEXITY=$(bun run packages/luca-framework/src/state/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}' || echo "MODERATE")
   ````

   **Skip if:** `DEBATE_ENABLED` is "false" OR complexity is below COMPLEX, OR no disagreements detected among reviewer outputs from Step 4.

   ```

   ```

3. Step 4.5.1: Normalize and detect -- collect all 5 code reviewer outputs (excluding integration checker) from Step 4 and:
   - Normalize findings using tribunal detector
   - Detect disagreements
   - Display tribunal start banner if disagreements found:

     ```
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      Luca >>> MILESTONE DEBATE ROUND
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

     {N} disagreements detected across {M} reviewers.
     Running adversarial rebuttal round...
     ```

4. Step 4.5.2: Rebuttal round -- for each disagreement, spawn rebuttal agents in PARALLEL:

   ```python
   # For each disagreement: spawn challenger and defender
   # Use the SAME reviewer agent type as the original finding

   Task(
     prompt="""
   {challenger_prompt from buildRebuttalPrompts}
   """,
     subagent_type="{challenger_agent_type}",
     description="Challenge: {finding_summary}"
   )

   Task(
     prompt="""
   {defender_prompt from buildRebuttalPrompts}
   """,
     subagent_type="{defender_agent_type}",
     description="Defend: {finding_summary}"
   )
   ```

5. Step 4.5.3: Resolve and unify -- parse rebuttal responses, determine resolutions (upheld/withdrawn/modified), build unified recommendations
6. Step 4.5.4: Display tribunal results:

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Luca >>> DEBATE COMPLETE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   | Metric                | Value |
   |-----------------------|-------|
   | Disagreements found   | {N}   |
   | Rebuttals conducted   | {N}   |
   | Findings withdrawn    | {N}   |
   | Findings modified     | {N}   |
   | Consensus confidence  | {avg} |
   | Estimated token cost  | {N}   |
   ```

7. Step 4.5.5: Replace merged findings with unified recommendations for Step 5 (audit report)

**Verification:**

- [ ] Debate only runs when all gates pass (enabled, COMPLEX+, disagreements found)
- [ ] When debate is disabled, behavior is identical to current milestone-audit
- [ ] Rebuttal agents spawned in PARALLEL (not sequential)
- [ ] Unified recommendations replace raw merged findings in the audit report
- [ ] Token budget tracked and displayed

### Task 4: Update audit report format for debate results

**Goal:** When debate runs, the MILESTONE-AUDIT.md report should include a debate section showing disagreements resolved, confidence ratings, and consensus findings.

**Files:** `src/skills/general/milestone-audit.skill.ts`

**Steps:**

1. In Step 5 "Create Audit Report", add a conditional debate section after the existing code quality findings:

   ```markdown
   ### Debate Analysis (when debate ran)

   **Disagreements Resolved:** {N}
   **Findings Withdrawn after Challenge:** {N}
   **Findings Modified after Challenge:** {N}

   #### High-Confidence Findings (>0.8)

   | Finding | Severity | File | Confidence | Debate Status       |
   | ------- | -------- | ---- | ---------- | ------------------- |
   | {issue} | {sev}    | {f}  | {conf}     | upheld/unchallenged |

   #### Contested Findings (0.5-0.8)

   | Finding | Severity | File | Confidence | Challenge Summary |
   | ------- | -------- | ---- | ---------- | ----------------- |
   | {issue} | {sev}    | {f}  | {conf}     | {summary}         |

   #### Withdrawn Findings

   | Original Finding | Original Severity | Withdrawn By | Reason |
   | ---------------- | ----------------- | ------------ | ------ |
   | {issue}          | {sev}             | {agent}      | {why}  |
   ```

2. Update the "Route B: Issues found" display to include debate stats when applicable
3. Update success criteria to include debate-related checks

**Verification:**

- [ ] Audit report includes debate section only when debate ran
- [ ] Findings are categorized by confidence threshold
- [ ] Withdrawn findings are documented with challenger attribution
- [ ] Report format degrades gracefully when debate did not run

### Task 5: Write tests for milestone debate infrastructure

**Goal:** Tests for the milestone-specific debate orchestration helpers and schema validation.

**Files:** `__tests__/src/skills/milestone-debate.test.ts` (new)

**Steps:**

1. Schema tests:
   - milestoneDebateConfigSchema validates correctly with all defaults
   - milestoneDebateConfigSchema rejects invalid min_complexity values
   - milestoneDebateResultSchema includes all required fields
2. Gate tests:
   - shouldRunMilestoneDebate returns false when config.enabled is false
   - shouldRunMilestoneDebate returns false when complexity is below threshold
   - shouldRunMilestoneDebate returns false when no disagreements found
   - shouldRunMilestoneDebate returns true when all conditions met (enabled, COMPLEX, disagreements with HIGH severity)
3. Orchestration tests:
   - buildMilestoneRebuttalContext generates augmented prompt pairs
   - buildMilestoneDebateResult correctly counts cross-phase disagreements
   - buildMilestoneDebateResult generates consensus summary from unified recommendations
4. Integration tests:
   - Full pipeline: reviewer outputs -> normalize -> detect -> rebuttal prompts -> resolve -> debate result
   - Empty disagreements produce no debate activity
   - Debate result aggregates counts correctly

**Verification:**

- [ ] `bun test __tests__/src/skills/milestone-debate.test.ts` passes
- [ ] Tests use `bun:test` imports
- [ ] Tests cover edge cases (no reviewers, all agree, single reviewer)

### Task 6: Update skills barrel and documentation

**Goal:** Export new schemas and helpers from the skills module barrel.

**Files:** `src/skills/index.ts`

**Steps:**

1. Add milestone-debate schema exports to skills barrel
2. Add milestone-debate helper exports to skills barrel
3. Ensure all new functions have JSDoc with @param, @returns, @example
4. Add module-level JSDoc to both new files

**Verification:**

- [ ] Barrel contains only re-exports
- [ ] All new public APIs accessible via `~/skills`
- [ ] JSDoc is complete on all exported functions and types

## Success Criteria

- [ ] `bun test __tests__/src/skills/milestone-debate.test.ts` passes
- [ ] `bunx --bun tsc --noEmit` passes with no new type errors
- [ ] Debate is opt-in via `workflow.milestone_debate_enabled` in config.json (default: false)
- [ ] Debate only activates for COMPLEX+ complexity with detected disagreements
- [ ] Non-debated milestone audits are identical to current behavior (no regression)
- [ ] Token budget: +20-40k per milestone audit when debate is active
- [ ] Rebuttal agents run in parallel (no sequential bottleneck)
- [ ] Audit report includes debate analysis section when debate ran
- [ ] Unified recommendations replace raw merged findings
- [ ] No cross-tier import violations (milestone-debate stays in T2 skills domain, imports from T2 agents are acceptable)
