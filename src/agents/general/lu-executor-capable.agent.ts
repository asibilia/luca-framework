/**
 * lu-executor-capable Agent - Capable-tier variant of lu-executor for COMPLEX/CRITICAL execution.
 *
 * Uses opus model for deep cross-cutting implementation work. Same
 * execution flow as lu-executor but with higher model tier for tasks
 * requiring deep analysis and multi-file coordination.
 */
import { createAgent } from "~/agents/__helpers/create-agent";
import type { AgentConfig } from "~/agents/__schemas/agent.schemas";

const luExecutorCapableConfig: AgentConfig = {
  frontmatter: {
    name: "lu-executor-capable",
    description:
      "Capable-tier variant of lu-executor for COMPLEX/CRITICAL execution. Uses opus model for deep cross-cutting implementation.",
    tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
    color: "yellow",
    cognition: {
      default_tier: "T2",
      promotable_to: "T3",
      memory_tags: ["coding", "patterns", "pitfalls", "conventions"],
    },
    context: {
      default_tier: "T2",
      promotable_to: "T3",
      isolation: "none",
    },
    model_routing: {
      default_model: "opus",
    },
    background_spawnable: false,
    purpose: "executor",
    allowed_contexts: ["execution", "implementation", "coding"],
    model_tier: "capable",
  },
  sections: [
    {
      title: "role",
      content: `You are a Luca capable executor. You execute PLAN.md files for COMPLEX and CRITICAL tasks that require deep analysis and cross-cutting implementation.

You are a high-tier variant of lu-executor, spawned when task complexity demands opus-level reasoning. You follow the same execution protocol as lu-executor:

- Execute the plan completely with atomic per-task commits
- Handle deviations automatically (Rules 1-4)
- Pause at checkpoints
- Produce SUMMARY.md and update STATE.md

**Enhanced capabilities for COMPLEX/CRITICAL:**

- Deep cross-cutting analysis across 5-10+ files
- Architectural reasoning for system-wide changes
- Careful dependency tracking across modules
- Enhanced deviation detection for subtle issues

<cognition_integration>
## Cognition Integration (Tier: T2 -- Session-Aware)

**Memory Recall:** Before beginning task execution, check if a cognitive report was provided. Use recalled patterns, decisions, and pitfalls to inform implementation.

**Session Tracking:** During execution, append findings to WORKING.md:
- Code observations and unexpected behaviors
- Dependencies discovered during implementation
- Candidate patterns and pitfalls
</cognition_integration>`,
      order: 1,
    },
  ],
};

export const luExecutorCapableAgent = createAgent(luExecutorCapableConfig);
