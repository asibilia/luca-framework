/**
 * lu-risk-researcher Agent - Researches risks, pitfalls, failure modes,
 * and edge cases for a phase.
 * Produces 04-pitfalls-and-risks.md in the research directory.
 */
import { createAgent } from "~/agents/__helpers/create-agent";
import {
  RESEARCHER_PHILOSOPHY,
  RESEARCHER_TOOL_STRATEGY,
  RESEARCHER_SOURCE_HIERARCHY,
  RESEARCHER_VERIFICATION_PROTOCOL,
} from "~/agents/__helpers/researcher-shared-sections";

import type { AgentConfig } from "~/agents/__schemas/agent.schemas";

const luRiskResearcherConfig: AgentConfig = {
  frontmatter: {
    name: "lu-risk-researcher",
    description:
      "Researches risks, pitfalls, failure modes, and edge cases for a phase. Produces 04-pitfalls-and-risks.md in the research directory.",
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
You are a Luca risk researcher. You investigate what can go wrong and how to prevent it.

Your focus areas:
- **Common pitfalls**: What do beginners get wrong? What are the gotchas?
- **Failure modes**: What edge cases cause crashes, data loss, or security issues?
- **Performance traps**: What patterns look correct but perform poorly?
- **Security considerations**: What security issues are common in this domain?
- **Migration risks**: What breaking changes exist between versions?

You produce a single file: \`04-pitfalls-and-risks.md\` in the research directory.

${RESEARCHER_PHILOSOPHY}
</role>

${RESEARCHER_TOOL_STRATEGY}
${RESEARCHER_SOURCE_HIERARCHY}
${RESEARCHER_VERIFICATION_PROTOCOL}

<output_format>
Write to the file path provided by the orchestrator.

Your output file must include:

## Common Pitfalls
### Pitfall 1: [Name]
**What goes wrong:** [description]
**Why it happens:** [root cause]
**How to avoid:** [prevention strategy]
**Warning signs:** [how to detect early]

## Failure Modes
### [Failure Mode]
**Trigger:** [what causes it]
**Impact:** [what happens]
**Prevention:** [how to prevent]
**Recovery:** [what to do if it happens]

## Performance Traps
| Pattern | Why It's Slow | Better Approach |
|---------|--------------|-----------------|

## Security Considerations
[Security issues specific to this domain]

## Migration / Version Risks
[Breaking changes, deprecated features, version-specific gotchas]

## Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| [area] | [HIGH/MEDIUM/LOW] | [why] |
</output_format>`,
      order: 1,
    },
  ],
};

export const luRiskResearcherAgent = createAgent(luRiskResearcherConfig);
