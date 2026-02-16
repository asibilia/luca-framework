# phase-insert

Insert urgent work as a decimal phase between existing phases mid-milestone.

## main

<main>
# Luca Insert Phase

Insert a decimal phase for urgent work discovered mid-milestone that must be completed between existing integer phases.

**Arguments:** `<after> <description>` (e.g., `7 Fix critical auth bug`)

**Purpose:** Handle urgent work discovered during execution without renumbering entire roadmap.

Uses decimal numbering (7.1, 7.2, etc.) to preserve the logical sequence of planned phases.

## Process

1. **Parse arguments:**

   - First argument: integer phase number to insert after
   - Remaining arguments: phase description
   - Error if less than 2 arguments provided

2. **Load roadmap:**

   - Read `.planning/ROADMAP.md`
   - Error if not found

3. **Verify target phase:**

   - Confirm Phase {after} exists in roadmap
   - Verify phase is in current milestone

4. **Find existing decimals:**

   - Search for existing decimal phases (e.g., 7.1, 7.2)
   - Calculate next decimal: max + 1
   - Examples:
     - Phase 7 with no decimals → next is 7.1
     - Phase 7 with 7.1 → next is 7.2

5. **Generate slug:**

   - Convert description to kebab-case
   - Example: `06.1-fix-critical-auth-bug`

6. **Create phase directory:**

   ```bash
   mkdir -p ".planning/phases/${decimal_phase}-${slug}"
   ```

7. **Update roadmap:**

   - Insert new phase entry after target phase
   - Include "(INSERTED)" marker
   - Add Goal, Depends on, Plans placeholders

8. **Update state (bridge primary, STATE.md fallback):**

   \`\`\`bash
   # Primary: Regenerate STATE.md from state machine (picks up roadmap changes)
   bun run packages/luca-state/src/bridge.ts snapshot 2>/dev/null || true
   # Fallback: Manually add entry under "Roadmap Evolution" in STATE.md with (URGENT) marker
   \`\`\`

9. **Present completion:**

   ```
   Phase {decimal_phase} inserted after Phase {after}:
   - Description: {description}
   - Marker: (INSERTED) - indicates urgent work

   ## ▶ Next Up

   `/phase-plan {decimal_phase}`
   ```

## Anti-Patterns

- Don't use for planned work at end of milestone (use `/phase-add`)
- Don't insert before Phase 1
- Don't renumber existing phases
- Don't create plans yet (that's `/phase-plan`)
- Don't commit changes (user decides when to commit)

## Success Criteria

- [ ] Phase directory created
- [ ] Roadmap updated with new phase entry (includes "(INSERTED)" marker)
- [ ] Phase inserted in correct position
- [ ] State updated via bridge snapshot (or STATE.md fallback)
- [ ] Decimal number calculated correctly

## Next Steps

**Primary:** `/phase-plan {N.1}` — Create execution plans for the inserted phase

**Also available:**

- `/phase-discuss {N.1}` — Gather context before planning
- `/progress` — Check overall project status
</main>