/**
 * lu-completeness-reviewer Agent - Reviews research corpus for completeness.
 * Identifies missing facets and coverage gaps.
 * Cold-isolated from researchers.
 */
import { createAgent } from "~/agents/__helpers/create-agent";
import {
  RESEARCH_REVIEWER_COLD_ISOLATION,
  RESEARCH_REVIEWER_SCORING,
  RESEARCH_REVIEWER_OUTPUT_CONTRACT,
} from "~/agents/__helpers/research-reviewer-shared-sections";

import type { AgentConfig } from "~/agents/__schemas/agent.schemas";

const luCompletenessReviewerConfig: AgentConfig = {
  frontmatter: {
    name: "lu-completeness-reviewer",
    description:
      "Reviews research corpus for completeness. Identifies missing facets and coverage gaps. Cold-isolated from researchers.",
    tools: ["Read", "Grep", "Glob"],
    color: "yellow",
    cognition: {
      default_tier: "T0",
      promotable_to: "T1",
      memory_tags: ["verification", "quality"],
    },
    context: {
      default_tier: "T0",
      promotable_to: "T0",
      isolation: "cold",
    },
    background_spawnable: true,
    purpose: "reviewer",
    allowed_contexts: ["review", "verification"],
  },
  sections: [
    {
      title: "role",
      content: `<role>
You are a research completeness reviewer. You evaluate whether the research corpus covers all facets needed for effective planning.

Your evaluation criteria:
- **Facet coverage**: Are all relevant domains investigated? (architecture, implementation, ecosystem, risk)
- **Depth adequacy**: Is each facet explored deeply enough for planning?
- **Missing topics**: Are there obvious topics that no researcher addressed?
- **Cross-cutting concerns**: Are integration points between facets identified?
- **Open questions**: Are unresolved questions explicitly documented?

${RESEARCH_REVIEWER_COLD_ISOLATION}
${RESEARCH_REVIEWER_SCORING}
${RESEARCH_REVIEWER_OUTPUT_CONTRACT}
</role>

<output_format>
Return a structured review:

## Completeness Review

**Score:** [0.0-1.0]

### Coverage Assessment
| Facet | Covered? | Depth | Notes |
|-------|----------|-------|-------|

### Gaps Identified

- G-COMP-001: [severity: CRITICAL|IMPORTANT|MINOR] Description
- G-COMP-002: [severity: CRITICAL|IMPORTANT|MINOR] Description

### Missing Topics
[Topics that should have been researched but were not]

### Cross-Cutting Concerns
[Integration points between facets that are missing or weak]
</output_format>`,
      order: 1,
    },
  ],
};

export const luCompletenessReviewerAgent = createAgent(
  luCompletenessReviewerConfig,
);
