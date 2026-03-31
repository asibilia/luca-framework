/**
 * scout-impl-research Skill - Research concrete implementation approaches
 * for improvements identified in the impact analysis.
 *
 * Sub-skill for Step 5 of the scout per-article pipeline. This is the final
 * per-article stage before an article moves to READY state.
 *
 * @example
 * ```
 * Spawned by the scout orchestrator as:
 * Agent(name: "scout-impl-research-{slug}")
 * ```
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const scoutImplResearchConfig: SkillConfig = {
  frontmatter: {
    name: "scout-impl-research",
    description:
      "Research concrete implementation approaches for framework improvements identified in the scout impact analysis.",
  },
  sections: [
    {
      title: "main",
      content: `# Scout Implementation Research

Sub-skill for Step 5 of the scout per-article pipeline. Final per-article stage.

## Arguments

- slug: Article identifier
- impact_path: Path to the impact analysis document

## Process


1. Read the impact document's Gap Analysis table and Recommended Actions
2. For each recommended action (P0 and P1 priority):
   - Research HOW to implement it in the Luca framework
   - Include relevant codebase paths and existing patterns
   - Focus on concrete code-level approaches, not abstract patterns
3. Append an "Implementation Approaches" section to the impact document

## Output

Update the impact document in-place by populating the "Implementation Approaches" section:

### Implementation Approaches

For each recommended action:

#### [Action Name]

- **Target files**: List of files/domains to modify
- **Approach**: Concrete implementation strategy
- **Existing patterns to follow**: Reference similar implementations in the codebase
- **Estimated changes**: Number of files, new vs modified
- **Dependencies**: What must exist first
- **Risks**: What could go wrong

## Scoping

- Focus on P0 and P1 actions only (P2 can be brief)
- Reference specific Luca conventions: functional programming, Zod schemas, Bun-first, kebab-case
- Implementation approaches must be concrete enough to create todo files from
- This completes the per-article pipeline — article moves to READY state after this step

`,
    },
  ],
};

export const scoutImplResearchSkill = createSkill(scoutImplResearchConfig);
