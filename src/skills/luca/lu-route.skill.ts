/**
 * lu-route Sub-Skill — Parse request, load git context, run cognition, classify complexity.
 *
 * Extracts Steps 0-3 from the monolithic lu skill.
 *
 * **Responsibility:** Parse the user request and CLI flags, load git context
 * (branch, status, commits), optionally spawn lu-cognition for cognitive
 * pre-flight, and spawn lu-router for complexity classification. Write
 * results to the shared context file.
 *
 * **Input:** User request string with optional flags (from Skill() args)
 * **Output:** Populated `lu_route` section in `/tmp/lu-context.json`
 *
 * This skill spawns sub-agents via Task() for lu-cognition and lu-router.
 *
 * @see .planning/phases/224-anti-skip-rollout/04-PLAN.md Task 3
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const luRouteConfig: SkillConfig = {
  frontmatter: {
    name: "lu-route",
    description:
      "Parse request, load git context, run cognitive pre-flight, and classify complexity for the lu sub-skill chain.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# lu-route — Parse, Context, Cognition, Classification

Parse the user request, load git context, optionally run cognitive pre-flight, and classify complexity. Write results to the shared context file.

## Context File Protocol

This sub-skill is part of the lu chain. It reads/writes the shared context file at \`/tmp/lu-context.json\`.

**Read:** Call \`readLuContext()\` from \`src/skills/__schemas/lu-context.schemas.ts\`. If \`success: false\`, ABORT immediately — do not proceed with stale or missing context.

**Write:** Call \`writeLuContext({ lu_route: { ... } })\` to populate the \`lu_route\` section.

## Process

### Step 0: Parse User Request

Determine from the user request and CLI args:

- **Task type**: New project, phase work, PR review, debug, quick task, or session planning
- **Complexity override**: Check for \`--complexity=<level>\` or \`--force-complex\` flags
- **Git context**: Check for Jira URL, ticket ID, or plain task description
- **Skip flags**: \`--skip-memory\`, \`--skip-branch\`, \`--skip-backlog\`
- **Autonomous pipeline flags**: \`--oversight\`, \`--max-phases\`, \`--no-swarm\`, \`--dry-run\`
- **\`--ask\`**: Shorthand for \`--oversight=phase\` (human-in-the-loop control)

### Step 1: Load Git Context

\`\`\`bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_STATUS=$(git status --porcelain 2>/dev/null || echo "")
RECENT_COMMITS=$(git log --oneline -5 2>/dev/null || echo "")
\`\`\`

If the request includes a Jira ticket or URL and \`--skip-branch\` is NOT set:

1. Check if a GitHub issue exists for this ticket
2. If not, invoke: \`Skill(skill: "jira-issue", args: "<ticket-id>")\`
3. Create or switch to the feature branch: \`Skill(skill: "git-feature", args: "<ticket-id>")\`

If already on a feature branch or \`--skip-branch\` is set, skip this step.

### Step 2: Cognitive Pre-Flight (if applicable)

Unless \`--skip-memory\` is set, spawn the lu-cognition agent:

\`\`\`
Task(agent: "lu-cognition", prompt: "**Recipient:** lu orchestrator (report findings back to this orchestrator)\\n\\nRun cognitive pre-flight for task: <task-description>. Load project identity via mcp__muninn__muninn_recall_tree(vault: REPO_VAULT, id: 'brain:project-identity'). Recall relevant patterns via mcp__muninn__muninn_recall(vault: REPO_VAULT, context: 'relevant patterns for <task-description>'). Clear previous session context via mcp__muninn__muninn_forget(vault: REPO_VAULT, id: 'session:*'). REPO_VAULT=<resolved value from .planning/config.json muninn.vault>.")
\`\`\`

**SKIP_COGNITION** is handled internally: if \`--skip-memory\` is set, skip the Task() call and set \`cognition_ran: false\` in the output.

### Step 3: Complexity Classification

If \`--complexity=<level>\` was passed, use that level directly. Write it via the bridge:

\`\`\`bash
luca-bridge set-field --field=complexity --value="<LEVEL>" 2>/dev/null || true
luca-bridge snapshot 2>/dev/null || true
\`\`\`

If \`--force-complex\` was passed, use COMPLEX.

Otherwise, spawn lu-router to classify:

\`\`\`
Task(agent: "lu-router", prompt: "**Recipient:** lu orchestrator (report classification back to this orchestrator)\\n\\nClassify complexity for task: <task-description>. Output: TRIVIAL, SIMPLE, MODERATE, COMPLEX, or CRITICAL.")
\`\`\`

### Step 4: Determine Routing Decision

Based on the classified complexity and task type:

- **New project initialization** -> routing_decision: "project-new"
- **New milestone** -> routing_decision: "milestone-new"
- **Phase/milestone work** -> routing_decision: "phase-execute" (DEFAULT for phase work)
- **Ad-hoc / Quick task** (TRIVIAL/SIMPLE, not in roadmap, 1-2 files) -> routing_decision: "quick"
- **PR review work** -> routing_decision: "pr-address"
- **Debug workflow** -> routing_decision: "debug"
- **Session planning** -> routing_decision: "session-plan"
- **Progress check** -> routing_decision: "progress"

Route to \`quick\` ONLY if ALL of these conditions are true:
- Task is TRIVIAL or SIMPLE complexity
- Task does NOT appear in \`.planning/ROADMAP.md\` or \`.planning/todos/pending/\`
- Task does NOT require creating new files (only modifications to 1-2 existing files)
- Task is a one-off fix, rename, or config change — NOT a feature

If ANY of these conditions is false, route to the full autonomous pipeline.

### Step 5: Write Results to Context File

\`\`\`typescript
writeLuContext({
  lu_route: {
    request_parsed: true,
    git_context_loaded: true,
    cognition_ran: <true if lu-cognition ran, false if --skip-memory>,
    complexity_level: "<classified level>",
    routing_decision: "<routing decision>",
  },
});
\`\`\`

## Completion

After writing results, return to the lu orchestrator. The orchestrator will write \`current_state: "routed"\` and invoke lu-configure next.
</main>`,
      order: 1,
    },
  ],
};

export const luRouteSkill = createSkill(luRouteConfig);
