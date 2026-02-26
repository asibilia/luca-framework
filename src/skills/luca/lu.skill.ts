/**
 * lu Skill - Unified entry point for all Luca workflows with cognitive pre-flight and complexity routing.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the lu skill configuration
const luSkillConfig: SkillConfig = {
  frontmatter: {
    name: "lu",
    description:
      "Unified entry point for all Luca workflows with cognitive pre-flight and complexity routing.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `The single entry point for all Luca workflows. This is a **routing skill** — it classifies the task and invokes the appropriate sub-skill via the Skill tool.

**Arguments:** \`<task-description | Jira-URL | [TICKET-ID]> [--complexity=TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL] [--force-complex] [--skip-memory] [--skip-branch]\`

> **Note:** Replace \`[TICKET-ID]\` with your project's configured ticket pattern (e.g., \`PROJ-123\`, \`PT-123\`, or your custom \`ticketPattern\` from \`.planning/config.json\`). Default pattern: \`[A-Z]+-\\d+\`

**CRITICAL:** You are a router. Do NOT execute workflow steps yourself. Invoke sub-skills and sub-agents as described below.
`,
    },
    {
      title: "sub-agent_delegation_requirements",
      content: `This skill uses TWO delegation mechanisms:

**Skill tool** — for workflow sub-skills (phase-discuss, phase-plan, phase-execute, etc.)

- Invoke: \`Skill(skill: "skill-name", args: "...")\`
- Each invoked skill loads its own SKILL.md with full instructions
- Users see visual skill headers for each step

**Task tool** — for specialized agents (lu-cognition, lu-router, lu-verifier, lu-learner)

- Invoke: \`Task(agent: "agent-name", prompt: "...")\`
- Agents run as sub-agents within the current context

### Model Resolution

Resolve models before spawning agents:

\`\`\`bash
MODEL_PROFILE=\$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"\$' | tr -d '"' || echo "balanced")
\`\`\`

| Agent       | quality | balanced | budget |
| ----------- | ------- | -------- | ------ |
| lu-verifier | sonnet  | sonnet   | haiku  |
| lu-learner  | sonnet  | haiku    | haiku  |
| lu-planner  | opus    | opus     | sonnet |
| lu-executor | opus    | sonnet   | sonnet |

**Current model values:**

- Lightweight agents (lu-learner): \`model="fast"\`
- Reasoning-intensive agents (lu-verifier, lu-planner, lu-executor): omit model (inherit from parent)
`,
      order: 2,
    },
    {
      title: "workflow",
      content: `Execute these steps in order. Each step is either a Task tool call (for agents) or a Skill tool call (for sub-skills).

### Step 0: Parse Request

Determine:

- **Task type**: New project, phase work, PR review, debug, quick task, or session planning
- **Complexity override**: Check for \`--complexity=<level>\` or \`--force-complex\` flags
- **Git context**: Check for Jira URL, ticket ID, or plain task description
- **Skip flags**: \`--skip-memory\`, \`--skip-branch\`

### Step 1: Git Context Setup (if applicable)

If the request includes a Jira ticket or URL and \`--skip-branch\` is NOT set:

1. Check if a GitHub issue exists for this ticket
2. If not, invoke: \`Skill(skill: "jira-issue", args: "<ticket-id>")\`
3. Create or switch to the feature branch: \`Skill(skill: "git-feature", args: "<ticket-id>")\`

If already on a feature branch or \`--skip-branch\` is set, skip this step.

### Step 2: Cognitive Pre-Flight (if applicable)

Unless \`--skip-memory\` is set, spawn the lu-cognition agent:

\`\`\`
Task(agent: "lu-cognition", prompt: "Run cognitive pre-flight for task: <task-description>. Load BRAIN.md, recall relevant MEMORY.md entries via memory bridge (bun run src/memory/bridge.ts read-memory --tags=<relevant-tags> --limit=10), initialize WORKING.md via bridge (bun run src/memory/bridge.ts clear-working).")
\`\`\`

### Step 3: Complexity Classification

If \`--complexity=<level>\` was passed, use that level directly. Write it via the bridge:

\`\`\`bash
# Primary: Set complexity via bridge (updates state machine + STATE.md)
bun run packages/luca-state/src/bridge.ts set-field --field=complexity --value="<LEVEL>" 2>/dev/null || true
bun run packages/luca-state/src/bridge.ts snapshot 2>/dev/null || true
# Fallback: Update STATE.md directly if bridge unavailable
\`\`\`

If \`--force-complex\` was passed, use COMPLEX.

Otherwise, spawn lu-router to classify:

\`\`\`
Task(agent: "lu-router", prompt: "Classify complexity for task: <task-description>. Output: TRIVIAL, SIMPLE, MODERATE, COMPLEX, or CRITICAL.")
\`\`\`

### Step 4: Route to Handler (via Skill tool)

Based on the classified complexity and task type, invoke the appropriate skill:

**New project initialization:**
\`\`\`
Skill(skill: "project-new", args: "<project description>")
\`\`\`

**New milestone:**
\`\`\`
Skill(skill: "milestone-new", args: "<milestone description>")
\`\`\`

**TRIVIAL / SIMPLE tasks:**
\`\`\`
Skill(skill: "quick", args: "<task-description>")
\`\`\`

**MODERATE tasks (single phase):**
1. \`Skill(skill: "phase-discuss", args: "<phase-number>")\`
2. \`Skill(skill: "phase-plan", args: "<phase-number>")\`
3. \`Skill(skill: "phase-execute", args: "<phase-number>")\`

**COMPLEX / CRITICAL tasks (full pipeline):**
1. \`Skill(skill: "phase-research", args: "<phase-number>")\` — if domain is unfamiliar
2. \`Skill(skill: "phase-discuss", args: "<phase-number>")\`
3. \`Skill(skill: "phase-plan", args: "<phase-number>")\`
4. \`Skill(skill: "phase-execute", args: "<phase-number>")\`

**PR review work:**
\`\`\`
Skill(skill: "pr-address", args: "<pr-url>")
\`\`\`

**Debug workflow:**
\`\`\`
Skill(skill: "debug", args: "<bug-description>")
\`\`\`

**Session planning:**
\`\`\`
Skill(skill: "session-plan")
\`\`\`

**Progress check:**
\`\`\`
Skill(skill: "progress")
\`\`\`

**Autopilot mode (autonomous execution):**
If task description is "autopilot" or \`--autopilot\` flag is passed, route to the autopilot orchestrator which drives backlog scan, roadmap revision, and multi-phase execution autonomously:
\`\`\`
Skill(skill: "autopilot", args: "<flags>")
\`\`\`
Supported flags: \`--oversight=flagged|milestone|phase|full-auto\`, \`--skip-backlog\`, \`--max-phases=N\`, \`--dry-run\`

### Step 5: Verification (always runs)

After the handler skill completes, spawn lu-verifier:

\`\`\`
Task(agent: "lu-verifier", prompt: "Verify the work completed for task: <task-description>. Check against acceptance criteria and requirements.")
\`\`\`

### Step 6: Learning Capture (complexity-gated)

For MODERATE+ complexity, spawn lu-learner:

\`\`\`
Task(agent: "lu-learner", model: "fast", prompt: "Extract learnings from completed task: <task-description>. Read working memory via bridge (bun run src/memory/bridge.ts read-working). Capture patterns, decisions, and pitfalls to MEMORY.md. Clear working memory via bridge after extraction (bun run src/memory/bridge.ts clear-working).")
\`\`\`

For TRIVIAL/SIMPLE: Skip learning capture.

### Step 7: Commit (if on feature branch)

If on a feature branch with uncommitted changes:
\`\`\`
Skill(skill: "git-commit", args: "--no-push")
\`\`\`

### Complexity Override

If \`--complexity=<level>\` is passed:
1. Skip lu-router classification
2. Use the specified level directly
3. Look up gated steps from the complexity matrix in config.json
4. Persist via bridge: \`bun run packages/luca-state/src/bridge.ts set-field --field=complexity --value="<LEVEL>" 2>/dev/null || true\`

If \`--force-complex\` is passed (backward compatibility):
- Equivalent to \`--complexity=COMPLEX\`
`,
      order: 3,
    },
    // Additional sections would continue here...
  ],
};

export const luSkill = createSkill(luSkillConfig);
