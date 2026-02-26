/**
 * rule-lu-workflow Skill - Luca cognitive memory system: BRAIN.md, MEMORY.md, WORKING.md workflow and quality curve.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the rule-lu-workflow skill configuration
const ruleLuWorkflowConfig: SkillConfig = {
  frontmatter: {
    name: "rule-lu-workflow",
    description: `Luca cognitive memory system: BRAIN.md, MEMORY.md, WORKING.md workflow and quality curve.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `Luca is a framework for agentic development, combining spec-driven development with cognitive memory systems and integrated git workflow. It solves context rot while enabling AI to learn from past experience.

## What's New in Luca

| Feature             | Description                                          |
| ------------------- | ---------------------------------------------------- |
| Entry Point         | Unified \`/lu\` with intelligent routing               |
| **Git Integration** | Jira → GitHub issue → Branch → PR                    |
| Memory              | BRAIN.md + MEMORY.md + WORKING.md                    |
| Verification        | Always runs (all complexity levels)                  |
| Learning            | Pattern/decision/pitfall capture                     |
| Pre-Flight          | Cognitive context loading                            |

## Philosophy

### Solo Developer + AI Workflow

- You are the visionary/product owner
- AI is the builder
- No teams, stakeholders, ceremonies, coordination overhead
- **NEW:** AI learns from past sessions

### Plans Are Prompts

PLAN.md is NOT a document that gets transformed into a prompt.
PLAN.md IS the prompt. It contains:

- Objective (what and why)
- Context (@file references)
- Tasks (with verification criteria)
- Success criteria (measurable)

### Quality Degradation Curve

| Context Usage | Quality   | AI's State              |
| ------------- | --------- | ----------------------- |
| 0-30%         | PEAK      | Thorough, comprehensive |
| 30-50%        | GOOD      | Confident, solid work   |
| 50-70%        | DEGRADING | Efficiency mode begins  |
| 70%+          | POOR      | Rushed, minimal         |

**The rule:** Stop BEFORE quality degrades. Plans should complete within ~50% context.

### Ship Fast + Learn

No enterprise process. No approval gates.
Plan → Execute → **Verify** → **Learn** → Repeat`,
      order: 1,
    },
    {
      title: "two-tier-memory-system",
      content: `## Two-Tier Memory System (NEW)

### BRAIN.md — Project Identity

Captures project personality, loaded at session start:

- Project identity (name, domain, purpose)
- Stack (languages, frameworks, databases)
- Architecture patterns
- Code conventions
- Development preferences

### MEMORY.md — Long-Term Learning

Persistent across sessions, selectively recalled:

- **Patterns**: Validated approaches that work
- **Decisions**: Past choices with rationale
- **Pitfalls**: Known issues to avoid
- **Preferences**: User/project preferences

### WORKING.md — Session Memory

Active during workflow, cleared after learning extraction:

- Current task context
- Immediate findings
- Hypotheses (for debugging)
- Candidate learnings`,
      order: 2,
    },
    {
      title: "cognitive-pre-flight",
      content: `## Cognitive Pre-Flight (NEW)

Before major operations, Luca runs cognitive pre-flight:

1. **Load BRAIN.md** — Project conventions
2. **Selective recall from MEMORY.md** — Relevant patterns, decisions, pitfalls
3. **Initialize WORKING.md** — Session context
4. **Generate intuition flags** — RISK, CAUTION, OPPORTUNITY, UNKNOWN`,
      order: 3,
    },
  ],
};

export const ruleLuWorkflowSkill = createSkill(ruleLuWorkflowConfig);
