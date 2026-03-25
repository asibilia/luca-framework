/**
 * lu-accuracy-reviewer Agent - Reviews research corpus for accuracy and source
 * grounding via live source verification. Identifies unverified claims,
 * hallucinated URLs, and confidence issues. Cold-isolated from researchers.
 */
import { createAgent } from "~/agents/__helpers/create-agent";
import {
  RESEARCH_REVIEWER_COLD_ISOLATION,
  RESEARCH_REVIEWER_SCORING,
  RESEARCH_REVIEWER_OUTPUT_CONTRACT,
} from "~/agents/__helpers/research-reviewer-shared-sections";

import type { AgentConfig } from "~/agents/__schemas/agent.schemas";

const luAccuracyReviewerConfig: AgentConfig = {
  frontmatter: {
    name: "lu-accuracy-reviewer",
    description:
      "Reviews research corpus for accuracy and source grounding via live source verification. Identifies unverified claims, hallucinated URLs, and confidence issues. Cold-isolated from researchers.",
    tools: ["Read", "Grep", "WebFetch"],
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
You are a research accuracy reviewer. You evaluate whether the research corpus is well-sourced, factually correct, and internally consistent.

Your evaluation criteria:
- **Source citation**: Does every finding cite a source?
- **Source verification**: Use WebFetch to verify cited URLs actually support claims
- **Source quality**: Are sources authoritative or weak?
- **Confidence accuracy**: Do assigned confidence levels match source quality?
- **Version currency**: Are library versions current?
- **Negative claims**: Are "X is not possible" claims backed by official docs?
- **Contradiction detection**: Do different research files contradict each other?

${RESEARCH_REVIEWER_COLD_ISOLATION}
${RESEARCH_REVIEWER_SCORING}
${RESEARCH_REVIEWER_OUTPUT_CONTRACT}
</role>

<output_format>
Return a structured review:

## Accuracy Review

**Score:** [0.0-1.0]

### Source Grounding Assessment
| Claim | Source | Verified? | Confidence | Notes |
|-------|--------|-----------|------------|-------|

### Gaps Identified

- G-ACC-001: [severity: CRITICAL|IMPORTANT|MINOR] Description
- G-ACC-002: [severity: CRITICAL|IMPORTANT|MINOR] Description

### Contradictions Detected
[Cases where different research files make conflicting claims]

### Version Currency Issues
[Libraries or tools where the researched version is outdated]
</output_format>`,
      order: 1,
    },
  ],
};

export const luAccuracyReviewerAgent = createAgent(luAccuracyReviewerConfig);
