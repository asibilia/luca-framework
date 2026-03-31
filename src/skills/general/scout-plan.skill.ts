/**
 * scout-plan Skill - Todo generation with conflict detection for integrated scouts.
 *
 * Sub-skill for Step 7 of the scout pipeline (cross-cutting batch). Spawns the
 * lu-scout-planner agent to produce atomic todos from integration analysis,
 * validates the output, and detects conflicts against the existing backlog.
 *
 * @example
 * ```
 * Skill(skill: "scout-plan", args: "{integration_path} {integrated_slugs}")
 * ```
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const scoutPlanConfig: SkillConfig = {
  frontmatter: {
    name: "scout-plan",
    description:
      "Generate atomic todos from integration analysis with conflict detection against existing backlog.",
  },
  sections: [
    {
      title: "main",
      content: `# Scout Plan

Sub-skill for Step 7 of the scout pipeline (cross-cutting batch).

## Arguments

- integration_path: Path to the integration analysis document
- integrated_slugs: List of slugs with "integrate" verdict

## Process

\\\`\\\`\\\`bash
luca-bridge write-status --skill=scout-plan --stage=PLANNING 2>/dev/null || true
\\\`\\\`\\\`

1. Spawn lu-scout-planner agent with integration analysis and impact documents
2. Wait for completion
3. Validate todos were created:
   - At least one todo per integrated scout
   - Each todo has correct frontmatter (title, area, created, source, tags)
   - Tags include "from-scout" for traceability
4. Check for conflict annotations in planner output
5. If conflicts detected: route affected scouts to CONFLICTING, create manual-review docs
6. If no conflicts: advance all integrated scouts to TODOS_CREATED

## Todo Validation

Each created todo must have:
- Frontmatter: title, area, created (date), source (scout URL), tags (includes from-scout)
- Clear description of what to change
- Where in the codebase
- Why (referencing the scout findings)
- Verification criteria

## Output

Return summary: N todos created, N duplicates skipped, N conflicts detected.

\\\`\\\`\\\`bash
luca-bridge clear-status 2>/dev/null || true
\\\`\\\`\\\`
`,
    },
  ],
};

export const scoutPlanSkill = createSkill(scoutPlanConfig);
