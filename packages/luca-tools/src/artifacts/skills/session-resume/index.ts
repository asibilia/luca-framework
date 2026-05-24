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

3. **Incomplete work detection**
   - For the active phase under \`.luca/phases/<currentPhaseSlug>/\`: check for \`plan.md\` without matching \`execute/summary.md\` (mid-phase abandonment) and for partially-filled \`audits/\` (mid-review abandonment).

4. **Visual status presentation**
   - Show progress bar
   - Summarize recent work
   - Display current position

5. **Context-aware option offering**
   - Check the active phase's \`context.md\` before suggesting plan vs discuss
   - Offer appropriate next actions

6. **Routing to appropriate next command**
   - Execute phase if plans exist
   - Plan phase if not planned
   - Discuss phase if no context

7. **Session continuity updates**
   - Session continuity is auto-tracked by the state machine in \`.luca/state.json\` (no separate snapshot step needed).

## Success Criteria

- [ ] Project context fully restored
- [ ] Checkpoint file processed (if exists)
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
