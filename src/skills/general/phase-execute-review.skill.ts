/**
 * phase-execute-review Sub-Skill — Spawn code review swarm and aggregate findings.
 *
 * Extracts Step 8 from the monolithic phase-execute skill (code review).
 *
 * **Responsibility:** Spawn all configured reviewers in parallel (code-architect,
 * dx-advocate, code-simplifier, security-auditor, etc.), aggregate their findings,
 * and write results to the shared context file.
 *
 * **Input:** Phase number (from orchestrator args/context)
 * **Output:** Populated `phase_execute_review` section in `/tmp/phase-execute-context.json`
 *
 * This sub-skill is optional. The orchestrator sends SKIP_REVIEW if verification
 * failed (harness_passed = false) or if workflow.code_review is disabled.
 *
 * @see .planning/phases/224-anti-skip-rollout/03-PLAN.md Task 5
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const phaseExecuteReviewConfig: SkillConfig = {
  frontmatter: {
    name: "phase-execute-review",
    description:
      "Spawn code review swarm and aggregate findings for the phase-execute sub-skill chain.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# phase-execute-review — Code Review Swarm

Spawn all configured code reviewers in parallel, collect their findings, and aggregate results into a review summary.

## Context File Protocol

This sub-skill is part of the phase-execute chain. It reads/writes the shared context file at \`/tmp/phase-execute-context.json\`.

**Read:** Call \`readPhaseExecuteContext()\` from \`src/skills/__schemas/phase-execute-context.schemas.ts\`. If \`success: false\`, ABORT immediately — do not proceed with stale or missing context.

**Write:** Call \`writePhaseExecuteContext({ phase_execute_review: { ... } })\` to populate the \`phase_execute_review\` section.

## Reviewer Configuration

The default reviewer set:

| Reviewer | Agent | Focus |
|----------|-------|-------|
| Architecture | code-architect | Module boundaries, dependency tiers, structural patterns |
| DX Quality | dx-advocate | Developer experience, naming, documentation quality |
| Simplification | code-simplifier | DRY violations, unnecessary complexity, dead code |
| Security | security-auditor | Security vulnerabilities, auth issues, data exposure |

Additional reviewers may be configured via \`.planning/config.json\` under \`workflow.reviewers\`.

## Process

### Step 1: Prepare Review Context

Gather the diff for the phase's changes:

\`\`\`bash
# Get the diff from phase start to current HEAD
git diff {phase_start_commit}..HEAD
\`\`\`

Read project conventions from MuninnDB brain tree for reviewer context.

### Step 2: Spawn Reviewers in Parallel

Spawn all configured reviewers simultaneously:

\`\`\`
# All reviewers run in parallel — no ordering dependency between them
Task(
  prompt: """
<review_context>
Review the code changes for Phase {phase_number}.
Focus on {reviewer_focus_area}.
{diff_or_file_list}
{project_conventions}
</review_context>

Provide findings as structured data: severity (critical/warning/info), description, file path, line number if applicable.
""",
  subagent_type: "{reviewer_agent}",
  description: "Code review: {reviewer_name} for phase {phase_number}"
)
\`\`\`

### Step 3: Collect and Aggregate Findings

Wait for all reviewers to complete. Collect findings from each reviewer:

- Group by severity (critical > warning > info)
- Deduplicate overlapping findings from different reviewers
- Create a summary with total counts per severity

### Step 4: Write to Context File

\`\`\`typescript
import { writePhaseExecuteContext } from "src/skills/__schemas/phase-execute-context.schemas";

await writePhaseExecuteContext({
  phase_execute_review: {
    reviewers_spawned: reviewerNames,
    review_findings: aggregatedFindings,
    review_summary: summaryText,
  },
});
\`\`\`

## Output

On success, the context file will contain:

\`\`\`json
{
  "context_version": 1,
  "phase_execute_review": {
    "reviewers_spawned": ["code-architect", "dx-advocate", "code-simplifier", "security-auditor"],
    "review_findings": [
      { "reviewer": "code-architect", "severity": "warning", "finding": "..." },
      { "reviewer": "dx-advocate", "severity": "info", "finding": "..." }
    ],
    "review_summary": "4 reviewers completed. 0 critical, 2 warnings, 3 info."
  }
}
\`\`\`

## Error Handling

- **Individual reviewer spawn failure:** Log warning, continue with remaining reviewers. Do not ABORT for a single reviewer failure.
- **All reviewers failed:** Log error, write empty findings to context file, do not ABORT. The orchestrator will proceed to learning capture.
- **Context file read failure:** ABORT immediately per PREMORTEM Constraint #1.

## Constraints

- Write results to context file via \`writePhaseExecuteContext()\`
- Spawn all reviewers in parallel — do NOT run them sequentially
- Do NOT fix any issues found — only collect and report findings
- Use cold isolation mode for reviewers (git diff + project identity only)
</main>`,
      order: 1,
    },
  ],
};

export const phaseExecuteReviewSkill = createSkill(phaseExecuteReviewConfig);
