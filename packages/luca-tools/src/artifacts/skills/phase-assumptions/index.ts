/**
 * phase-assumptions skill — Preview AI planning assumptions for a phase before committing to execution.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/phase-assumptions/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca List Phase Assumptions

See what AI is planning to do before it starts.

**Arguments:** \`<phase number>\`

Shows AI's intended approach for a phase so you can course-correct if needed.

**No files created** - conversational output only.

## Process

1. **Load phase context:**
   - Read \`.luca/roadmap.md\` for phase goal
   - Recall mapped requirements from MuninnDB (\`brain:project-requirements\`)
   - Read \`.luca/phases/<slug>/research.md\` (if exists)
   - Read \`.luca/phases/<slug>/context.md\` (if exists)

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
</main>
`

export const phaseAssumptionsSkill = defineSkill({
    name: "phase-assumptions",
    description: "Preview AI planning assumptions for a phase before committing to execution.",
    body: BODY,
})
