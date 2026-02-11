/**
 * lu Skill - Unified entry point for Luca framework. Handles cognitive pre-flight, complexity routing, and workflow orchestration. Use for any development task.
 */
import { BaseSkillImpl } from '../base/base-skill';
import { SkillConfig } from '../types/skill.types';

// Define the lu skill configuration
const luConfig: SkillConfig = {
  frontmatter: {
    name: 'lu',
    description: `Unified entry point for Luca framework. Handles cognitive pre-flight, complexity routing, and workflow orchestration. Use for any development task.`,
    'disable-model-invocation': true,
  },
  sections: [
    {
      title: 'main',
      content: `<main>
# Luca - Unified Entry Point

The single entry point for all Luca workflows. Handles git context setup, cognitive pre-flight, complexity classification, and intelligent routing to the appropriate handler.

**Arguments:** \`<task-description | Jira-URL | [TICKET-ID]> [--force-complex] [--skip-memory] [--skip-branch]\`

> **Note:** Replace \`[TICKET-ID]\` with your project's configured ticket pattern (e.g., \`PROJ-123\`, \`PT-123\`, or your custom \`ticketPattern\` from \`.planning/config.json\`). Default pattern: \`[A-Z]+-\d+\`


</main>

<sub-agent_delegation_requirements>
## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- \`lu-verifier\` - Verifies goals achieved after execution
- \`lu-learner\` - Extracts and stores learnings after verification

**DO NOT** attempt to do verification or learning capture yourself. Spawn the appropriate agent.

**Reference:** See \`.cursor/luca/references/task-directive.md\` for Task() syntax patterns.

### Model Resolution

Resolve models before spawning agents:

\`\`\`bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space]]*:[[:space]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
\`\`\`

| Agent          | quality | balanced | budget |
| -------------- | ------- | -------- | ------ |
| lu-verifier | sonnet  | sonnet   | haiku  |
| lu-learner  | sonnet  | haiku    | haiku  |
| lu-planner  | opus    | opus     | sonnet |
| lu-executor | opus    | sonnet   | sonnet |

> **Current Limitation:** Cursor's Task tool only supports \`model="fast"\` or inheriting from parent. The table above is preserved for future compatibility.

**Current model variable values:**

\`\`
# Lightweight agents → use "fast"
learner_model = "fast"

# Reasoning-intensive agents → omit (inherit from parent)
verifier_model = (omit)
planner_model = (omit)
executor_model = (omit)
\`

</sub-agent_delegation_requirements>

<workflow>
## Workflow

\`\`
User Request
    │
    ▼
┌──────────────────────┐
│  0. Git Context      │
│     Setup            │
│  (Jira → Issue →     │
│   Branch)            │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  1. Cognitive        │
│     Pre-Flight       │
│  (lu-cognition)   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  2. Complexity       │
│     Classification   │
│  (lu-router)      │
└──────────┬───────────┘
           │
    ┌──────┴──────┬──────────┐
    │             │          │
    ▼             ▼          ▼
┌────────┐  ┌────────┐  ┌────────────┐
│TRIVIAL │  │MODERATE│  │  COMPLEX   │
│Direct  │  │Quick   │  │Full        │
│Execute │  │Plan    │  │Pipeline    │
└───┬────┘  └───┬────┘  └─────┬──────┘
    │           │             │
    └─────┬─────┴─────────────┘
          │
          ▼
┌──────────────────────┐
│  3. Always Verify    │
│  (lu-verifier)    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  4. Learning         │
│     Capture          │
│  (lu-learner)     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  5. Commit & PR      │
│     (if on feature   │
│      branch)         │
└──────────────────────┘
\`

</workflow>`,
      order: 1
    }
  ]
};

export class LuSkill extends BaseSkillImpl {
  constructor() {
    super(luConfig);
  }
}
