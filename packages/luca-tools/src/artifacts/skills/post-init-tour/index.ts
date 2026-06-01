/**
 * post-init-tour skill — Guide new users through Luca's core concepts after project initialization.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/post-init-tour/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Post-Init Interactive Tour

Walk the user through Luca's core concepts after /project-new completes.

## Behavior

1. Welcome the user and explain this is a quick orientation
2. Present each tour step below in order, pausing briefly between steps
3. For each step, display the **title** as a heading and the **content** as explanation
4. After all steps, ask if the user has questions or wants to start planning

## Tour Steps

### Step 1: MuninnDB -- Project Memory

MuninnDB is Luca's memory system. It stores your project's identity (stack, architecture, conventions), long-term learnings (patterns, decisions, pitfalls), and session context. All memory is semantically searchable with entity graphs and temporal decay. Run /seed-memory to populate it from existing project knowledge.

### Step 2: Skills -- Interactive Workflows

Skills are user-invocable workflows triggered by /commands (e.g., /phase-plan, /phase-execute, /debug). They handle multi-step reasoning and require judgment. Run /help to see all available skills.

### Step 3: Agents -- Specialized AI Workers

Agents are specialized sub-agents that handle focused tasks: the researcher gathers context, executor runs code changes, verifier validates results, and reviewers audit code quality. They are spawned automatically during workflow execution. (Complexity classification and cognitive pre-flight are handled inline by the orchestrator, not separate agents.)

### Step 4: Phases -- Structured Development

Work is organized into phases listed in \`.luca/roadmap.md\`. Each phase has a plan (\`plan.md\`) with waves of tasks. Use /phase-plan to create plans and /phase-execute to run them. Phases keep work focused and context-efficient.

### Step 5: Rules -- Automatic Enforcement

Rules are always-on guidelines loaded automatically based on file context. They enforce conventions like kebab-case naming, Bun preference, and schema-first parsing without requiring user action.

### Step 6: Hooks -- Deterministic Quality Gates

Hooks run automatically on events like file edits and commits. They handle type-checking, formatting, and pre-commit validation. Unlike skills, hooks are fast, deterministic, and cannot be skipped.

### Step 7: Getting Started

Your project is initialized. Common next steps:
- /phase-plan 1 -- Create a plan for your first phase
- /progress -- Check project status
- /help -- See all available commands
- /config-settings -- Configure workflow preferences

## Presentation Guidelines

- Keep explanations concise and practical
- Use the tour step content as-is; do not embellish
- After presenting all steps, suggest /phase-plan 1 as the natural next action
- If the user interrupts with a question, answer it and resume the tour
</main>
`

export const postInitTourSkill = defineSkill({
    name: "post-init-tour",
    description: "Guide new users through Luca's core concepts after project initialization.",
    body: BODY,
})
