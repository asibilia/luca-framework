# progress

Check project progress, show current state, and suggest the next action to take.

## main

<main>
# <%= branding.frameworkName %> Progress

Check project progress, summarize recent work and what's ahead, then intelligently route to the next action - either executing an existing plan or creating the next one.

Provides situational awareness before continuing work.

## Vault Resolution

Read `.planning/config.json` and extract `muninn.vault` as REPO_VAULT. Set DEFAULT_VAULT = "default".

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

Use REPO_VAULT for project-scoped operations (session, metric, brain:project) and DEFAULT_VAULT for cross-cutting operations (pattern, pitfall, preference, brain:user).

## Process

### Step 1: Verify Planning Structure Exists

Use Bash (not Glob) to check—Glob respects .gitignore but .planning/ is often gitignored:

```bash
test -d .planning && echo "exists" || echo "missing"
```

If no `.planning/` directory:

```
No planning structure found.

Run /project-new to start a new project.
```

Exit.

If missing STATE.md: suggest `/project-new`.

**If ROADMAP.md missing but PROJECT.md exists:**
This means a milestone was completed and archived. Go to **Route F** (between milestones).

### Step 2: Load Full Project Context

- Read state from bridge (with STATE.md fallback):

```bash
# Primary: Read state from state machine (typed, validated)
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE_MD=$(cat .planning/STATE.md 2>/dev/null || echo "")
```

- Read `.planning/STATE.md` for living memory (position, decisions, issues)
- Read `.planning/ROADMAP.md` for phase structure and objectives
- Read `.planning/PROJECT.md` for current state (What This Is, Core Value, Requirements)
- Read `.planning/config.json` for settings (model_profile, workflow toggles)

### Step 3: Gather Recent Work Context

- Find the 2-3 most recent SUMMARY.md files
- Extract from each: what was accomplished, key decisions, any issues logged
- This shows "what we've been working on"

### Step 4: Parse Current Position

- From STATE.md: git context (ticket, issue, branch), current phase, plan number, status, task complexity
- Calculate: total plans, completed plans, remaining plans
- Note any blockers or concerns
- Check for CONTEXT.md: For phases without PLAN.md files, check if `{phase}-CONTEXT.md` exists
- Count pending todos: `ls .planning/todos/pending/*.md 2>/dev/null | wc -l`
- Check for active debug sessions: `ls .planning/debug/*.md 2>/dev/null | grep -v resolved | wc -l`

**Check for PR with unaddressed comments:**

```bash
# Check if current branch has an open PR
PR_JSON=$(gh pr view --json number,url,title,reviewDecision 2>/dev/null)

if [ -n "$PR_JSON" ]; then
  PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number')
  PR_TITLE=$(echo "$PR_JSON" | jq -r '.title')
  REVIEW_DECISION=$(echo "$PR_JSON" | jq -r '.reviewDecision // "PENDING"')

  # Count comments
  REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
  REVIEW_COMMENTS=$(gh api "/repos/${REPO}/pulls/${PR_NUMBER}/comments" --jq 'length' 2>/dev/null || echo "0")
  ISSUE_COMMENTS=$(gh api "/repos/${REPO}/issues/${PR_NUMBER}/comments" --jq '[.[] | select(.user.type != "Bot")] | length' 2>/dev/null || echo "0")

  TOTAL_PR_COMMENTS=$((REVIEW_COMMENTS + ISSUE_COMMENTS))
  HAS_PR_COMMENTS=$( [ "$TOTAL_PR_COMMENTS" -gt 0 ] && echo "true" || echo "false" )
else
  HAS_PR_COMMENTS=false
  TOTAL_PR_COMMENTS=0
fi
```

### Step 5: Present Rich Status Report

```
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
- **Action:** `/pr-address` to process

## Recent Work
- [Phase X, Plan Y]: [what was accomplished - 1 line]
- [Phase X, Plan Z]: [what was accomplished - 1 line]

## Current Position
Phase [N] of [total]: [phase-name]
Plan [M] of [phase-total]: [status]
CONTEXT: [✓ if CONTEXT.md exists | - if not]

## Key Decisions Made
- [decision 1 from STATE.md]
- [decision 2]

## Memory Health

Recall recent memory effectiveness metrics from MuninnDB:

\`\`\`
mcp__muninn__muninn_recall(
  vault: REPO_VAULT,
  context: "metric:memory-recall-precision metric:memory-hit-rate current milestone",
  mode: "recent",
  limit: 10
)
\`\`\`

**If no memory metrics are found:** Skip this section entirely. Do not display empty sections or placeholder text.

**If metrics are found**, compute averages across all recalled phase metrics for the current milestone, then display:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Memory Health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Recall Precision : {recall_precision}% ({applied}/{recalled} engrams applied)
  Hit Rate         : {hit_rate}% (phases where memory was useful)
  Token Cost       : {memory_tokens_injected} tokens across {phase_count} phases
  Stale Engrams    : {stale_count} engrams with no positive feedback in 5+ phases

  Status: {healthy|degraded|no_data}
  {If degraded: "Consider running /milestone-complete to prune stale memories"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`

**Health status logic:**
- \`healthy\`: precision >= 0.5 AND stale_count <= 3
- \`degraded\`: precision < 0.5 OR stale_count > 3
- \`no_data\`: no memory metrics found for current milestone

The precision and hit rate values are extracted from the most recent \`metric:memory-recall-precision-*\` and \`metric:memory-hit-rate-*\` engrams. Average across all phases in the current milestone.

## Blockers/Concerns
- [any blockers or concerns from STATE.md]

## What's Next
[Next phase/plan objective from ROADMAP]
```

**Note:** The PR Status section only appears if the current branch has an open PR. If comments exist, it prompts the user to run `/pr-address`.

### Step 6: Route to Next Action

| Condition                       | Meaning                     | Action          |
| ------------------------------- | --------------------------- | --------------- |
| uat_with_gaps > 0               | UAT gaps need fix plans     | Route E         |
| HAS_PR_COMMENTS = true          | PR has unaddressed feedback | Route G         |
| summaries < plans               | Unexecuted plans exist      | Route A         |
| summaries = plans AND plans > 0 | Phase complete              | Check milestone |
| plans = 0                       | Phase not yet planned       | Route B         |

**Route G: PR comments need attention** (NEW)

```
## ⚠ PR Feedback Pending

**PR #{PR_NUMBER}** has {TOTAL_PR_COMMENTS} unaddressed comments.

Review decision: {REVIEW_DECISION}

| Type    | Count             |
| ------- | ----------------- |
| Review  | {REVIEW_COMMENTS} |
| General | {ISSUE_COMMENTS}  |

**Process with agent swarm:**
`/pr-address`

**Or process specific category:**
`/pr-address --category=security`

**Skip for now:**
`/progress --skip-pr` (continue to normal routing)
```

**Route A: Unexecuted plan exists**

```
## ▶ Next Up

**{phase}-{plan}: [Plan Name]** — [objective summary from PLAN.md]

`/phase-execute {phase}`
```

**Route B: Phase needs planning**

If CONTEXT.md exists:

```
## ▶ Next Up

**Phase {N}: {Name}** — {Goal from ROADMAP.md}
✓ Context gathered, ready to plan

`/phase-plan {phase-number}`
```

If CONTEXT.md does NOT exist:

```
## ▶ Next Up

**Phase {N}: {Name}** — {Goal from ROADMAP.md}

`/phase-discuss {phase}` — gather context and clarify approach

**Also available:**
- `/phase-plan {phase}` — skip discussion, plan directly
```

**Route C: Phase complete, more phases remain**

```
## ✓ Phase {Z} Complete

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

`/phase-discuss {Z+1}` — gather context and clarify approach
```

**Route D: Milestone complete**

```
## 🎉 Milestone Complete

All {N} phases finished!

## ▶ Next Up

**Complete Milestone** — archive and prepare for next

`/milestone-complete`
```

**Route E: UAT gaps need fix plans**

```
## ⚠ UAT Gaps Found

**{phase}-UAT.md** has {N} gaps requiring fixes.

`/phase-plan {phase} --gaps`
```

**Route F: Between milestones**

```
## ✓ Milestone v{X.Y} Complete

Ready to plan the next milestone.

## ▶ Next Up

**Start Next Milestone** — questioning → research → requirements → roadmap

`/milestone-new`
```

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

- `/help` — See all available commands
- `/config-settings` — Adjust workflow configuration
- `/session-pause` — Create handoff if stopping work
</main>