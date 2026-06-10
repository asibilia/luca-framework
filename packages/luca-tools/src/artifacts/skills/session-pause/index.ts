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

Create \`.continue-here.md\` handoff file to preserve complete work state across sessions.

Enables seamless resumption in fresh session with full context restoration.

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

### Step 3: Write Handoff

Write to \`.luca/phases/XX-name/.continue-here.md\`:

\`\`\`markdown
---
phase: XX-name
task: 3
total_tasks: 7
status: in_progress
last_updated: [timestamp]
---

<current_state>
[Where exactly are we? Immediate context]
</current_state>

<completed_work>

- Task 1: [name] - Done
- Task 2: [name] - Done
- Task 3: [name] - In progress, [what's done]
  </completed_work>

<remaining_work>

- Task 3: [what's left]
- Task 4: Not started
- Task 5: Not started
  </remaining_work>

<decisions_made>

- Decided to use [X] because [reason]
- Chose [approach] over [alternative] because [reason]
  </decisions_made>

<blockers>
- [Blocker 1]: [status/workaround]
</blockers>

<context>
[Mental state, what were you thinking, the plan]
</context>

<next_action>
Start with: [specific first action when resuming]
</next_action>
\`\`\`

### Step 4: Commit

\`\`\`bash
git add .
git commit -m "chore(wip): [phase-name] paused at task [X]/[Y]"
\`\`\`

### Step 5: Confirm

\`\`\`
✓ Handoff created: .luca/phases/[XX-name]/.continue-here.md

Current state:
- Phase: [XX-name]
- Task: [X] of [Y]
- Status: [in_progress/blocked]
- Committed as WIP

To resume: /session-resume
\`\`\`

## Success Criteria

- [ ] .continue-here.md created in correct phase directory
- [ ] All sections filled with specific content
- [ ] Committed as WIP
- [ ] User knows location and how to resume

## Next Steps

This skill creates a handoff for resuming later. No immediate action needed.

**When returning:**
- \`/session-resume\` — Restore context and continue

**Common follow-ups:**
- \`/help\` — Review commands before stepping away
</main>
`

export const sessionPauseSkill = defineSkill({
    name: "session-pause",
    description: "Create a context handoff snapshot when pausing work mid-phase for later resumption.",
    body: BODY,
})
