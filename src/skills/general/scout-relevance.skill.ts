/**
 * scout-relevance Skill - Relevance gate for the scout pipeline that routes LOW-relevance articles to manual review.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const scoutRelevanceConfig: SkillConfig = {
  frontmatter: {
    name: "scout-relevance",
    description:
      "Assess article relevance to the Luca framework and route LOW-relevance articles to manual review.",
  },
  sections: [
    {
      title: "main",
      content: `# Scout Relevance Gate

Sub-skill for Step 2 of the scout per-article pipeline.

## Arguments

- slug: Article identifier
- digest_path: Path to the digest markdown file

## Process

\\\`\\\`\\\`bash
luca-bridge write-status --skill=scout-relevance --stage=ASSESSING 2>/dev/null || true
\\\`\\\`\\\`

1. Read the digest document at the provided path
2. Assess relevance to the Luca framework:
   - **HIGH**: Directly applicable — agentic development, LLM orchestration, developer tooling, memory systems, verification, step enforcement
   - **MEDIUM**: Potentially applicable — general LLM patterns, workflow automation, knowledge management, IDE extension patterns
   - **LOW**: Tangential — pure ML research, non-supported platforms, enterprise-only patterns, marketing content
3. Output the assessment in this exact format:

\\\`\\\`\\\`
RELEVANCE: HIGH|MEDIUM|LOW
RATIONALE: One paragraph explaining the score
KEY_MATCHES: [comma-separated list of matching Luca domains]
\\\`\\\`\\\`

## Routing Logic

- **HIGH or MEDIUM**: Return success — orchestrator continues the pipeline
- **LOW**: Write a manual-review document to \`docs/scouting/manual-review/{date}-{slug}.md\` explaining why, then return LOW status

## Conservative Scoring

When in doubt, score MEDIUM (not LOW). LOW is a terminal state — the article exits the pipeline. Only score LOW when the article is clearly unrelated to developer tooling, agentic AI, or workflow automation.

\\\`\\\`\\\`bash
luca-bridge clear-status 2>/dev/null || true
\\\`\\\`\\\`
`,
    },
  ],
};

export const scoutRelevanceSkill = createSkill(scoutRelevanceConfig);
