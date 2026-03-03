---
id: 92-C
title: "PR address split verdict debate"
phase: 92
wave: 1
complexity: MODERATE
todo: 39
---

# 92-C: PR Address Split Verdict Debate

## Objective

When the pr-address skill's parallel validator agents produce a split verdict on a PR comment (e.g., 3-3 tie or narrow 4-2 split), trigger a lightweight rebuttal round where dissenting validators explain their reasoning and the majority responds. Present both perspectives with attribution to the user, enabling informed decisions on contested feedback rather than silently applying majority rule.

Currently, pr-address spawns multiple validator agents (security-auditor, code-architect, dx-advocate, etc.) for each PR comment, and their individual verdicts (valid/invalid) are aggregated. When validators split (some say "valid concern, fix needed" while others say "invalid, disagree"), the skill simply follows the majority without surfacing the disagreement. This loses valuable signal -- the dissenting perspective may identify legitimate trade-offs the majority missed.

This plan uses the simpler "rebuttal prompt" pattern from the tribunal infrastructure (not full agent teams via SendMessage/TeamCreate), keeping token cost to +30-40k per split verdict occurrence.

## Context

@src/skills/general/pr-address.skill.ts -- Step 3: spawns reviewer agents in parallel, Step 4: aggregates validation results, categorizes as Valid/Disputed/Informational
@src/agents/**schemas/tribunal.schemas.ts -- rebuttalSchema, rebuttalResolutionSchema, reviewFindingSchema (reusable for structuring validator disagreements)
@src/agents/**helpers/tribunal-rebuttals.ts -- buildRebuttalPrompts (pattern for generating challenger/defender prompts), resolveRebuttals
@src/agents/**helpers/tribunal-detector.ts -- normalizeFindings, detectDisagreements (can be adapted for validator verdict normalization)
@src/agents/index.ts -- Barrel exports for tribunal infrastructure
@src/skills/**schemas/skill.schemas.ts -- SkillConfig schema
@src/skills/\_\_helpers/create-skill.ts -- createSkill factory

The tribunal infrastructure provides reusable patterns but needs adaptation for PR validation context:

- **Findings are different:** PR validators return `{ valid: boolean, reasoning: string, severity: string }` not code review findings with file:line
- **Disagreements are different:** Split is about validity of a concern, not severity or scope of a finding
- **Resolution is different:** Goal is presenting both perspectives, not withdrawing/modifying findings
- **Scale is different:** Per-comment debate, not per-file-line debate

## Tasks

### Task 1: Define PR verdict debate schemas

**Goal:** Create Zod schemas for PR validation split detection and rebuttal context.

**Files:** `src/skills/__schemas/pr-verdict-debate.schemas.ts` (new)

**Steps:**

1. Create `pr-verdict-debate.schemas.ts` in `src/skills/__schemas/`
2. Define `validatorVerdictSchema` -- normalized validator output:
   - `comment_id`: string (the PR comment being validated)
   - `agent`: string (which validator agent produced this verdict)
   - `valid`: boolean (is the concern legitimate)
   - `reasoning`: string (why valid or invalid)
   - `severity`: enum "critical" | "high" | "medium" | "low" | "info"
   - `suggested_fix`: string (optional, when valid)
   - `disagree_response`: string (optional, when invalid)
3. Define `verdictSplitSchema` -- detected split:
   - `comment_id`: string
   - `comment_text`: string (original PR comment)
   - `valid_count`: number
   - `invalid_count`: number
   - `valid_verdicts`: array of validatorVerdictSchema
   - `invalid_verdicts`: array of validatorVerdictSchema
   - `split_ratio`: string (e.g., "3-3", "4-2")
   - `is_tie`: boolean
4. Define `verdictRebuttalSchema` -- a rebuttal exchange on a split verdict:
   - `comment_id`: string
   - `dissenter_agent`: string (the agent who disagrees with majority)
   - `dissenter_position`: "valid" | "invalid" (their stance)
   - `dissent_argument`: string (why they disagree)
   - `majority_response`: string (majority perspective's counter)
   - `resolution`: "majority_upheld" | "dissent_acknowledged" | "escalate_to_human"
5. Define `splitVerdictResultSchema` -- complete result for one comment:
   - `comment_id`: string
   - `comment_text`: string
   - `split_ratio`: string
   - `rebuttals`: array of verdictRebuttalSchema
   - `final_recommendation`: "fix" | "disagree" | "defer_to_human"
   - `confidence`: number (0.0-1.0)
   - `both_perspectives_summary`: string (2-3 sentence summary of both sides)
6. Export types via `z.infer`

**Verification:**

- [ ] All schemas use snake_case per API conventions
- [ ] Schemas have JSDoc documentation
- [ ] Types exported via `z.infer`
- [ ] File follows kebab-case naming

### Task 2: Create split verdict detection and rebuttal helpers

**Goal:** Build pure functions to detect split verdicts and generate rebuttal prompts adapted for the PR validation context.

**Files:** `src/skills/__helpers/pr-verdict-debate.ts` (new)

**Steps:**

1. Create `pr-verdict-debate.ts` in `src/skills/__helpers/`
2. Implement `detectVerdictSplits(verdicts: ValidatorVerdict[], splitThreshold: number = 0.6): VerdictSplit[]`:
   - Group verdicts by comment_id
   - For each comment, count valid vs invalid verdicts
   - A split is detected when the majority ratio is at or below splitThreshold (e.g., 4-2 = 0.67 > 0.6, no split; 3-3 = 0.5 <= 0.6, split detected)
   - Default threshold 0.6 catches ties (3-3) and narrow splits (4-2 when 6 validators)
   - Return array of VerdictSplit objects
3. Implement `buildDissenterPrompt(split: VerdictSplit): string`:
   - Generate a prompt for the dissenting side to articulate their strongest argument:

     ```
     A PR review comment has produced a split verdict among validators.

     **Original Comment:** {comment_text}

     **Majority Position ({valid_count} validators):** The concern is {valid/invalid}
     **Majority Reasoning:** {aggregated reasoning from majority}

     **Your Position ({invalid_count} validators):** The concern is {valid/invalid}
     **Your Reasoning:** {aggregated reasoning from minority}

     Provide your strongest argument (2-3 sentences) for why the majority may be wrong.
     Focus on specific technical evidence, trade-offs, or context they may have missed.
     ```

4. Implement `buildMajorityResponsePrompt(split: VerdictSplit, dissenterArgument: string): string`:
   - Generate a prompt for the majority side to respond:

     ```
     A dissenting validator challenges the majority position on a PR comment.

     **Original Comment:** {comment_text}

     **Your Position ({valid_count} validators):** The concern is {valid/invalid}
     **Dissenter Challenge:** {dissenterArgument}

     Respond in 2-3 sentences. Either:
     1. Uphold your position with counter-evidence
     2. Acknowledge the dissent has merit and suggest deferring to human judgment

     Return your response in this format:
     RESOLUTION: majority_upheld | dissent_acknowledged | escalate_to_human
     RESPONSE: [your response]
     ```

5. Implement `buildSplitVerdictResult(split: VerdictSplit, rebuttals: VerdictRebuttal[]): SplitVerdictResult`:
   - Determine final recommendation:
     - If majority says "valid" and is upheld: "fix"
     - If majority says "invalid" and is upheld: "disagree"
     - If dissent acknowledged or escalated: "defer_to_human"
   - Calculate confidence:
     - Tie (3-3): 0.5 base
     - Narrow split (4-2): 0.65 base
     - Dissent acknowledged: reduce by 0.1
     - Escalate to human: set to 0.3
   - Generate both_perspectives_summary from rebuttals
6. Implement `formatSplitVerdictForPR(result: SplitVerdictResult): string`:
   - Format the result as a GitHub comment body showing both perspectives:

     ```markdown
     **Split Verdict ({split_ratio})**

     This comment produced a split verdict among reviewers.

     **Majority View:** {majority reasoning summary}
     **Dissenting View:** {dissenting reasoning summary}

     **Resolution:** {final_recommendation} (confidence: {confidence})
     ```

**Verification:**

- [ ] All functions are pure
- [ ] detectVerdictSplits correctly handles ties, narrow splits, and clear majorities
- [ ] Prompts are clear and actionable
- [ ] No imports from outside T2 skills domain except T2 agents (tribunal infrastructure)

### Task 3: Integrate split verdict debate into pr-address skill

**Goal:** Add a debate step between Step 4 (Aggregate Validation Results) and Step 5 (Create Fix Plan) in the pr-address skill.

**Files:** `src/skills/general/pr-address.skill.ts`

**Steps:**

1. After Step 4 "Aggregate Validation Results", add Step 4.5: Split Verdict Debate (conditional):

   ````
   ### Step 4.5: Split Verdict Debate (Conditional)

   **Gate check:** Skip if no split verdicts detected (all comments have clear majority).

   After aggregating validator results from Step 4, check for split verdicts:

   For each comment where validators produced a split verdict (tie or narrow majority):

   **Step 4.5.1: Dissenter argument**

   Spawn a sub-agent using the dissenting validator type to articulate the strongest dissent:

   ```python
   Task(
     prompt="""{dissenter_prompt}""",
     subagent_type="{dissenting_agent_type}",
     description="Dissent: comment #{comment_id}"
   )
   ````

   **Step 4.5.2: Majority response**

   Spawn a sub-agent using the majority validator type to respond:

   ```python
   Task(
     prompt="""{majority_response_prompt}""",
     subagent_type="{majority_agent_type}",
     description="Respond: comment #{comment_id}"
   )
   ```

   **Step 4.5.3: Present both perspectives**

   Display split verdict result:

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Luca >>> SPLIT VERDICT: Comment #{comment_id}
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Split: {split_ratio}
   Majority: {position} ({count} validators)
   Dissent: {position} ({count} validators)

   Recommendation: {fix | disagree | defer_to_human}
   Confidence: {confidence}

   Both Perspectives: {summary}
   ```

   ```

   ```

2. Update the "Disputed Concerns" table in Step 4 aggregation to include split verdict information when debate ran
3. For split verdicts resolved as "defer_to_human", add to the PR summary comment (Step 9) as a separate section:

   ```markdown
   ### Contested Comments (Human Review Requested)

   | Comment | Split | Majority | Dissent | Recommendation |
   | ------- | ----- | -------- | ------- | -------------- |
   | #{id}   | 3-3   | Valid    | Invalid | Defer to human |
   ```

4. Update the existing "Validation disagreement" error handling note to reference the new debate mechanism

**Verification:**

- [ ] Split verdict debate only triggers on actual splits (not clear majorities)
- [ ] When no splits detected, behavior identical to current pr-address
- [ ] Dissenter and majority agents spawned sequentially (dissenter first, majority responds to dissent)
- [ ] Both perspectives presented with attribution
- [ ] Token budget: +30-40k per split verdict

### Task 4: Write tests for PR verdict debate infrastructure

**Goal:** Tests for split detection, prompt generation, result building, and formatting.

**Files:** `__tests__/src/skills/pr-verdict-debate.test.ts` (new)

**Steps:**

1. Split detection tests:
   - detectVerdictSplits returns empty array when all comments have clear majority (5-1)
   - detectVerdictSplits detects ties (3-3)
   - detectVerdictSplits detects narrow splits (4-2 with threshold 0.6)
   - detectVerdictSplits handles single validator (no split possible)
   - detectVerdictSplits handles all-agree (6-0, no split)
   - detectVerdictSplits correctly separates valid vs invalid verdicts
2. Prompt tests:
   - buildDissenterPrompt includes comment text and reasoning from both sides
   - buildMajorityResponsePrompt includes dissenter argument
   - Prompts are well-formed strings (no undefined values)
3. Result tests:
   - buildSplitVerdictResult returns "fix" when majority says valid and is upheld
   - buildSplitVerdictResult returns "disagree" when majority says invalid and is upheld
   - buildSplitVerdictResult returns "defer_to_human" when dissent acknowledged
   - Confidence calculation follows expected formula
4. Formatting tests:
   - formatSplitVerdictForPR generates valid markdown
   - Output includes both perspectives
   - Output includes split ratio and confidence

**Verification:**

- [ ] `bun test __tests__/src/skills/pr-verdict-debate.test.ts` passes
- [ ] Tests use `bun:test` imports
- [ ] Tests cover edge cases (zero validators, single validator, all agree, all disagree)

### Task 5: Update skills barrel and documentation

**Goal:** Export new schemas and helpers from the skills module barrel.

**Files:** `src/skills/index.ts`

**Steps:**

1. Add pr-verdict-debate schema exports to skills barrel
2. Add pr-verdict-debate helper exports to skills barrel
3. Ensure all new functions have JSDoc with @param, @returns, @example
4. Add module-level JSDoc explaining the split verdict debate pattern

**Verification:**

- [ ] Barrel contains only re-exports
- [ ] All new public APIs accessible via `~/skills`
- [ ] JSDoc is complete on all exported functions and types

## Success Criteria

- [ ] `bun test __tests__/src/skills/pr-verdict-debate.test.ts` passes
- [ ] `bunx --bun tsc --noEmit` passes with no new type errors
- [ ] Split verdict debate triggers only on actual splits (tie or narrow majority)
- [ ] When no splits detected, pr-address behavior is identical to current (no regression)
- [ ] Both perspectives are presented with agent attribution
- [ ] "defer_to_human" recommendation surfaces in PR summary for contested comments
- [ ] Token budget: +30-40k per split verdict occurrence
- [ ] No cross-tier import violations (stays in T2 skills domain)
- [ ] Dissenter prompt runs before majority response prompt (sequential within each split)
- [ ] Split verdicts are reported in the PR summary comment
