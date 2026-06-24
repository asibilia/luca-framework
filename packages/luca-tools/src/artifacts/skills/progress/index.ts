/**
 * progress skill — Check project progress, show current state, and suggest the next action to take.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/progress/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Progress

Check project progress, summarize recent work and what's ahead, then intelligently route to the next action - either executing an existing plan or creating the next one.

Provides situational awareness before continuing work.

## Process

### Step 1: Verify Planning Structure Exists

Use Bash (not Glob) to check—Glob respects .gitignore but .luca/ is often gitignored:

\`\`\`bash
test -d .planning && echo "exists" || echo "missing"
\`\`\`

If no \`.luca/\` directory:

\`\`\`
No planning structure found.

Run /project-new to start a new project.
\`\`\`

Exit.

If missing \`.luca/state.json\`: suggest \`/project-new\`.

**If \`.luca/roadmap.md\` missing but \`.luca/state.json\` exists:**
This means a milestone was completed and archived. Go to **Route F** (between milestones).

### Step 2: Load Full Project Context

- Read workflow state via the \`luca\` CLI:

\`\`\`bash
STATE_JSON=$(luca state read 2>/dev/null || echo '{"initialized":false}')
\`\`\`

- Read \`.luca/roadmap.md\` for phase structure and objectives
- Read \`.luca/config.json\` for settings (model_profile, workflow toggles)
- Recall project identity from MuninnDB (\`brain:project-identity\` in repo vault) for the canonical project tree — What This Is, Core Value, Requirements live as engrams in v13.

### Step 3: Gather Recent Work Context

- Find the 2-3 most recent \`.luca/phases/<slug>/execute/summary.md\` files
- Extract from each: what was accomplished, key decisions, any issues logged
- This shows "what we've been working on"

### Step 4: Parse Current Position

- From the workflow state JSON: pipelineStep, currentPhase, totalPhases, iteration, complexity
- Calculate: total plans, completed plans, remaining plans (cross-reference roadmap)
- Note any blockers or concerns
- Check for \`context.md\`: For phases without \`plan.md\`, check if \`.luca/phases/<slug>/context.md\` exists
- Count pending todos: \`luca todo list --status pending 2>/dev/null | wc -l\`
- Check for active debug sessions via MuninnDB recall (\`session:debug-*\` in repo vault)

**Check for PR with unaddressed comments:**

\`\`\`bash
# Check if current branch has an open PR
PR_JSON=$(gh pr view --json number,url,title,reviewDecision 2>/dev/null)

if [ -n "$PR_JSON" ]; then
  PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number')
  PR_TITLE=$(echo "$PR_JSON" | jq -r '.title')
  REVIEW_DECISION=$(echo "$PR_JSON" | jq -r '.reviewDecision // "PENDING"')

  # Count comments
  REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
  REVIEW_COMMENTS=$(gh api "/repos/\${REPO}/pulls/\${PR_NUMBER}/comments" --jq 'length' 2>/dev/null || echo "0")
  ISSUE_COMMENTS=$(gh api "/repos/\${REPO}/issues/\${PR_NUMBER}/comments" --jq '[.[] | select(.user.type != "Bot")] | length' 2>/dev/null || echo "0")

  TOTAL_PR_COMMENTS=$((REVIEW_COMMENTS + ISSUE_COMMENTS))
  HAS_PR_COMMENTS=$( [ "$TOTAL_PR_COMMENTS" -gt 0 ] && echo "true" || echo "false" )
else
  HAS_PR_COMMENTS=false
  TOTAL_PR_COMMENTS=0
fi
\`\`\`

### Step 5: Present Rich Status Report

\`\`\`
# [Project Name]

**Progress:** [████████░░] 8/10 plans complete
**Profile:** [quality/balanced/budget]
**Complexity:** [TRIVIAL/MODERATE/COMPLEX] (if active task)

## Git Context
- **Ticket:** [TICKET-ID or None]
- **Branch:** [TICKET-ID--description] → [RELEASE-ID--release]
- **Issue:** [#123 or None]

## PR Status (if open PR exists)
- **PR:** #[number] - [title]
- **Review:** [Changes requested | Approved | Pending]
- **Comments:** [N] unaddressed ([inline] review, [general] discussion)
- **Action:** \`/pr-address\` to process

## Recent Work
- [Phase X, Plan Y]: [what was accomplished - 1 line]
- [Phase X, Plan Z]: [what was accomplished - 1 line]

## Current Position
Phase [N] of [total]: [phase-name]
Plan [M] of [phase-total]: [status]
CONTEXT: [✓ if context.md exists | - if not]

## Key Decisions Made
- [decision 1 from MuninnDB \`decision:*\` engrams + confidence-journal entries]
- [decision 2]

## Blockers/Concerns
- [any blockers or concerns from MuninnDB \`session:*\` engrams + per-phase audits]

## What's Next
[Next phase/plan objective from ROADMAP]
\`\`\`

**Note:** The PR Status section only appears if the current branch has an open PR. If comments exist, it prompts the user to run \`/pr-address\`.

### Step 6: Route to Next Action

| Condition                       | Meaning                     | Action          |
| ------------------------------- | --------------------------- | --------------- |
| uat_with_gaps > 0               | UAT gaps need fix plans     | Route E         |
| HAS_PR_COMMENTS = true          | PR has unaddressed feedback | Route G         |
| summaries < plans               | Unexecuted plans exist      | Route A         |
| summaries = plans AND plans > 0 | Phase complete              | Check milestone |
| plans = 0                       | Phase not yet planned       | Route B         |

**Route G: PR comments need attention** (NEW)

\`\`\`
## ⚠ PR Feedback Pending

**PR #{PR_NUMBER}** has {TOTAL_PR_COMMENTS} unaddressed comments.

Review decision: {REVIEW_DECISION}

| Type    | Count             |
| ------- | ----------------- |
| Review  | {REVIEW_COMMENTS} |
| General | {ISSUE_COMMENTS}  |

**Process with agent swarm:**
\`/pr-address\`

**Or process specific category:**
\`/pr-address --category=security\`

**Skip for now:**
\`/progress --skip-pr\` (continue to normal routing)
\`\`\`

**Route A: Unexecuted plan exists**

\`\`\`
## ▶ Next Up

**{phase}-{plan}: [Plan Name]** — [objective summary from plan.md]

\`/phase-execute {phase}\`
\`\`\`

**Route B: Phase needs planning**

If context.md exists:

\`\`\`
## ▶ Next Up

**Phase {N}: {Name}** — {Goal from roadmap.md}
✓ Context gathered, ready to plan

\`/phase-plan {phase-number}\`
\`\`\`

If context.md does NOT exist:

\`\`\`
## ▶ Next Up

**Phase {N}: {Name}** — {Goal from roadmap.md}

\`/phase-discuss {phase}\` — gather context and clarify approach

**Also available:**
- \`/phase-plan {phase}\` — skip discussion, plan directly
\`\`\`

**Route C: Phase complete, more phases remain**

\`\`\`
## ✓ Phase {Z} Complete

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from roadmap.md}

\`/phase-discuss {Z+1}\` — gather context and clarify approach
\`\`\`

**Route D: Milestone complete**

\`\`\`
## 🎉 Milestone Complete

All {N} phases finished!

## ▶ Next Up

**Complete Milestone** — archive and prepare for next

\`/milestone-complete\`
\`\`\`

**Route E: UAT gaps need fix plans**

\`\`\`
## ⚠ UAT Gaps Found

**{phase}-UAT.md** has {N} gaps requiring fixes.

\`/phase-plan {phase} --gaps\`
\`\`\`

**Route F: Between milestones**

\`\`\`
## ✓ Milestone v{X.Y} Complete

Ready to plan the next milestone.

## ▶ Next Up

**Start Next Milestone** — questioning → research → requirements → roadmap

\`/milestone-new\`
\`\`\`

## Success Criteria

- [ ] Rich context provided (recent work, decisions, issues)
- [ ] Current position clear with visual progress
- [ ] PR status checked and displayed (if open PR exists)
- [ ] PR comments surfaced with Route G (if unaddressed comments exist)
- [ ] What's next clearly explained
- [ ] Smart routing: /phase-execute if plans exist, /phase-plan if not
- [ ] User confirms before any action
- [ ] Seamless handoff to appropriate vlcn command

## Next Steps

This skill provides intelligent routing based on project state. The "Route" sections above determine the primary action.

**Common follow-ups:**

- \`/help\` — See all available commands
- \`/config-settings\` — Adjust workflow configuration
- \`/session-pause\` — Create handoff if stopping work
</main>
`

export const progressSkill = defineSkill({
    name: 'progress',
    description:
        'Check project progress, show current state, and suggest the next action to take.',
    body: BODY,
})
