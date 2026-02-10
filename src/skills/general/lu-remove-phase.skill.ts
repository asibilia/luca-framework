/**
 * lu-remove-phase Skill - Remove a future phase from roadmap and renumber subsequent phases. Use when user wants to remove a phase, mentions /lu-remove-phase, or decides not to do planned work.
 */
import { BaseSkillImpl } from '../base/base-skill';
import type { SkillConfig } from '../types/skill.types';

// Define the lu-remove-phase skill configuration
const luRemovePhaseConfig: SkillConfig = {
  frontmatter: {
    name: 'lu-remove-phase',
    description: `Remove a future phase from roadmap and renumber subsequent phases. Use when user wants to remove a phase, mentions /lu-remove-phase, or decides not to do planned work.`,
    'disable-model-invocation': true,
  },
  sections: [
    {
      title: 'main',
      content: `<main>
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

   - Read STATE.md and ROADMAP.md
   - Parse current phase number

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

   - Remove \`.planning/phases/{target}-{slug}/\`

8. **Renumber directories:**

   - Process in descending order to avoid conflicts
   - Rename integer and decimal phase directories

9. **Rename files in directories:**

   - Rename plan files inside renumbered directories

10. **Update ROADMAP.md:**

    - Remove phase section entirely
    - Renumber all subsequent phases
    - Update dependency references

11. **Update STATE.md:**

    - Update total phase count
    - Recalculate progress percentage

12. **Commit:**
    - \`chore: remove phase {target} ({original-phase-name})\`

## Anti-Patterns

- Don't remove completed phases (have SUMMARY.md files)
- Don't remove current or past phases
- Don't leave gaps in numbering - always renumber
- Don't add "removed phase" notes to STATE.md - git commit is the record

## Edge Cases

- **Removing decimal phase:** Only affects other decimals in same series
- **No subsequent phases:** Just delete and update ROADMAP.md
- **Phase directory doesn't exist:** Skip deletion, proceed with updates
- **Decimal phases under removed integer:** Renumber to previous integer

## Success Criteria

- [ ] Target phase validated as future/unstarted
- [ ] Phase directory deleted (if existed)
- [ ] All subsequent phase directories renumbered
- [ ] Files inside directories renamed
- [ ] ROADMAP.md updated (section removed, all references renumbered)
- [ ] STATE.md updated (phase count, progress percentage)
- [ ] Changes committed with descriptive message
- [ ] No gaps in phase numbering

## Next Steps

**Primary:** \`/lu-progress\` — Check updated project status

**Also available:**

- \`/lu-plan-phase {next}\` — Plan the next phase
- \`/lu-execute-phase {current}\` — Continue current execution
</main>`,
      order: 1
    }
  ]
};

export class LuRemovePhaseSkill extends BaseSkillImpl {
  constructor() {
    super(luRemovePhaseConfig);
  }
}
