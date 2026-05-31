/**
 * phase-add skill — Append a new phase to the end of the current milestone roadmap.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/phase-add/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Add Phase

Add a new integer phase to the end of the current milestone in the roadmap.

**Arguments:** \`<description>\` (e.g., "Add authentication", "Fix critical performance issues")

**Purpose:** Add planned work discovered during execution that belongs at the end of current milestone.

## Process

1. **Parse arguments:**

   - All arguments become the phase description
   - Error if no arguments provided

2. **Load roadmap:**

   - Read \`.luca/roadmap.md\` (or call \`luca roadmap read\`)
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
   mkdir -p ".luca/phases/\${phase_num}-\${slug}"
   \`\`\`

7. **Update roadmap:**

   - Insert new phase entry after last phase in current milestone
   - Include Goal, Depends on, Plans placeholders

8. **Roadmap update:**

   The roadmap edit is the durable change. Read it back via \`luca roadmap read\` to confirm the new phase appears. The workflow state machine in \`.luca/state.json\` updates separately when the pipeline transitions into that phase.

9. **Present completion:**

   \`\`\`
   Phase {N} added to current milestone:
   - Description: {description}
   - Directory: .luca/phases/{phase-num}-{slug}/
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
- [ ] \`.luca/state.json\` reflects the new phase (read back via \`luca state read\` to confirm)
- [ ] New phase appears at end of current milestone
- [ ] Next phase number calculated correctly
</main>
`

export const phaseAddSkill = defineSkill({
    name: "phase-add",
    description: "Append a new phase to the end of the current milestone roadmap.",
    body: BODY,
})
