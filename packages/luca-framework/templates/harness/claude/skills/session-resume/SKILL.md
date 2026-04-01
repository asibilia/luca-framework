# session-resume

Resume work from a previous session with full cognitive context restoration.

## main

<main>
# <%= branding.frameworkName %> Resume Work

Restore complete project context and resume work seamlessly from previous session.

## Execution Context

Read this reference file before executing:

- `.claude/<%= branding.nameLowercase %>/workflows/resume-project.md`

## Process

Follow the resume-project workflow which handles:

1. **Project existence verification**
   - Check for `.planning/` directory
   - Error if project not initialized

2. **State loading (from bridge)**

   ```bash
   # Read comprehensive state from bridge
   STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')

   # Read complexity and phase info
   COMPLEXITY=$(luca-bridge read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "MODERATE")
   PHASE_JSON=$(luca-bridge read-phase 2>/dev/null || echo '{"current_phase":null}')
   ```

   If state not initialized, reconstruct from artifacts

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
   - Session continuity is auto-tracked by the state machine (`last_transition_at` field)
   - State is persisted automatically via state.json

## Success Criteria

- [ ] Project context fully restored
- [ ] Checkpoint file processed (if exists)
- [ ] Incomplete work detected
- [ ] Clear next steps presented
- [ ] User knows what to do next

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Resumed successfully | Continue work | `/phase-execute {phase}` |
| Need to check status | Review progress | `/progress` |
| Context unclear | Check what's next | `/progress` |

**Primary:** `/progress` — See current state and smart routing

**Also available:**

- `/phase-execute {phase}` — Continue execution directly
- `/help` — Review available commands
</main>