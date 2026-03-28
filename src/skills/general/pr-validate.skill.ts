/**
 * pr-validate Sub-Skill — Categorize comments, spawn reviewer agents, aggregate validation.
 *
 * Extracts Steps 2-3-4 from the monolithic pr-address skill.
 *
 * **Responsibility:** Read fetched comments from context file, categorize by
 * concern type, spawn reviewer agents in parallel via Task(), collect YAML
 * validation results, aggregate into valid/disputed/informational arrays,
 * detect split verdicts.
 *
 * **Input:** Fetched comments from context file (pr_fetch section)
 * **Output:** Populated `pr_validate` section in `/tmp/pr-address-context.json`
 *
 * This is an orchestrating sub-skill — it spawns reviewer agents via Task().
 *
 * @see .planning/phases/223-anti-skip-pilot/01-PLAN.md Task 4
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const prValidateConfig: SkillConfig = {
  frontmatter: {
    name: "pr-validate",
    description:
      "Categorize PR comments, spawn reviewer agents in parallel, and aggregate validation results.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# pr-validate — Categorize and Validate PR Comments

Categorize fetched PR comments by concern type, spawn specialist reviewer agents in parallel, and aggregate results into valid/disputed/informational arrays.

## Context File Protocol

This sub-skill is part of the pr-address chain. It reads/writes the shared context file at \`/tmp/pr-address-context.json\`.

**Read:** Call \`readPrContext()\` from \`src/skills/__schemas/pr-address-context.schemas.ts\`. If \`success: false\`, ABORT immediately. Requires \`pr_fetch\` section to be populated.

**Write:** Call \`writePrContext({ pr_validate: { ... } })\` to populate the \`pr_validate\` section.

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate validation to sub-agents using the Task tool.

**Required sub-agents:**
- \`security-auditor\` — Validates security-related concerns
- \`code-architect\` — Validates architecture/design concerns
- \`performance-auditor\` — Validates performance concerns
- \`dx-advocate\` — Validates code quality concerns
- \`ux\` — Validates accessibility concerns
- \`lu-pr-reviewer\` — Validates general feedback

**DO NOT** validate concerns yourself. Spawn the appropriate agents.

## Process

### Step 2: Categorize Comments

Read actionable comments from the context file and categorize each by concern type:

| Category      | Signals                                                      | Route To             |
| ------------- | ------------------------------------------------------------ | -------------------- |
| Security      | "vulnerability", "injection", "auth", "XSS", "CSRF"          | security-auditor     |
| Architecture  | "design", "pattern", "structure", "coupling", "abstraction"  | code-architect       |
| Performance   | "performance", "slow", "optimize", "memory", "N+1"           | performance-auditor  |
| Code Quality  | "naming", "duplication", "readability", "convention"         | dx-advocate          |
| Accessibility | "a11y", "accessibility", "ARIA", "keyboard", "screen reader" | ux                   |
| Testing       | "test", "coverage", "mock", "assertion"                      | lu-pr-reviewer       |
| General       | (default)                                                    | lu-pr-reviewer       |

### Step 3: Spawn Reviewer Agents (Parallel)

**MANDATORY**: Spawn ALL applicable reviewers in PARALLEL (same message, multiple Task calls).

First, read the PR diff from the context file for code context.

Then spawn reviewers for each categorized comment:

\`\`\`python
# Security Auditor - for security-tagged comments
Task(
  prompt="""
<validation_context>
**Recipient:** pr-validate orchestrator (report findings back)

**PR:** #{pr_number}
**Comment ID:** {comment_id}
**Comment Text:** {comment_text}
**File:** {file_path}
**Line:** {line_number}

**Code Context:**
{surrounding_code}

**PR Diff:**
{pr_diff_for_file}
</validation_context>

<validation_task>
Evaluate if this security concern is valid. Consider:
1. Is there actually a vulnerability?
2. How severe is it if real?
3. What's the fix if needed?
4. If invalid, why?
</validation_task>

<output_format>
Return YAML:
\\\`\\\`\\\`yaml
comment_id: '{comment_id}'
valid: true | false
reasoning: "Explanation"
severity: critical | high | medium | low | info
fix_needed: true | false
suggested_fix: "How to address (if needed)"
disagree_response: "Response if we disagree (if valid: false)"
\\\`\\\`\\\`
</output_format>

Validate this security concern.
""",
  subagent_type="security-auditor",
  description="Validate security concern #{comment_id}"
)

# Repeat for code-architect, performance-auditor, dx-advocate, ux, lu-pr-reviewer
# as appropriate for each comment's category
\`\`\`

**Do NOT proceed until ALL reviewer Tasks return.**

### Step 4: Aggregate Validation Results

Collect results from all reviewer agents and aggregate into three groups:

**Valid Concerns (fix_needed: true):**
Comments where the reviewer confirmed the concern is valid and a fix is needed.

**Disputed Concerns (valid: false):**
Comments where the reviewer determined the concern is not valid, with a disagree_response.

**Informational (severity: info or acknowledgment only):**
Comments that are informational with no action needed.

### Step 4.1: Detect Split Verdicts

After aggregation, check for split verdicts — comments where multiple validators produced conflicting results (tie or narrow majority).

For each comment validated by multiple agents, compare verdicts:
- If all agree: clear verdict (no split)
- If tie (e.g., 3-3) or narrow split (e.g., 3-2): record as split verdict

Split verdicts will be resolved by pr-debate (if the orchestrator sends DEBATE_COMPLETE) or skipped via SKIP_DEBATE.

### Step 4.9: Write to Context File

Write aggregated results to the shared context file:

\`\`\`typescript
import { writePrContext } from "src/skills/__schemas/pr-address-context.schemas";

await writePrContext({
  pr_validate: {
    valid_concerns: validConcerns,
    disputed_concerns: disputedConcerns,
    informational: informational,
    split_verdicts: splitVerdicts,
  },
});
\`\`\`

## Output

On success, the context file will include:

\`\`\`json
{
  "pr_validate": {
    "valid_concerns": [
      { "comment_id": "123", "category": "security", "severity": "high", "reasoning": "...", "suggested_fix": "..." }
    ],
    "disputed_concerns": [
      { "comment_id": "456", "category": "architecture", "reasoning": "...", "disagree_response": "..." }
    ],
    "informational": [
      { "comment_id": "789", "category": "general", "note": "Acknowledgment only" }
    ],
    "split_verdicts": [
      { "comment_id": "101", "split_ratio": "3-2", "majority_position": "valid", "dissent_position": "invalid" }
    ]
  }
}
\`\`\`

## Error Handling

- **Context file missing or invalid:** ABORT — pr-fetch must run first
- **No actionable comments:** Write empty arrays to context file (valid result, not an error)
- **Reviewer agent failure:** Log warning, exclude that reviewer's result from aggregation

## Constraints

- This skill MUST spawn reviewer agents via Task() — do NOT validate inline
- Do NOT plan or execute fixes — that is pr-fix's responsibility
- Do NOT handle split verdict debates — that is pr-debate's responsibility
- Do NOT respond to PR comments — that is pr-respond's responsibility
</main>`,
      order: 1,
    },
  ],
};

export const prValidateSkill = createSkill(prValidateConfig);
