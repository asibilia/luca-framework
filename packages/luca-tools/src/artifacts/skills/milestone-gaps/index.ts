/**
 * milestone-gaps skill — Create phases to close gaps identified by a milestone audit.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/milestone-gaps/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Plan Milestone Gaps

Create phases to close gaps identified by milestone audit.

## Process

1. **Load audit:**
   - Read \`.luca/milestones/v{version}-audit.md\`
   - Extract gaps section

2. **Group gaps into phases:**
   - Group related gaps together
   - Prioritize by requirement priority (must/should/nice)
   - Create coherent phase boundaries

3. **Register each phase (one call per phase):**

   \\\`\\\`\\\`bash
   luca roadmap add-phase --name "<phase name, referencing the gaps it closes>"
   \\\`\\\`\\\`

   The verb owns numbering, slugification, directory creation, and the
   regeneration of the GENERATED \`.luca/roadmap.md\`. Never \`mkdir\` a phase
   directory, and treat \`.luca/roadmap.md\` as generated output — the verb
   rewrites it. Take the phase number and
   directory from the \`{ nn, slug, dir }\` it prints; add \`--deps "<name>"\`
   when one gap-closure phase depends on another.

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
- [ ] Each phase registered via \`luca roadmap add-phase\` (no \`mkdir\`, no roadmap hand-edit)
- [ ] Audit file updated with planning status
- [ ] User knows next steps

## Next Steps

**Primary:** \`/phase-execute {gap-phase}\` — Execute the gap closure plans

**Also available:**
- \`/progress\` — Review gap closure phases
- \`/milestone-audit\` — Re-audit after fixes
</main>
`

export const milestoneGapsSkill = defineSkill({
    name: 'milestone-gaps',
    description: 'Create phases to close gaps identified by a milestone audit.',
    body: BODY,
})
