/**
 * scout-integrate Skill - Cross-cutting integration analysis with verdict routing for the scout pipeline.
 *
 * Sub-skill for Step 6 of the scout pipeline (cross-cutting batch). Spawns the
 * lu-scout-integrator agent on all READY articles, reads per-scout verdicts, and
 * routes each scout to the appropriate next state (integrate / defer / conflict).
 *
 * @example
 * ```
 * Skill(skill: "scout-integrate", args: "{slugs} {impact_paths}")
 * ```
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const scoutIntegrateConfig: SkillConfig = {
  frontmatter: {
    name: "scout-integrate",
    description:
      "Perform cross-cutting integration analysis on batch of READY articles and route based on verdicts.",
  },
  sections: [
    {
      title: "main",
      content: `# Scout Integrate

Sub-skill for Step 6 of the scout pipeline (cross-cutting batch).

## Arguments

- slugs: List of READY article slugs
- impact_paths: List of impact document paths for READY articles

## Process

1. Spawn lu-scout-integrator agent with all impact document paths
2. Wait for completion
3. Read the integration analysis document for per-scout verdicts
4. For each scout verdict:
   - **integrate**: Advance state to INTEGRATION_ANALYZED, continue to todo generation
   - **defer**: Create deferred document in docs/scouting/deferred/{date}-{slug}.md, advance state to DEFERRED
   - **conflict**: Create manual-review document with conflict annotation, advance state to CONFLICTING

## Deferred Document

Must include:
- Links to original digest and impact documents
- Why Deferred (from integration analysis reasoning)
- Conditions to Revisit (specific, actionable criteria)
- Value If Implemented (from impact document)

## Conflict Document

Must include:
- The new recommendation from the scout
- The existing todo(s) that conflict
- Why they conflict (from integration analysis)
- Suggestion for resolution

## Output

Return summary of verdicts: N integrated, N deferred, N conflicting.
`,
    },
  ],
};

export const scoutIntegrateSkill = createSkill(scoutIntegrateConfig);
