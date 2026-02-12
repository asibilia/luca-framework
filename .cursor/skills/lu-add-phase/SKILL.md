---
name: lu-add-phase
description: Append a new phase to the end of the current milestone roadmap.
disable-model-invocation: true
---

<main>
<main>
# Luca Add Phase

Add a new integer phase to the end of the current milestone in the roadmap.

**Arguments:** `<description>` (e.g., "Add authentication", "Fix critical performance issues")

**Purpose:** Add planned work discovered during execution that belongs at the end of current milestone.

## Process

1. **Parse arguments:**

   - All arguments become the phase description
   - Error if no arguments provided

2. **Load roadmap:**

   - Read `.planning/ROADMAP.md`
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
   - Example: "Add authentication" → `07-add-authentication`

6. **Create phase directory:**

   ```bash
   mkdir -p ".planning/phases/${phase_num}-${slug}"
   ```

7. **Update roadmap:**

   - Insert new phase entry after last phase in current milestone
   - Include Goal, Depends on, Plans placeholders

8. **Update STATE.md:**

   - Add reference to new phase
   - Add entry under "Roadmap Evolution"

9. **Present completion:**

   ```
   Phase {N} added to current milestone:
   - Description: {description}
   - Directory: .planning/phases/{phase-num}-{slug}/
   ```

## Next Steps

**Primary:** `/lu-plan-phase {N}` — Create execution plans for the new phase

**Also available:**

- `/lu-discuss-phase {N}` — Gather context before planning
- `/lu-progress` — Check overall project status

## Anti-Patterns

- Don't modify phases outside current milestone
- Don't renumber existing phases
- Don't use decimal numbering (that's `/lu-insert-phase`)
- Don't create plans yet (that's `/lu-plan-phase`)
- Don't commit changes (user decides when to commit)

## Success Criteria

- [ ] Phase directory created
- [ ] Roadmap updated with new phase entry
- [ ] STATE.md updated with roadmap evolution note
- [ ] New phase appears at end of current milestone
- [ ] Next phase number calculated correctly
</main>
</main>