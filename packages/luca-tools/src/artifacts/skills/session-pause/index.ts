/**
 * session-pause skill — Create a context handoff snapshot when pausing work mid-phase for later resumption.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/session-pause/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Pause Work

Persist a context handoff through the durable, contract-legal channel so work state survives across sessions and a fresh session resumes with full context.

The handoff routes through the \`lu-handoff\` skill (a \`session:phase-boundary-handoff\` memory in the repo MuninnDB vault) plus the on-disk \`execute/progress.jsonl\` record — NOT a loose continue-here file at the phase root. That legacy path is outside \`LUCA_DIR_CONTRACT\` and the stage-gate hook rejects the write (see \`docs/decisions/orchestrator-context-pruning.md\`).

## Process

### Step 1: Detect Current Phase

Read current phase from the canonical workflow state:

\`\`\`bash
STATE_JSON=$(luca state read 2>/dev/null || echo '{"initialized":false}')
PHASE=$(echo "$STATE_JSON" | jq -r '.currentPhase // empty')
PHASE_SLUG=$(echo "$STATE_JSON" | jq -r '.currentPhaseSlug // empty')
\`\`\`

### Step 2: Gather Context

Collect complete state for handoff:

1. **Current position**: Which phase, which plan, which task
2. **Work completed**: What got done this session
3. **Work remaining**: What's left in current plan/phase
4. **Decisions made**: Key decisions and rationale
5. **Blockers/issues**: Anything stuck
6. **Mental context**: The approach, next steps, "vibe"
7. **Files modified**: What's changed but not committed

Ask user for clarifications if needed.

### Step 3: Persist the Handoff

Invoke \`Skill(skill: "lu-handoff")\`. It persists the \`session:phase-boundary-handoff\` memory to the repo MuninnDB vault — the cognitive layer (decisions made this session, open threads, blockers, and a 2-4 sentence resume prompt naming the phase + the task/wave to resume at). Feed it the context gathered in Step 2.

The **mechanical** resume record already lives on disk: \`execute/progress.jsonl\` under the active phase captures per-wave progress, and \`.luca/state.json\` holds \`pipelineStep\` / \`currentPhase\`. Together with the handoff memory, a fresh \`/lu\` turn resumes losslessly — no loose handoff file needed.

### Step 4: Commit

\`\`\`bash
git add .
git commit -m "chore(wip): [phase-name] paused at task [X]/[Y]"
\`\`\`

### Step 5: Confirm

\`\`\`
✓ Handoff persisted: session:phase-boundary-handoff (repo vault)
  Mechanical record: .luca/phases/[XX-name]/execute/progress.jsonl

Current state:
- Phase: [XX-name]
- Task: [X] of [Y]
- Status: [in_progress/blocked]
- Committed as WIP

To resume: /lu (Step 0 resumes from state) or /session-resume
\`\`\`

## Success Criteria

- [ ] \`session:phase-boundary-handoff\` memory persisted via \`lu-handoff\`
- [ ] All context sections filled with specific content
- [ ] Committed as WIP
- [ ] User knows how to resume

## Next Steps

This skill creates a handoff for resuming later. No immediate action needed.

**When returning:**
- \`/session-resume\` — Restore context and continue

**Common follow-ups:**
- \`/help\` — Review commands before stepping away
</main>
`

export const sessionPauseSkill = defineSkill({
    name: 'session-pause',
    description:
        'Create a context handoff snapshot when pausing work mid-phase for later resumption.',
    body: BODY,
})
