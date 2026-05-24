/**
 * phase-remove skill — Remove a future phase from the roadmap and renumber subsequent phases.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/phase-remove/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Remove Phase

Remove an unstarted future phase from the roadmap and renumber all subsequent phases to maintain a clean, linear sequence.

**Arguments:** \`<phase-number>\` (integer or decimal)

**Purpose:** Clean removal of work you've decided not to do, without polluting context with cancelled/deferred markers.

**Output:** Phase deleted, all subsequent phases renumbered, git commit as historical record.

## Process

1. **Parse arguments:**

   - Argument is the phase number to remove
   - Error if not provided

2. **Load state:**

   \\\`\\\`\\\`bash
   STATE_JSON=$(luca state read 2>/dev/null || echo '{"initialized":false}')
   \\\`\\\`\\\`

   - Read \`.luca/roadmap.md\` (or call \`luca roadmap read\`)
   - Parse current phase number from the workflow state JSON

3. **Validate phase exists:**

   - Search for \`### Phase {target}:\` heading
   - Error with available phases if not found

4. **Validate future phase:**

   - Target must be > current phase number
   - Check for SUMMARY.md files (can't remove completed work)

5. **Gather phase info:**

   - Extract phase name
   - Find phase directory
   - Find all subsequent phases that need renumbering

6. **Confirm removal:**

   - Present what will be deleted/renumbered
   - Wait for confirmation

7. **Delete phase directory:**

   - Remove \`.luca/phases/{target}-{slug}/\`

8. **Renumber directories:**

   - Process in descending order to avoid conflicts
   - Rename integer and decimal phase directories

9. **Rename files in directories:**

   - Rename plan files inside renumbered directories

10. **Update \`.luca/roadmap.md\`:**

    - Remove phase section entirely
    - Renumber all subsequent phases
    - Update dependency references

11. **Roadmap update:**

    The roadmap edit is the durable change. Confirm via \`luca roadmap read\`. The workflow state in \`.luca/state.json\` reads phase counts from the roadmap on demand — no separate state snapshot step is needed.

12. **Commit:**
    - \`chore: remove phase {target} ({original-phase-name})\`

## Anti-Patterns

- Don't remove completed phases (have SUMMARY.md files)
- Don't remove current or past phases
- Don't leave gaps in numbering - always renumber
- Don't add "removed phase" notes to \`.luca/state.json\` — the git commit is the record

## Edge Cases

- **Removing decimal phase:** Only affects other decimals in same series
- **No subsequent phases:** Just delete and update \`.luca/roadmap.md\`
- **Phase directory doesn't exist:** Skip deletion, proceed with updates
- **Decimal phases under removed integer:** Renumber to previous integer

## Success Criteria

- [ ] Target phase validated as future/unstarted
- [ ] Phase directory deleted (if existed)
- [ ] All subsequent phase directories renumbered
- [ ] Files inside directories renamed
- [ ] \`.luca/roadmap.md\` updated (section removed, all references renumbered)
- [ ] \`.luca/state.json\` reflects the new phase numbering (read back via \`luca state read\` to confirm)
- [ ] Changes committed with descriptive message
- [ ] No gaps in phase numbering

## Next Steps

**Primary:** \`/progress\` — Check updated project status

**Also available:**

- \`/phase-plan {next}\` — Plan the next phase
- \`/phase-execute {current}\` — Continue current execution
</main>
`

export const phaseRemoveSkill = defineSkill({
    name: "phase-remove",
    description: "Remove a future phase from the roadmap and renumber subsequent phases.",
    body: BODY,
})
