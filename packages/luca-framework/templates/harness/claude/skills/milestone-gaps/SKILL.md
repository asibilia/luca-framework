# milestone-gaps

Create phases to close gaps identified by a milestone audit.

## main

<main>
# <%= branding.frameworkName %> Plan Milestone Gaps

Create phases to close gaps identified by milestone audit.

## Process

1. **Load audit:**
   - Read `.planning/v{version}-MILESTONE-AUDIT.md`
   - Extract gaps section

2. **Group gaps into phases:**
   - Group related gaps together
   - Prioritize by requirement priority (must/should/nice)
   - Create coherent phase boundaries

3. **Add phases to roadmap:**
   - Use `/phase-add` pattern for each new phase
   - Include gap references in phase description

4. **Update audit status:**
   - Mark gaps as "planned"
   - Reference new phase numbers

5. **Present plan:**

   ```
   ## Gap Closure Phases
   
   | Phase | Gaps Addressed | Priority |
   |-------|----------------|----------|
   | {N}   | {gap 1, gap 2} | Must     |
   | {N+1} | {gap 3}        | Should   |
   
   ## ▶ Next Up
   
   /phase-plan {N} — plan first gap closure phase
   ```

## Success Criteria

- [ ] Audit gaps loaded
- [ ] Gaps grouped into coherent phases
- [ ] Phases added to ROADMAP.md
- [ ] Audit file updated with planning status
- [ ] User knows next steps

## Next Steps

**Primary:** `/phase-execute {gap-phase}` — Execute the gap closure plans

**Also available:**
- `/progress` — Review gap closure phases
- `/milestone-audit` — Re-audit after fixes
</main>