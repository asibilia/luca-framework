/**
 * milestone-learn Sub-Skill — Extract session learnings and consolidate engrams.
 *
 * Extracts Step 0 (learning extraction) from the monolithic milestone-complete skill.
 *
 * **Responsibility:** Recall session learnings from MuninnDB, spawn lu-learner
 * for pattern/decision/pitfall extraction, review milestone-specific insights,
 * and write results to the shared context file.
 *
 * **Input:** Milestone version (from orchestrator context)
 * **Output:** Populated `milestone_learn` section in `/tmp/milestone-complete-context.json`
 *
 * @see .planning/phases/224-anti-skip-rollout/01-PLAN.md Task 3
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const milestoneLearnConfig: SkillConfig = {
  frontmatter: {
    name: "milestone-learn",
    description:
      "Extract session learnings and consolidate engrams for the milestone-complete sub-skill chain.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# milestone-learn — Final Learning Extraction

Extract all session learnings before milestone archival. This ensures no insights are lost when the milestone is closed.

## Context File Protocol

This sub-skill is part of the milestone-complete chain. It reads/writes the shared context file at \`/tmp/milestone-complete-context.json\`.

**Read:** Call \`readMilestoneCompleteContext()\` from \`src/skills/__schemas/milestone-complete-context.schemas.ts\`. If \`success: false\`, ABORT immediately — do not proceed with stale or missing context.

**Write:** Call \`writeMilestoneCompleteContext({ milestone_learn: { ... } })\` to populate the \`milestone_learn\` section.

## Vault Resolution

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=\${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

## Process

### Step 0.1: Check for Unextracted Session Learnings

Recall session context from MuninnDB to find candidate learnings:

\`\`\`
mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "current session context and unextracted findings")
\`\`\`

### Step 0.2: Invoke lu-learner

If candidate learnings exist, spawn lu-learner agent for pattern/decision/pitfall extraction:

\`\`\`
Task(
  prompt: """
<learning_context>
Extract patterns, decisions, and pitfalls from the current milestone session.
Review all session findings and candidate learnings.
Store validated learnings in MuninnDB.
</learning_context>
""",
  subagent_type: "lu-learner",
  description: "Final learning extraction for milestone completion"
)
\`\`\`

### Step 0.3: Review Milestone-Specific Insights

Review milestone-specific insights in MuninnDB:
- Patterns validated multiple times -> bump to High confidence via \`mcp__muninn__muninn_evolve\`
- Decisions that held throughout milestone -> mark as Established
- Pitfalls that were successfully avoided -> note as Validated

### Step 0.4: Write to Context File

\`\`\`typescript
import { writeMilestoneCompleteContext } from "src/skills/__schemas/milestone-complete-context.schemas";

await writeMilestoneCompleteContext({
  milestone_learn: {
    learnings_extracted: true,
    engrams_captured: engramsCount,
    patterns_validated: patternsCount,
    decisions_established: decisionsCount,
    pitfalls_validated: pitfallsCount,
  },
});
\`\`\`

## Output

On success, the context file will contain:

\`\`\`json
{
  "context_version": 1,
  "milestone_learn": {
    "learnings_extracted": true,
    "engrams_captured": 5,
    "patterns_validated": 2,
    "decisions_established": 1,
    "pitfalls_validated": 1
  }
}
\`\`\`

## Error Handling

- **MuninnDB recall failure:** Log warning and continue with zero learnings. Learning extraction is best-effort.
- **lu-learner spawn failure:** Log warning, set \`learnings_extracted: false\`, write to context file, and return. Do not ABORT — the orchestrator can proceed without learnings.
- **Context file read failure:** ABORT immediately.

## Constraints

- Write results to context file via \`writeMilestoneCompleteContext()\`
- Use REPO_VAULT for session/project-scoped MuninnDB operations
- Use DEFAULT_VAULT for cross-cutting patterns/pitfalls
</main>`,
      order: 1,
    },
  ],
};

export const milestoneLearnSkill = createSkill(milestoneLearnConfig);
