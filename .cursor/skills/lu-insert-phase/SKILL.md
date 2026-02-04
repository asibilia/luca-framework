---
name: lu-insert-phase
description: Insert urgent work as a decimal phase between existing phases. Use when user needs to add urgent work mid-milestone, mentions /lu-insert-phase, or needs to handle discoveries during execution.
disable-model-invocation: true
---

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

8. **Update STATE.md:**

   - Add entry under "Roadmap Evolution" with (URGENT) marker

9. **Present completion:**

   ```
   Phase {decimal_phase} inserted after Phase {after}:
   - Description: {description}
   - Marker: (INSERTED) - indicates urgent work

   ## ▶ Next Up

   `/lu-plan-phase {decimal_phase}`
   ```

## Anti-Patterns

- Don't use for planned work at end of milestone (use `/lu-add-phase`)
- Don't insert before Phase 1
- Don't renumber existing phases
- Don't create plans yet (that's `/lu-plan-phase`)
- Don't commit changes (user decides when to commit)

## Success Criteria

- [ ] Phase directory created
- [ ] Roadmap updated with new phase entry (includes "(INSERTED)" marker)
- [ ] Phase inserted in correct position
- [ ] STATE.md updated with roadmap evolution note
- [ ] Decimal number calculated correctly

## Next Steps

**Primary:** `/lu-plan-phase {N.1}` — Create execution plans for the inserted phase

**Also available:**

- `/lu-discuss-phase {N.1}` — Gather context before planning
- `/lu-progress` — Check overall project status
