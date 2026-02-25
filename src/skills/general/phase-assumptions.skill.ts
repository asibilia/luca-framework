/**
 * phase-assumptions Skill - Preview AI planning assumptions for a phase before committing to execution.
 */
import { createSkill } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.types";

// Define the phase-assumptions skill configuration
const phaseAssumptionsConfig: SkillConfig = {
  frontmatter: {
    name: "phase-assumptions",
    description: `Preview AI planning assumptions for a phase before committing to execution.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca List Phase Assumptions

See what AI is planning to do before it starts.

**Arguments:** \`<phase number>\`

Shows AI's intended approach for a phase so you can course-correct if needed.

**No files created** - conversational output only.

## Process

1. **Load phase context:**
   - Read ROADMAP.md for phase goal
   - Read REQUIREMENTS.md for mapped requirements
   - Read research (if exists)
   - Read existing CONTEXT.md (if exists)

2. **Generate assumptions:**
   Based on phase goal and requirements, list:
   - **Technical approach:** Libraries, patterns, architecture choices
   - **Scope interpretation:** What's in, what's out
   - **Dependencies:** What the phase assumes exists
   - **Risks:** Potential challenges

3. **Present assumptions:**

   \`\`\`
   ## Phase {N}: {Name} - AI Assumptions
   
   ### Technical Approach
   - Will use {X} for {purpose}
   - Following pattern from {existing code}
   - Targeting {specific outcome}
   
   ### Scope
   **In scope:**
   - {item 1}
   - {item 2}
   
   **Out of scope:**
   - {item 3}
   - {item 4}
   
   ### Dependencies
   - Assumes {X} exists from Phase {Y}
   - Requires {Z} to be configured
   
   ### Potential Risks
   - {risk 1}
   - {risk 2}
   
   ---
   
   Does this match your expectations?
   
   - **Yes** → /phase-plan {N}
   - **Adjust** → /phase-discuss {N} to clarify
   \`\`\`

4. **No files created:**
   - This is conversational output only
   - Use \`/phase-discuss\` to capture corrections

## Success Criteria

- [ ] Phase goal and requirements loaded
- [ ] Technical assumptions clearly stated
- [ ] Scope boundaries explicit
- [ ] Dependencies identified
- [ ] User can validate before planning

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Assumptions look good | Plan the phase | \`/phase-plan {phase}\` |
| Assumptions need clarification | Discuss the phase | \`/phase-discuss {phase}\` |
| Need more research | Research the domain | \`/phase-research {phase}\` |

**Primary:** \`/phase-plan {phase}\` — Proceed with planning

**Also available:**
- \`/phase-discuss {phase}\` — Clarify vision if assumptions seem off
- \`/progress\` — Check overall project status
</main>`,
      order: 1,
    },
  ],
};

export const phaseAssumptionsSkill = createSkill(phaseAssumptionsConfig);
