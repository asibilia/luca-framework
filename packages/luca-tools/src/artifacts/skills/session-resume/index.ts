/**
 * session-resume skill — Resume work from a previous session with full cognitive context restoration.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/session-resume/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
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

3. **Signal readback (satisfaction/failure telemetry)**

   Surface the \`signal.*\` telemetry accrued for this run plus the clustered "Signal Synthesis" themes from the prior phase's \`learn.md\`, so the resuming session sees what satisfaction and failure signals built up before the break.

   \`\`\`bash
   # Resolve the active run's telemetry log. The run id is the state's
   # sessionId (the generated pipeline RUN id) — the same value emit used as
   # --run-id, so the log is named .luca/telemetry/<sessionId>.jsonl.
   SESSION_ID=$(echo "$STATE_JSON" | jq -r '.sessionId // empty')

   if [ -z "$SESSION_ID" ]; then
     # sessionId is unset (recovery/partial run never stamped it). There is no
     # run id, therefore NO telemetry log exists for this run — skip the
     # readback gracefully. Do NOT error and do NOT invent a file path.
     echo "No run id for this session (sessionId unset) — skipping signal readback."
   else
     TELEMETRY_FILE=".luca/telemetry/\${SESSION_ID}.jsonl"
     if [ -f "$TELEMETRY_FILE" ]; then
       # Replay every signal.* event (e.g. signal.satisfaction,
       # signal.failure-dump) and tally by kind so the digest shows the balance
       # of signals. The startswith("signal.") prefix match catches all signal
       # kinds regardless of suffix.
       echo "Signal telemetry for run \${SESSION_ID}:"
       jq -rc 'select((.kind // "") | startswith("signal."))' "$TELEMETRY_FILE"
       jq -rc 'select((.kind // "") | startswith("signal.")) | .kind' "$TELEMETRY_FILE" \\
         | sort | uniq -c
     else
       echo "No signal telemetry log found for run \${SESSION_ID}."
     fi
   fi
   \`\`\`

   Then read the prior phase's \`learn.md\` (under \`.luca/phases/<currentPhaseSlug>/learn.md\`, or the most recent completed phase) and surface its **Signal Synthesis** section — the clustered themes distilled from those signals. If \`learn.md\` is absent, note that no synthesis exists yet and fall back to the raw telemetry tally above.

4. **Incomplete work detection**
   - For the active phase under \`.luca/phases/<currentPhaseSlug>/\`: check for \`plan.md\` without matching \`execute/summary.md\` (mid-phase abandonment) and for partially-filled \`audits/\` (mid-review abandonment).

5. **Visual status presentation**
   - Show progress bar
   - Summarize recent work
   - Display current position
   - Include the signal readback digest (satisfaction/failure tally + Signal Synthesis themes) from step 3

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
- [ ] Checkpoint file processed (if exists)
- [ ] Signal telemetry + Signal Synthesis themes surfaced
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
    name: "session-resume",
    description: "Resume work from a previous session with full cognitive context restoration.",
    body: BODY,
})
