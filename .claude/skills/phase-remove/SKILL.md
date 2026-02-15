# phase-remove

Remove a future phase from the roadmap and renumber subsequent phases.

## main

<main>
# Luca Remove Phase

Remove an unstarted future phase from the roadmap and renumber all subsequent phases to maintain a clean, linear sequence.

**Arguments:** `<phase-number>` (integer or decimal)

**Purpose:** Clean removal of work you've decided not to do, without polluting context with cancelled/deferred markers.

**Output:** Phase deleted, all subsequent phases renumbered, git commit as historical record.

## Process

1. **Parse arguments:**

   - Argument is the phase number to remove
   - Error if not provided

2. **Load state:**

   \`\`\`bash
   # Primary: Read state from bridge
   STATE_JSON=$(bun run src/state-machine/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
   # Fallback: Read STATE.md directly
   STATE_CONTENT=$(cat .planning/STATE.md 2>/dev/null || echo "")
   \`\`\`

   - Read ROADMAP.md
   - Parse current phase number

3. **Validate phase exists:**

   - Search for `### Phase {target}:` heading
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

   - Remove `.planning/phases/{target}-{slug}/`

8. **Renumber directories:**

   - Process in descending order to avoid conflicts
   - Rename integer and decimal phase directories

9. **Rename files in directories:**

   - Rename plan files inside renumbered directories

10. **Update ROADMAP.md:**

    - Remove phase section entirely
    - Renumber all subsequent phases
    - Update dependency references

11. **Update state (bridge primary, STATE.md fallback):**

    \`\`\`bash
    # Primary: Regenerate STATE.md from state machine (reflects roadmap changes)
    bun run src/state-machine/bridge.ts snapshot 2>/dev/null || true
    # Fallback: Manually update total phase count and progress percentage in STATE.md
    \`\`\`

12. **Commit:**
    - `chore: remove phase {target} ({original-phase-name})`

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
- [ ] State updated via bridge snapshot (or STATE.md fallback)
- [ ] Changes committed with descriptive message
- [ ] No gaps in phase numbering

## Next Steps

**Primary:** `/progress` — Check updated project status

**Also available:**

- `/phase-plan {next}` — Plan the next phase
- `/phase-execute {current}` — Continue current execution
</main>