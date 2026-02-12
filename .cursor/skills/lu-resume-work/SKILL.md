---
name: lu-resume-work
description: Resume work from a previous session with full cognitive context restoration.
---

<main>
<main>
# Luca Resume Work

Restore complete project context and resume work seamlessly from previous session.

## Execution Context

Read this reference file before executing:

- `.cursor/luca/workflows/resume-project.md`

## Process

Follow the resume-project workflow which handles:

1. **Project existence verification**
   - Check for `.planning/` directory
   - Error if project not initialized

2. **STATE.md loading or reconstruction**
   - Load existing state
   - Reconstruct from artifacts if missing

3. **Checkpoint and incomplete work detection**
   - Check for `.continue-here.md` files
   - Find PLAN.md without matching SUMMARY.md

4. **Visual status presentation**
   - Show progress bar
   - Summarize recent work
   - Display current position

5. **Context-aware option offering**
   - Check CONTEXT.md before suggesting plan vs discuss
   - Offer appropriate next actions

6. **Routing to appropriate next command**
   - Execute phase if plans exist
   - Plan phase if not planned
   - Discuss phase if no context

7. **Session continuity updates**
   - Update STATE.md with session info

## Success Criteria

- [ ] Project context fully restored
- [ ] Checkpoint file processed (if exists)
- [ ] Incomplete work detected
- [ ] Clear next steps presented
- [ ] User knows what to do next

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Resumed successfully | Continue work | `/lu-execute-phase {phase}` |
| Need to check status | Review progress | `/lu-progress` |
| Context unclear | Check what's next | `/lu-progress` |

**Primary:** `/lu-progress` — See current state and smart routing

**Also available:**

- `/lu-execute-phase {phase}` — Continue execution directly
- `/lu-help` — Review available commands
</main>
</main>