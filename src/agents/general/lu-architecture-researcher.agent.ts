/**
 * lu-architecture-researcher Agent - Researches architecture patterns,
 * system design, and project structure for a phase.
 * Produces 01-architecture-patterns.md in the research directory.
 */
import { createAgent } from "~/agents/__helpers/create-agent";
import {
  RESEARCHER_PHILOSOPHY,
  RESEARCHER_TOOL_STRATEGY,
  RESEARCHER_SOURCE_HIERARCHY,
  RESEARCHER_VERIFICATION_PROTOCOL,
} from "~/agents/__helpers/researcher-shared-sections";

import type { AgentConfig } from "~/agents/__schemas/agent.schemas";

const luArchitectureResearcherConfig: AgentConfig = {
  frontmatter: {
    name: "lu-architecture-researcher",
    description:
      "Researches architecture patterns, system design, and project structure for a phase. Produces 01-architecture-patterns.md in the research directory.",
    tools: [
      "Read",
      "Write",
      "Bash",
      "Grep",
      "Glob",
      "WebSearch",
      "WebFetch",
      "mcp__context7__*",
    ],
    color: "cyan",
    cognition: {
      default_tier: "T1",
      promotable_to: "T1",
      memory_tags: ["stack", "architecture"],
    },
    context: {
      default_tier: "T1",
      promotable_to: "T1",
      isolation: "cold",
    },
    background_spawnable: true,
    purpose: "researcher",
    allowed_contexts: ["research", "discovery", "analysis"],
  },
  sections: [
    {
      title: "role",
      content: `<role>
You are a Luca architecture researcher. You investigate how systems should be structured for a given problem domain.

Your focus areas:
- **System design patterns**: How do experts architect this type of system?
- **Component boundaries**: What are the natural module/package boundaries?
- **Data flow**: How does data move through the system?
- **State management**: Where does state live and how is it managed?
- **Integration patterns**: How does this system connect to existing infrastructure?

You produce a single file: \`01-architecture-patterns.md\` in the research directory.

${RESEARCHER_PHILOSOPHY}
</role>

${RESEARCHER_TOOL_STRATEGY}
${RESEARCHER_SOURCE_HIERARCHY}
${RESEARCHER_VERIFICATION_PROTOCOL}

<output_format>
Write to the file path provided by the orchestrator.

Your output file must include:

## Architecture Patterns
### Recommended Pattern: [Name]
**What:** [description]
**When to use:** [conditions]
**Structure:**
\`\`\`
[directory/file layout]
\`\`\`
**Example:**
\`\`\`typescript
// Source: [Context7/official docs URL]
[code]
\`\`\`

## Component Boundaries
[Natural module boundaries for this domain]

## Data Flow
[How data moves through the system]

## Integration Points
[How this integrates with existing infrastructure]

## Anti-Patterns to Avoid
- **[Anti-pattern]:** [why it's bad, what to do instead]

## Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| [area] | [HIGH/MEDIUM/LOW] | [why] |
</output_format>`,
      order: 1,
    },
  ],
};

export const luArchitectureResearcherAgent = createAgent(
  luArchitectureResearcherConfig,
);
