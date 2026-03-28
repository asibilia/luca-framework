/**
 * pr-learn Sub-Skill — Capture PR review patterns as MuninnDB pitfall engrams.
 *
 * Extracts Step 7.5 from the monolithic pr-address skill.
 *
 * **Responsibility:** Read all categorized concerns and verification results
 * from context file, spawn lu-learner to extract pitfalls, write pitfalls
 * to DEFAULT_VAULT (cross-cutting), link new engrams to related memories.
 *
 * **Input:** Categorized concerns + verification results from context file
 * **Output:** Populated `pr_learn` section in `/tmp/pr-address-context.json`
 *
 * This sub-skill is OPTIONAL (PREMORTEM Constraint #2). The orchestrator
 * sends SKIP_LEARN if there are no learnable comments, or LEARN_COMPLETE
 * after this skill runs.
 *
 * @see .planning/phases/223-anti-skip-pilot/01-PLAN.md Task 7
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const prLearnConfig: SkillConfig = {
  frontmatter: {
    name: "pr-learn",
    description:
      "Capture PR review patterns as MuninnDB pitfall engrams for future recall.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# pr-learn — Capture PR Review Learnings

Extract pitfall patterns from PR review comments and store them as MuninnDB engrams for future recall across projects.

## Context File Protocol

This sub-skill is part of the pr-address chain. It reads/writes the shared context file at \`/tmp/pr-address-context.json\`.

**Read:** Call \`readPrContext()\` from \`src/skills/__schemas/pr-address-context.schemas.ts\`. If \`success: false\`, ABORT immediately. Requires \`pr_validate\` and \`pr_fix\` sections to be populated.

**Write:** Call \`writePrContext({ pr_learn: { ... } })\` to populate the \`pr_learn\` section.

## Optional Sub-Skill

This sub-skill is **optional** (PREMORTEM Constraint #2). The orchestrator decides whether to invoke it based on whether there are any categorized concerns from pr-validate. If zero comments were processed, the orchestrator sends SKIP_LEARN to bypass this skill.

## Vault Routing

**CRITICAL:** Pitfalls from PR reviews are cross-cutting learnings — they apply across all projects.

\`\`\`bash
# Vault routing for this skill
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=\${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

- \`pitfall:pr-review-*\` engrams -> write to **DEFAULT_VAULT** (cross-cutting)
- \`muninn_link\` operations -> use **DEFAULT_VAULT** (linking to cross-cutting engrams)
- \`session:*\` context -> write to **REPO_VAULT** (project-scoped)

## Process

### Step 7.5: Spawn lu-learner

Gather all categorized concerns and verification results, then spawn lu-learner:

\`\`\`python
Task(
  prompt="""
<learning_context>
**Recipient:** pr-learn orchestrator (report findings back)

**Source:** PR review comments
**PR:** #{pr_number}
**Verification Result:** {verification_summary}

**Review Comments (All Categorized):**
{for each categorized comment from context file:}
- Comment #{comment_id}: "{comment_text}"
  - Category: {category}
  - Verdict: {fix_needed | disputed | informational}
  - File: {file_path}
  - Fix Applied: {fix_description if fix_needed, else "N/A"}
  - Fix Verified: {fix_verified if fix_needed, else "N/A"}
</learning_context>

<extraction_targets>
Extract ONLY pitfalls from PR review feedback:
- **Category**: Use \\\`pitfall:pr-review-{descriptive-name}\\\`
- **Confidence**: Low (first occurrence from PR review)
- **Content**: What the reviewer caught, why it matters, how to avoid it
- All comments captured at low confidence -- the confidence evolution
  system (3+ feedback heuristic) handles quality over time
</extraction_targets>

<output_requirements>
- Write each pitfall as a MuninnDB engram via muninn_remember with vault: DEFAULT_VAULT (pitfalls are cross-cutting)
- Use concept: "pitfall:pr-review-{descriptive-name}"
- Link new engrams to related existing memories via muninn_link with vault: DEFAULT_VAULT
- Return summary of learnings captured (concept names and brief descriptions)
</output_requirements>

Extract learnings from these PR review comments.
""",
  subagent_type="lu-learner",
  description="Capture PR review learnings"
)
\`\`\`

**Do NOT proceed until the Task returns.**

### Step 7.5.9: Write to Context File

Write learning summary to the shared context file:

\`\`\`typescript
import { writePrContext } from "src/skills/__schemas/pr-address-context.schemas";

await writePrContext({
  pr_learn: {
    learnings_captured: capturedLearnings.map(l => ({
      concept: l.concept,
      vault: "default",
      summary: l.summary,
    })),
  },
});
\`\`\`

## Output

On success, the context file will include:

\`\`\`json
{
  "pr_learn": {
    "learnings_captured": [
      {
        "concept": "pitfall:pr-review-missing-null-check",
        "vault": "default",
        "summary": "Reviewer caught missing null check on user input"
      }
    ]
  }
}
\`\`\`

## Error Handling

- **Context file missing or invalid:** ABORT — pr-validate and pr-fix must run first
- **lu-learner failure:** Log warning, write empty learnings_captured array. This is an optional skill, so failure does not halt the chain.
- **MuninnDB unavailable:** Log warning, still write summary to context file

## Constraints

- This is an OPTIONAL sub-skill — failure does not halt the chain
- All pitfall engrams go to DEFAULT_VAULT (cross-cutting, not project-scoped)
- Do NOT modify code — learning is read-only observation
- Do NOT respond to PR comments — that is pr-respond's responsibility
</main>`,
      order: 1,
    },
  ],
};

export const prLearnSkill = createSkill(prLearnConfig);
