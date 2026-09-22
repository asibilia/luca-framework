/**
 * session-resume skill — Resume work from a previous session with full cognitive context restoration.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/session-resume/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 *
 * ## Why this skill still exists alongside `progress`
 *
 * It was slated for deletion on the premise that its only non-`progress`
 * value was replaying `signal.*` records out of `.luca/telemetry/`, which
 * the telemetry narrowing killed. That premise did not survive: the readback
 * was migrated to `.luca/ledger.jsonl` rather than dropped, so Step 3 is
 * live, telemetry-independent, and has no `progress` equivalent — `progress`
 * reads position and routes, it never replays what the run had been looping
 * on. Step 4's partially-filled `audits/` (mid-review abandonment) check is
 * likewise absent from `progress`'s routing table, which only compares
 * summaries against plans.
 *
 * The pause↔resume loop is closed through MuninnDB, NOT a checkpoint file:
 * `/session-pause` routes its handoff through `lu-handoff`, which writes
 * `session:phase-boundary-handoff`. The legacy `.continue-here.md` path is
 * outside `LUCA_DIR_CONTRACT` (the stage-gate hook rejects the write) and no
 * producer remains, so Step 3 recalls the memory instead.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Resume Work

Restore complete project context and resume work seamlessly from previous session.

## Process

Follow the resume-project workflow which handles:

1. **Project existence verification**
   - Check for \`.luca/\` directory
   - Error if project not initialized

2. **State loading via the \`luca\` CLI**

   \`\`\`bash
   # Read the comprehensive state from .luca/state.json
   STATE_JSON=$(luca state read 2>/dev/null || echo '{"initialized":false}')

   # Extract complexity and phase info from the state JSON
   COMPLEXITY=$(echo "$STATE_JSON" | jq -r '.complexity // "MODERATE"')
   PHASE=$(echo "$STATE_JSON" | jq -r '.currentPhase // empty')
   PIPELINE_STEP=$(echo "$STATE_JSON" | jq -r '.pipelineStep // "triage"')
   \`\`\`

   If state not initialized, reconstruct from artifacts (research.md, context.md, plan.md, audits/ under the active phase directory).

3. **Cognitive handoff + rework/synthesis readback**

   First, recall the phase-boundary handoff from MuninnDB — the repo vault's \`session:phase-boundary-handoff\` memory, written by \`lu-handoff\` (which \`/session-pause\` and end-of-wave \`/phase-execute\` both route through). It carries the decisions, open threads, and resume prompt that a context-stripped session would otherwise lose. If no such memory exists, say so and continue — it is optional, never an error.

   There is **no checkpoint file to read.** \`.continue-here.md\` is outside \`LUCA_DIR_CONTRACT\`, the stage-gate hook rejects the write, and no skill produces it. Do not look for it, and do not resurrect it.

   Then surface this run's rework record plus the clustered \`Signal Synthesis\` themes from the prior phase's \`learn.md\`, so the resuming session sees where the run had been looping before the break.

   \`\`\`bash
   # The run id is the state's sessionId (the generated pipeline RUN id) —
   # the same value the ledger stamps on every entry for this run.
   SESSION_ID=$(echo "$STATE_JSON" | jq -r '.sessionId // empty')

   if [ -z "$SESSION_ID" ]; then
     # sessionId is unset (recovery/partial run never stamped it). Nothing to
     # scope the ledger to — skip gracefully. Do NOT error.
     echo "No run id for this session (sessionId unset) — skipping rework readback."
   elif [ -f .luca/ledger.jsonl ]; then
     # Replay this run's loop-back events and tally by event so the digest
     # shows where the pipeline had been churning.
     echo "Rework record for run $SESSION_ID:"
     jq -rc --arg run "$SESSION_ID" \\
       'select(.runId == $run and (.event == "pipeline-re-entered" or .event == "fixloop-counted"))' \\
       .luca/ledger.jsonl
     jq -r --arg run "$SESSION_ID" \\
       'select(.runId == $run and (.event == "pipeline-re-entered" or .event == "fixloop-counted")) | .event' \\
       .luca/ledger.jsonl | sort | uniq -c
   else
     echo "No ledger found — skipping rework readback."
   fi
   \`\`\`

   Then read the prior phase's \`learn.md\` (under \`.luca/phases/<currentPhaseSlug>/learn.md\`, or the most recent completed phase) and surface its **Signal Synthesis** section — the clustered themes distilled from the run's decisions and rework. If \`learn.md\` is absent, note that no synthesis exists yet and fall back to the raw ledger tally above.

4. **Incomplete work detection**
   - For the active phase under \`.luca/phases/<currentPhaseSlug>/\`: check for \`plan.md\` without matching \`execute/summary.md\` (mid-phase abandonment) and for partially-filled \`audits/\` (mid-review abandonment).

5. **Visual status presentation**
   - Show progress bar
   - Summarize recent work
   - Display current position
   - Include the step 3 digest: the handoff memory's open threads, the rework tally (\`pipeline-re-entered\` / \`fixloop-counted\` counts), and the Signal Synthesis themes

6. **Context-aware option offering**
   - Check the active phase's \`context.md\` before suggesting plan vs discuss
   - Offer appropriate next actions

7. **Routing to appropriate next command**
   - Execute phase if plans exist
   - Plan phase if not planned
   - Discuss phase if no context

8. **Session continuity updates**
   - Session continuity is auto-tracked by the state machine in \`.luca/state.json\` (no separate snapshot step needed).

## Success Criteria

- [ ] Project context fully restored
- [ ] \`session:phase-boundary-handoff\` recalled from MuninnDB (if one exists)
- [ ] Rework record + Signal Synthesis themes surfaced
- [ ] Incomplete work detected
- [ ] Clear next steps presented
- [ ] User knows what to do next

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Resumed successfully | Continue work | \`/phase-execute {phase}\` |
| Need to check status | Review progress | \`/progress\` |
| Context unclear | Check what's next | \`/progress\` |

**Primary:** \`/progress\` — See current state and smart routing

**Also available:**

- \`/phase-execute {phase}\` — Continue execution directly
- \`/help\` — Review available commands
</main>
`

export const sessionResumeSkill = defineSkill({
    name: 'session-resume',
    description:
        'Resume work from a previous session with full cognitive context restoration.',
    body: BODY,
})
