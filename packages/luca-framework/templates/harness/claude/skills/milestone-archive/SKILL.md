# milestone-archive

Archive milestone, generate stats, and write retrospective for the milestone-complete sub-skill chain.

## main

<main>
# milestone-archive — Archive, Stats, and Retrospective

Execute the bulk of the milestone completion workflow. This sub-skill handles Steps 1 through 7.5 of the original milestone-complete monolith.

## Context File Protocol

This sub-skill is part of the milestone-complete chain. It reads/writes the shared context file at `/tmp/milestone-complete-context.json`.

**Read:** Call `readMilestoneCompleteContext()` from `src/skills/__schemas/milestone-complete-context.schemas.ts`. If `success: false`, ABORT immediately.

**Write:** Call `writeMilestoneCompleteContext({ milestone_archive: { ... } })` to populate the `milestone_archive` section.

## Vault Resolution

```bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
```

## Execution Context

Read these reference files before executing:

- `.claude/<%= branding.nameLowercase %>/workflows/complete-milestone.md`
- `.claude/<%= branding.nameLowercase %>/templates/milestone-archive.md`

## Process

### Step 0: Check for Audit

- Look for `.planning/v{version}-MILESTONE-AUDIT.md` or `.planning/MILESTONE-AUDIT.md`
- If missing or stale: recommend `/milestone-audit` first
- If audit status is `gaps_found`: recommend `/milestone-gaps` first
- If audit status is `passed`: proceed

### Step 1: Archive Milestone Memory

Create milestone-specific memory snapshot in MuninnDB:

```
mcp__muninn__muninn_export_graph(vault: REPO_VAULT)
```

Store the export as `.planning/milestones/v{version}-MEMORY-SNAPSHOT.json`.

Include in archive:
- All patterns validated during this milestone
- Key decisions and their outcomes
- Pitfalls discovered and avoided
- Memory effectiveness summary

### Step 2: Clean Session State

After archiving, clear session context:

```
mcp__muninn__muninn_forget(vault: REPO_VAULT, id: "session:*")
```

Long-term learnings persist in MuninnDB across milestones.

### Step 3: Verify Readiness

- Check all phases have completed plans (SUMMARY.md exists)
- Present milestone scope and stats
- Wait for confirmation

### Step 4: Gather Stats

- Count phases, plans, tasks
- Calculate git range, file changes, LOC
- Extract timeline from git log

### Step 5: Extract Accomplishments

- Read all phase SUMMARY.md files
- Extract 4-6 key accomplishments
- Present for approval

### Step 6: Archive Milestone

- Create `.planning/milestones/v{version}-ROADMAP.md`
- Fill milestone-archive.md template
- Update ROADMAP.md to one-line summary with link

### Step 6.5: Archive Requirements

- Create `.planning/milestones/v{version}-REQUIREMENTS.md`
- Mark all requirements as complete
- Delete `.planning/REQUIREMENTS.md` (fresh one created for next milestone)

### Step 6.7: Update PROJECT.md

- Add "Current State" section with shipped version
- Add "Next Milestone Goals" section

### Step 7: State Machine Integration

When updating state during milestone completion, use the bridge CLI as primary with STATE.md fallback:

```bash
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
STATE_CONTENT=$(cat .planning/STATE.md 2>/dev/null || echo "")
```

After archiving, reset state for the next milestone:

```bash
luca-bridge transition --event=RESET 2>/dev/null || true
luca-bridge ensure-init --force 2>/dev/null || true
luca-bridge set-field --field=current_milestone --value="Planning next" 2>/dev/null || true
luca-bridge snapshot 2>/dev/null || true
```

### Step 7.3: Create GitHub Milestone

```bash
gh api repos/{owner}/{repo}/milestones -X POST \
  -f title="v{version} — {milestone title}" \
  -f state="closed" \
  -f due_on="{completion date ISO 8601}" \
  -f description="{summary: phases, plans, commits, files changed, key deliverables}"

PR_NUMBER=$(gh pr list --head "$(git branch --show-current)" --json number --jq '.[0].number')
if [ -n "$PR_NUMBER" ]; then
  MILESTONE_NUMBER=$(gh api repos/{owner}/{repo}/milestones --jq '.[] | select(.title | startswith("v{version}")) | .number')
  gh api repos/{owner}/{repo}/issues/$PR_NUMBER -X PATCH -f milestone=$MILESTONE_NUMBER
fi
```

### Step 7.5: Process Retrospective

#### Dashboard (always shown)

Recall process metrics from MuninnDB for the current milestone:

1. Appetite accuracy trend
2. Rework ratio trend
3. Pre-mortem signal rate trend
4. Agent performance scores

Display results as ASCII table. If no metric data found, display placeholder message.

#### Developer Question (gated)

Check graduation criteria:
```
mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "metric:retro-response-rate")
```

If `sample_count >= 10` AND `response_rate < 0.30`: SKIP the question. Otherwise ask:
```
Anything to change about how we work? (optional — press Enter to skip)
```

Track response in MuninnDB via `muninn_evolve` on `metric:retro-response-rate`.

### Step 7.9: Write to Context File

```typescript
import { writeMilestoneCompleteContext } from "src/skills/__schemas/milestone-complete-context.schemas";

await writeMilestoneCompleteContext({
  milestone_archive: {
    archived: true,
    stats_generated: true,
    retro_written: true,
    roadmap_archived: "milestones/v{version}-ROADMAP.md",
    requirements_archived: "milestones/v{version}-REQUIREMENTS.md",
    github_milestone_created: true,
    phase_count: phaseCount,
    plan_count: planCount,
    commit_count: commitCount,
  },
});
```

## Output

On success, the context file `milestone_archive` section will contain:

```json
{
  "archived": true,
  "stats_generated": true,
  "retro_written": true,
  "roadmap_archived": "milestones/v8.5.0-ROADMAP.md",
  "requirements_archived": "milestones/v8.5.0-REQUIREMENTS.md",
  "github_milestone_created": true,
  "phase_count": 12,
  "plan_count": 24,
  "commit_count": 156
}
```

## Error Handling

- **Audit missing/failed:** Warn user and recommend running `/milestone-audit` first. Do not ABORT — let user decide.
- **GitHub API failure (milestone creation):** Log warning, set `github_milestone_created: false`, continue. Milestone creation is best-effort.
- **MuninnDB export failure:** Log warning, skip memory snapshot. Continue with file archival.
- **Context file read failure:** ABORT immediately.

## Constraints

- This is the largest sub-skill (~Steps 1-7.5 combined)
- Contains interactive elements (readiness check, accomplishment approval, retro question)
- Must update state machine bridge after archival
- Uses both REPO_VAULT (metrics, session) and DEFAULT_VAULT (process feedback)
</main>