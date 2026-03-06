/**
 * post-init-tour Skill - Guide new users through Luca's core concepts after project initialization.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

/**
 * Tour step definitions for the post-init interactive tour.
 *
 * Each step introduces a core Luca concept with a title and content
 * that the agent presents sequentially to the user.
 */
export const tourSteps = [
  {
    title: "BRAIN.md -- Project Identity",
    content:
      "BRAIN.md captures your project's personality: stack, architecture patterns, code conventions, and development preferences. It is loaded at the start of every session so the AI always knows your project's context.",
  },
  {
    title: "MEMORY.md -- Long-Term Learning",
    content:
      "MEMORY.md stores persistent learnings across sessions: validated patterns, past decisions with rationale, known pitfalls, and preferences. The AI selectively recalls relevant entries before major operations.",
  },
  {
    title: "Skills -- Interactive Workflows",
    content:
      "Skills are user-invocable workflows triggered by /commands (e.g., /phase-plan, /phase-execute, /debug). They handle multi-step reasoning and require judgment. Run /help to see all available skills.",
  },
  {
    title: "Agents -- Specialized AI Workers",
    content:
      "Agents are specialized sub-agents that handle focused tasks: lu-router classifies complexity, lu-executor runs code changes, lu-verifier validates results, and reviewers audit code quality. They are spawned automatically during workflow execution.",
  },
  {
    title: "Phases -- Structured Development",
    content:
      "Work is organized into phases listed in ROADMAP.md. Each phase has a plan (PLAN.md) with waves of tasks. Use /phase-plan to create plans and /phase-execute to run them. Phases keep work focused and context-efficient.",
  },
  {
    title: "Rules -- Automatic Enforcement",
    content:
      "Rules are always-on guidelines loaded automatically based on file context. They enforce conventions like kebab-case naming, Bun preference, and schema-first parsing without requiring user action.",
  },
  {
    title: "Hooks -- Deterministic Quality Gates",
    content:
      "Hooks run automatically on events like file edits and commits. They handle type-checking, formatting, and pre-commit validation. Unlike skills, hooks are fast, deterministic, and cannot be skipped.",
  },
  {
    title: "Getting Started",
    content:
      "Your project is initialized. Common next steps:\n- /phase-plan 1 -- Create a plan for your first phase\n- /progress -- Check project status\n- /help -- See all available commands\n- /config-settings -- Configure workflow preferences",
  },
] as const;

const postInitTourConfig: SkillConfig = {
  frontmatter: {
    name: "post-init-tour",
    description:
      "Guide new users through Luca's core concepts after project initialization.",
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Post-Init Interactive Tour

Walk the user through Luca's core concepts after /project-new completes.

## Behavior

1. Welcome the user and explain this is a quick orientation
2. Present each tour step below in order, pausing briefly between steps
3. For each step, display the **title** as a heading and the **content** as explanation
4. After all steps, ask if the user has questions or wants to start planning

## Tour Steps

${tourSteps
  .map(
    (step, i) => `### Step ${i + 1}: ${step.title}

${step.content}`,
  )
  .join("\n\n")}

## Presentation Guidelines

- Keep explanations concise and practical
- Use the tour step content as-is; do not embellish
- After presenting all steps, suggest /phase-plan 1 as the natural next action
- If the user interrupts with a question, answer it and resume the tour
</main>`,
      order: 1,
    },
  ],
};

export const postInitTourSkill = createSkill(postInitTourConfig);
