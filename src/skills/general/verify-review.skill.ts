/**
 * verify-review Sub-Skill — Run code quality review swarm.
 *
 * Extracts Steps 9-12 from the monolithic verify skill.
 *
 * **Responsibility:** Spawn code review agents in parallel (dx-advocate,
 * code-simplifier, code-architect, ui, security-auditor), aggregate
 * review findings by severity, and write results to the shared context file.
 *
 * This sub-skill only runs if UAT passed (Path A: orchestrator sends
 * SKIP_DIAGNOSE, then calls verify-review).
 *
 * **Input:** Phase number and changed files (from orchestrator context)
 * **Output:** Populated `verify_review` section in `/tmp/verify-context.json`
 *
 * @see .planning/phases/224-anti-skip-rollout/02-PLAN.md Task 6
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const verifyReviewConfig: SkillConfig = {
  frontmatter: {
    name: "verify-review",
    description:
      "Run code quality review swarm with parallel reviewer agents for the verify sub-skill chain.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# verify-review — Code Quality Review Swarm

Run parallel code quality reviewers and aggregate findings.

## Sub-agent Delegation Requirements

This sub-skill is an **orchestrator** for code review. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents (spawn ALL in parallel):**

- \`dx-advocate\` — Convention and standards review
- \`code-simplifier\` — DRY and complexity review
- \`code-architect\` — Architecture and pattern review
- \`performance-auditor\` — Performance review
- \`security-auditor\` — Security review

**DO NOT** review code yourself. Spawn the appropriate agents.

**Reference:** See \`.claude/luca/references/task-directive.md\` for Task() syntax patterns.

## Context File Protocol

This sub-skill is part of the verify chain. It reads/writes the shared context file at \`/tmp/verify-context.json\`.

**Read:** Call \`readVerifyContext()\` from \`src/skills/__schemas/verify-context.schemas.ts\`. If \`success: false\`, ABORT immediately.

**Write:** Call \`writeVerifyContext({ verify_review: { ... } })\` to populate the \`verify_review\` section.

## Model Resolution

Each reviewer resolves its model tier from the routing table based on complexity:

\`\`\`bash
COMPLEXITY=$(luca-bridge read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}' || echo "MODERATE")
\`\`\`

| Agent | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
|-------|---------|--------|----------|---------|----------|
| dx-advocate | fast | balanced | capable | capable | capable |
| code-simplifier | fast | balanced | capable | capable | capable |
| code-architect | fast | balanced | capable | capable | capable |
| performance-auditor | fast | balanced | capable | capable | capable |
| security-auditor | fast | balanced | capable | capable | capable |

## Process

### Step 9: Get Changed Files

\`\`\`bash
CHANGED_FILES=$(git diff --name-only main...HEAD -- '*.ts' '*.tsx' 2>/dev/null | head -50)
\`\`\`

### Step 10: Spawn Reviewer Swarm

**MANDATORY:** Spawn ALL reviewers in PARALLEL (same message):

\`\`\`python
# Spawn ALL reviewers in PARALLEL
Task(
  prompt="Review for conventions and standards: {changed_files}",
  subagent_type="dx-advocate",
  description="DX review"
)

Task(
  prompt="Review for DRY and complexity: {changed_files}",
  subagent_type="code-simplifier",
  description="Simplification review"
)

Task(
  prompt="Review for architecture: {changed_files}",
  subagent_type="code-architect",
  description="Architecture review"
)

Task(
  prompt="Review for performance patterns: {changed_files}",
  subagent_type="performance-auditor",
  description="Performance review"
)

Task(
  prompt="Review for security: {changed_files}",
  subagent_type="security-auditor",
  description="Security review"
)
\`\`\`

**Do NOT proceed until ALL Tasks return.**

### Step 11: Aggregate Findings

Merge findings by severity:
- CRITICAL: Must fix before proceeding
- HIGH: Should fix, offer options
- MEDIUM: Nice to fix, informational
- LOW: Cosmetic, informational only

### Step 12: Write to Context File and Report

\`\`\`typescript
import { writeVerifyContext } from "src/skills/__schemas/verify-context.schemas";

await writeVerifyContext({
  verify_review: {
    reviewers_spawned: reviewerCount,
    review_findings: aggregatedFindings,
  },
});
\`\`\`

If CRITICAL issues found: plan fixes (same planner -> checker loop).
If HIGH/MEDIUM only: report and offer options (fix now / continue / review).
If all clean: phase verified, show next-phase commands.

## Output

On success, the context file will contain:

\`\`\`json
{
  "context_version": 1,
  "verify_extract": { "..." },
  "verify_test": { "...", "issues_found": false },
  "verify_review": {
    "reviewers_spawned": 5,
    "review_findings": [
      { "reviewer": "dx-advocate", "severity": "MEDIUM", "finding": "..." },
      { "reviewer": "code-architect", "severity": "HIGH", "finding": "..." }
    ]
  }
}
\`\`\`

## Error Handling

- **No changed files found:** Log warning, spawn reviewers with empty file list (they will report no findings).
- **Reviewer spawn failure:** Log warning, continue with remaining reviewers.
- **All reviewers fail:** Write empty findings, log error.
- **Context file read failure:** ABORT immediately per PREMORTEM Constraint #1.

## Constraints

- Write results to context file via \`writeVerifyContext()\`
- Spawn agents in PARALLEL — do NOT review code yourself
- Aggregate findings by severity before writing to context
</main>`,
      order: 1,
    },
  ],
};

export const verifyReviewSkill = createSkill(verifyReviewConfig);
