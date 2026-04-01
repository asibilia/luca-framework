/**
 * phase-add Skill - Append a new phase to the end of the current milestone roadmap.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the phase-add skill configuration
const phaseAddConfig: SkillConfig = {
  frontmatter: {
    name: "phase-add",
    description: `Append a new phase to the end of the current milestone roadmap.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Add Phase

Add a new integer phase to the end of the current milestone in the roadmap.

**Arguments:** \`<description>\` (e.g., "Add authentication", "Fix critical performance issues")

**Purpose:** Add planned work discovered during execution that belongs at the end of current milestone.

## Process

1. **Parse arguments:**

   - All arguments become the phase description
   - Error if no arguments provided

2. **Load roadmap:**

   - Read \`.planning/ROADMAP.md\`
   - Error if not found

3. **Find current milestone:**

   - Locate "## Current Milestone:" heading
   - Extract milestone name and version
   - Identify all phases under this milestone

4. **Calculate next phase:**

   - Find highest integer phase number (ignore decimals)
   - Add 1 to get next phase number
   - Format as two-digit

5. **Generate slug:**

   - Convert description to kebab-case
   - Example: "Add authentication" → \`07-add-authentication\`

6. **Create phase directory:**

   \`\`\`bash
   mkdir -p ".planning/phases/\${phase_num}-\${slug}"
   \`\`\`

7. **Update roadmap:**

   - Insert new phase entry after last phase in current milestone
   - Include Goal, Depends on, Plans placeholders

8. **Update state:**

   - Update state via bridge with new phase info

9. **Present completion:**

   \`\`\`
   Phase {N} added to current milestone:
   - Description: {description}
   - Directory: .planning/phases/{phase-num}-{slug}/
   \`\`\`

## Next Steps

**Primary:** \`/phase-plan {N}\` — Create execution plans for the new phase

**Also available:**

- \`/phase-discuss {N}\` — Gather context before planning
- \`/progress\` — Check overall project status

## Anti-Patterns

- Don't modify phases outside current milestone
- Don't renumber existing phases
- Don't use decimal numbering (that's \`/phase-insert\`)
- Don't create plans yet (that's \`/phase-plan\`)
- Don't commit changes (user decides when to commit)

## Success Criteria

- [ ] Phase directory created
- [ ] Roadmap updated with new phase entry
- [ ] State updated via bridge
- [ ] New phase appears at end of current milestone
- [ ] Next phase number calculated correctly
</main>`,
      order: 1,
    },
  ],
};

export const phaseAddSkill = createSkill(phaseAddConfig);
