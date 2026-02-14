/**
 * milestone-gaps Skill - Create phases to close gaps identified by a milestone audit.
 */
import { BaseSkillImpl } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.types";

// Define the milestone-gaps skill configuration
const milestoneGapsConfig: SkillConfig = {
  frontmatter: {
    name: "milestone-gaps",
    description: `Create phases to close gaps identified by a milestone audit.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Plan Milestone Gaps

Create phases to close gaps identified by milestone audit.

## Process

1. **Load audit:**
   - Read \`.planning/v{version}-MILESTONE-AUDIT.md\`
   - Extract gaps section

2. **Group gaps into phases:**
   - Group related gaps together
   - Prioritize by requirement priority (must/should/nice)
   - Create coherent phase boundaries

3. **Add phases to roadmap:**
   - Use \`/phase-add\` pattern for each new phase
   - Include gap references in phase description

4. **Update audit status:**
   - Mark gaps as "planned"
   - Reference new phase numbers

5. **Present plan:**

   \`\`\`
   ## Gap Closure Phases
   
   | Phase | Gaps Addressed | Priority |
   |-------|----------------|----------|
   | {N}   | {gap 1, gap 2} | Must     |
   | {N+1} | {gap 3}        | Should   |
   
   ## ▶ Next Up
   
   /phase-plan {N} — plan first gap closure phase
   \`\`\`

## Success Criteria

- [ ] Audit gaps loaded
- [ ] Gaps grouped into coherent phases
- [ ] Phases added to ROADMAP.md
- [ ] Audit file updated with planning status
- [ ] User knows next steps

## Next Steps

**Primary:** \`/phase-execute {gap-phase}\` — Execute the gap closure plans

**Also available:**
- \`/progress\` — Review gap closure phases
- \`/milestone-audit\` — Re-audit after fixes
</main>`,
      order: 1,
    },
  ],
};

export class MilestoneGapsSkill extends BaseSkillImpl {
  constructor() {
    super(milestoneGapsConfig);
  }
}
