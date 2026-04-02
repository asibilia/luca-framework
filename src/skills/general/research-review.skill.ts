/**
 * research-review Skill - Orchestrate convergence-based research
 * review loop with cold-isolated reviewer agents.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import { CONVERGENCE_BLOCKING_TRANSITIONS } from "~/skills/__helpers/convergence-loop-shared";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const researchReviewConfig: SkillConfig = {
  frontmatter: {
    name: "research-review",
    description:
      "Orchestrate convergence-based research review loop with cold-isolated reviewer agents.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Research Review Loop

**Arguments:** \`<phase number> [--max-iterations=N] [--threshold=0.8]\`

## Process


### Step 1: Load Research Corpus

\`\`\`
PADDED_PHASE=$(printf "%02d" $PHASE)
PHASE_DIR=$(ls -d .planning/phases/$PADDED_PHASE-* .planning/phases/$PHASE-* 2>/dev/null | head -1)
RESEARCH_DIR="$PHASE_DIR/research"

# Read all numbered research files
Read all files matching: $RESEARCH_DIR/[0-9]*.md

# Read phase intent from state (via bridge) or CONTEXT.md
Read $PHASE_DIR/*-CONTEXT.md for phase description
\`\`\`

### Step 2: Read Review Config

\`\`\`
# Max iterations from arg or config (default by complexity):
# TRIVIAL=1, SIMPLE=2, MODERATE=2, COMPLEX=3, CRITICAL=3
MAX_ITERATIONS = --max-iterations flag OR config value OR 3

# continueForImportant: default true
# (whether IMPORTANT findings trigger additional iterations)
\`\`\`

### Step 3: Initialize Review Loop

\`\`\`
iteration = 1
status = "REVIEWING"
review_log = []
\`\`\`

### Step 4: Spawn 3 Reviewers in Parallel (Cold Isolation)

For each iteration, spawn all 3 reviewers as parallel Task() calls:

\`\`\`
Task(subagent_type: "lu-completeness-reviewer", prompt: "Review research corpus for completeness.
Phase intent: {phase_description}
Research files: {list of files in research/}
Iteration: {N} of {MAX}
{if iteration > 1: Prior review gaps that should be addressed: {prior_gaps}}")

Task(subagent_type: "lu-accuracy-reviewer", prompt: "Review research corpus for accuracy.
Phase intent: {phase_description}
Research files: {list of files in research/}
Iteration: {N} of {MAX}
{if iteration > 1: Prior review gaps that should be addressed: {prior_gaps}}")

Task(subagent_type: "lu-actionability-reviewer", prompt: "Review research corpus for actionability.
Phase intent: {phase_description}
Research files: {list of files in research/}
Iteration: {N} of {MAX}
{if iteration > 1: Prior review gaps that should be addressed: {prior_gaps}}")
\`\`\`

### Step 5: Collect and Parse Reviews

Parse each reviewer's structured output to extract:
- Score (0.0-1.0)
- Gap entries with IDs and severities
- Count CRITICAL, IMPORTANT, and MINOR gaps

**Gap parsing format (Decision 8):**
\`\`\`
Parse lines matching: G-{PREFIX}-NNN: [severity: LEVEL] Description
Where PREFIX is COMP, ACC, or ACT
Where LEVEL is CRITICAL, IMPORTANT, or MINOR
\`\`\`

### Step 6: Check Convergence (Decision 3 -- Gap-Severity Model)

**Convergence state machine:**

\`\`\`
B(n) = total CRITICAL gaps across all reviewers
F(n) = total gaps (all severities) across all reviewers
I(n) = total IMPORTANT gaps across all reviewers

if B(n) == 0 AND (I(n) == 0 OR NOT continueForImportant OR iteration >= MAX_ITERATIONS):
    status = "CONVERGED" -> APPROVED
elif B(n) == 0 AND I(n) > 0 AND continueForImportant AND iteration < MAX_ITERATIONS:
    status = "IMPROVING" -> continue with IMPORTANT gap targets
elif B(n) > 0 AND iteration < MAX_ITERATIONS:
${CONVERGENCE_BLOCKING_TRANSITIONS}
elif B(n) > 0 AND iteration >= MAX_ITERATIONS:
    status = "ESCALATE" -> present to user
\`\`\`

### Step 7: If NEEDS_EXPANSION

When convergence check returns NEEDS_EXPANSION:

\`\`\`
# Extract CRITICAL and IMPORTANT gaps as expansion targets
expansion_targets = [gap.description for gap in gaps if gap.severity in ("CRITICAL", "IMPORTANT")]

# Signal to the orchestrator that expansion is needed.
# The ORCHESTRATOR (not this skill) should invoke research-expand
# as a separate Agent() call, since sub-agents cannot call Skill().
# Return NEEDS_EXPANSION status with the expansion targets.

# Increment iteration, loop back to Step 4
iteration += 1
\`\`\`

**IMPORTANT:** This skill MUST NOT call \`Skill(skill: "research-expand")\` directly. When running as an Agent() sub-agent, it cannot invoke Skill(). Instead, return \`NEEDS_EXPANSION\` with the expansion targets, and let the orchestrator handle the expansion call.

### Step 8: Write REVIEW-LOG.md

Write to \`$RESEARCH_DIR/REVIEW-LOG.md\` with all iterations:

\`\`\`markdown
# Research Review Log

**Phase:** {N} - {name}
**Status:** APPROVED | ESCALATED
**Iterations:** {current}/{max}

## Iteration 1

### Completeness Review
**Reviewer:** lu-completeness-reviewer
**Score:** {score}/1.0
**Gaps:**
- G-COMP-001: [severity: LEVEL] Description

### Accuracy Review
**Reviewer:** lu-accuracy-reviewer
**Score:** {score}/1.0
**Gaps:**
- G-ACC-001: [severity: LEVEL] Description

### Actionability Review
**Reviewer:** lu-actionability-reviewer
**Score:** {score}/1.0
**Gaps:**
- G-ACT-001: [severity: LEVEL] Description

### Iteration Decision
**State:** CONVERGED | IMPROVING | STALLED | DIVERGING
**B(n):** {blocking count} | **F(n):** {total count}
**Action:** APPROVED | NEEDS_EXPANSION | ESCALATE

## Final Decision
**Status:** APPROVED | ESCALATED
**Remaining gaps:** {list or "none"}
\`\`\`

### Step 9: Return Structured Result

\`\`\`
## REVIEW COMPLETE
**Status:** APPROVED | ESCALATED
**Iterations:** {N}/{MAX}
**Final scores:** completeness={X}, accuracy={Y}, actionability={Z}
**Blocking gaps remaining:** {count}
**IMPORTANT gaps remaining:** {count}
\`\`\`

## Convergence Quick Reference

| Condition | State | Action |
|-----------|-------|--------|
| 0 CRITICAL + 0 IMPORTANT | CONVERGED | APPROVED |
| 0 CRITICAL + N IMPORTANT (iter < max) | IMPROVING | Expand for IMPORTANT |
| 0 CRITICAL + N IMPORTANT (iter = max) | CONVERGED | APPROVED (note caveats) |
| N CRITICAL (iter < max, decreasing) | IMPROVING | Expand for CRITICAL |
| N CRITICAL (iter < max, flat) | STALLED | Expand with enhanced request |
| N CRITICAL (iter < max, increasing) | DIVERGING | Expand with warning |
| N CRITICAL (iter = max) | -- | ESCALATE to user |

## Success Criteria

- [ ] All 3 reviewers spawned in cold isolation
- [ ] Reviews collected with parseable gap IDs (G-COMP-/G-ACC-/G-ACT-)
- [ ] CRITICAL/IMPORTANT/MINOR counts extracted correctly
- [ ] Convergence evaluated using gap-severity model (not scored dimensions)
- [ ] REVIEW-LOG.md written with all iterations
- [ ] Loop terminates: approval, budget exhaustion, or escalation

</main>`,
      order: 1,
    },
  ],
};

export const researchReviewSkill = createSkill(researchReviewConfig);
