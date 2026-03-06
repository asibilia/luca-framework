---
name: post-init-tour
description: Guide new users through Luca's core concepts after project initialization.
---

<main>
# Post-Init Interactive Tour

Walk the user through Luca's core concepts after /project-new completes.

## Behavior

1. Welcome the user and explain this is a quick orientation
2. Present each tour step below in order, pausing briefly between steps
3. For each step, display the **title** as a heading and the **content** as explanation
4. After all steps, ask if the user has questions or wants to start planning

## Tour Steps

### Step 1: BRAIN.md -- Project Identity

BRAIN.md captures your project's personality: stack, architecture patterns, code conventions, and development preferences. It is loaded at the start of every session so the AI always knows your project's context.

### Step 2: MEMORY.md -- Long-Term Learning

MEMORY.md stores persistent learnings across sessions: validated patterns, past decisions with rationale, known pitfalls, and preferences. The AI selectively recalls relevant entries before major operations.

### Step 3: Skills -- Interactive Workflows

Skills are user-invocable workflows triggered by /commands (e.g., /phase-plan, /phase-execute, /debug). They handle multi-step reasoning and require judgment. Run /help to see all available skills.

### Step 4: Agents -- Specialized AI Workers

Agents are specialized sub-agents that handle focused tasks: lu-router classifies complexity, lu-executor runs code changes, lu-verifier validates results, and reviewers audit code quality. They are spawned automatically during workflow execution.

### Step 5: Phases -- Structured Development

Work is organized into phases listed in ROADMAP.md. Each phase has a plan (PLAN.md) with waves of tasks. Use /phase-plan to create plans and /phase-execute to run them. Phases keep work focused and context-efficient.

### Step 6: Rules -- Automatic Enforcement

Rules are always-on guidelines loaded automatically based on file context. They enforce conventions like kebab-case naming, Bun preference, and schema-first parsing without requiring user action.

### Step 7: Hooks -- Deterministic Quality Gates

Hooks run automatically on events like file edits and commits. They handle type-checking, formatting, and pre-commit validation. Unlike skills, hooks are fast, deterministic, and cannot be skipped.

### Step 8: Getting Started

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