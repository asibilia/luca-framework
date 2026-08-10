/**
 * phase-remove skill — Remove a future phase from the roadmap and renumber subsequent phases.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/phase-remove/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 *
 * KEPT, not deleted, but reduced to a thin surface over `luca roadmap
 * remove-phase`. The old body was twelve prose steps that validated the target
 * against `currentPhase`, deleted the directory, renumbered every later
 * directory "in descending order to avoid conflicts", renamed files inside
 * them, and hand-edited the GENERATED `.luca/roadmap.md` — all of which the
 * verb now does atomically and correctly. What survives is the part a CLI verb
 * cannot do: showing the user what is about to disappear and waiting for a
 * confirmation. (Deleting the skill outright would have removed the only
 * confirmation gate in front of a destructive, renumbering operation.)
 *
 * Guarded by `../../roadmap-phase-verb-callers.test.ts`.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Remove Phase

Remove an unstarted future phase from the roadmap. Every later phase is renumbered so the sequence stays linear — \`<NN>\` is derived from roadmap order, so a gap is not representable.

**Arguments:** \`<phase-number>\` (1-based integer; decimals are not valid phase numbers)

**Purpose:** Clean removal of work you've decided not to do, without polluting context with cancelled/deferred markers.

## Process

1. **Parse arguments:**

   - The argument is the 1-based phase number to remove
   - Error if not provided

2. **Show what will change:**

   \\\`\\\`\\\`bash
   luca roadmap read
   \\\`\\\`\\\`

   Present to the user: the target phase's name, and the fact that every phase after it shifts down by one (its number AND its \`.luca/phases/\` directory name change).

3. **Confirm:**

   - Wait for explicit confirmation. This is destructive and renumbers directories.

4. **Remove it:**

   \\\`\\\`\\\`bash
   luca roadmap remove-phase --nn <phase-number>
   \\\`\\\`\\\`

   The verb owns every deterministic step: it refuses anything that is not strictly greater than \`currentPhase\` (you cannot remove the active or a past phase), renumbers the roadmap, renames the affected \`.luca/phases/\` directories, and regenerates \`.luca/roadmap.md\`. A phase directory holding artifacts is PRESERVED rather than deleted, and reported back — only an empty one is removed.

5. **Report:**

   Relay the verb's output — what was removed, what was renamed, and the resulting phase count. If it reported a preserved directory, tell the user where it is so they can deal with it deliberately.

6. **Commit** (optional, user's call):

   \`\`\`
   chore: remove phase {target} ({original-phase-name})
   \`\`\`

## Anti-Patterns

- Don't rename or delete \`.luca/phases/\` directories yourself — the verb renumbers them atomically, highest-first, and a hand-rolled pass corrupts the sequence
- Don't write \`.luca/roadmap.md\`. It is GENERATED output; the verb regenerates it
- Don't try to remove the current or a past phase — the verb rejects it, and it is a signal the user meant something else
- Don't invent decimal phase numbers to dodge renumbering; \`PHASE_SLUG_RE\` rejects them
- Don't skip the confirmation step

## Success Criteria

- [ ] User confirmed the removal after seeing what gets renumbered
- [ ] Exactly one \`luca roadmap remove-phase --nn <N>\` call; no manual renames, deletes, or roadmap edits
- [ ] The verb's report (removed / renamed / preserved directory) relayed to the user
- [ ] No gaps in phase numbering

## Next Steps

**Primary:** \`/progress\` — Check updated project status

**Also available:**

- \`/phase-plan {next}\` — Plan the next phase
- \`/phase-execute {current}\` — Continue current execution
</main>
`

export const phaseRemoveSkill = defineSkill({
    name: 'phase-remove',
    description:
        'Remove a future phase from the roadmap and renumber subsequent phases.',
    body: BODY,
})
