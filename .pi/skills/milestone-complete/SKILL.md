---
name: milestone-complete
description: Archive a completed milestone, extract learnings, and prepare for the next version.
---

# milestone-complete

Archive a completed milestone, extract learnings, and prepare for the next version.

## main

<main>
# Luca Complete Milestone

Mark milestone complete, archive to milestones/, and update ROADMAP.md and REQUIREMENTS.md.

**Arguments:** `<version>` (e.g., "1.0", "1.1", "2.0")

**Purpose:** Create historical record of shipped version, archive milestone artifacts (roadmap + requirements), and prepare for next milestone.

**Output:** Milestone archived (roadmap + requirements), PROJECT.md evolved, learnings consolidated, git tagged.

## Execution Context

Read these reference files before executing:

- `.cursor/luca/workflows/complete-milestone.md`
- `.cursor/luca/templates/milestone-archive.md`
- `.cursor/luca/workflows/learning-capture.md`

## Learning Consolidation (NEW)

At milestone completion, consolidate all learnings:

### Step 0: Final Learning Extraction

Before archiving, ensure all session learnings are captured:

1. **Check for unextracted session learnings** in MuninnDB:

   ```
   mcp__muninn__muninn_recall(vault: "default", context: "current session context and unextracted findings")
   ```

2. **Invoke lu-learner** if candidate learnings exist

3. **Review milestone-specific insights** in MuninnDB:
   - Patterns that were validated multiple times -> bump to High confidence via `mcp__muninn__muninn_evolve`
   - Decisions that held throughout milestone -> mark as Established
   - Pitfalls that were successfully avoided -> note as Validated

### Step 0.5: Stale Memory Detection and Pruning

Before archiving, analyze memory health and prune stale engrams.

**1. Recall engrams and metrics for the rolling window:**

Recall the last 10 phase metric engrams and all pattern/decision/pitfall engrams with their feedback data:

```
mcp__muninn__muninn_recall(
  vault: "default",
  context: "pattern: decision: pitfall: metric:memory- feedback",
  mode: "deep",
  limit: 100
)
```

**2. Identify stale engrams:**

An engram is "stale" when BOTH conditions are met:

1. 5+ recalls with 0 positive feedback (useful=true) across the rolling window
2. 3+ milestones with no positive feedback

Steps to compute:
a. Recall last 10 phase metric engrams from MuninnDB
b. For each pattern/decision/pitfall engram that appeared in recalls:
   - Count total recalls across phases
   - Count positive feedback instances (useful=true)
   - Group by milestone, count milestones with 0 positive feedback
c. Flag engrams meeting BOTH thresholds

**3. Human review checkpoint:**

If no stale engrams detected, display: "No stale engrams detected. Memory is healthy." and skip to section 5 (consolidation).

If stale engrams found, display them to the developer for review:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > STALE ENGRAM REVIEW — v{version}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{count} stale engrams detected (5+ recalls, 0 positive, 3+ milestones dormant):

| #   | Concept                  | Recalls | Positive | Milestones Dormant |
| --- | ------------------------ | ------- | -------- | ------------------ |
| 1   | pitfall:old-issue        | 7       | 0        | 4                  |
| 2   | pattern:deprecated-flow  | 5       | 0        | 3                  |

[Y] Prune all  [N] Keep all  [S] Select individually
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Handle each response:

- **Y (Prune all):** Delete all listed engrams via `muninn_forget` (see section 4)
- **N (Keep all):** Skip deletion, proceed to section 5 (consolidation)
- **S (Select individually):** Present each engram and ask Y/N per engram, then delete approved ones via `muninn_forget`

**4. Prune after approval:**

For each engram approved for deletion (via Y or S response in section 3):

```
mcp__muninn__muninn_forget(vault: "default", id: "{engram_id}")
```

Note: `muninn_forget` performs a soft-delete with a 7-day recovery window. This is the strongest delete available in MuninnDB. If a mistake is made, the developer can use `muninn_restore` within 7 days to recover the engram.

Stale engrams are deleted (after human approval), not evolved. Evolution is reserved for engrams that are still useful but need content updates.

**5. Consolidate near-duplicates:**

Run `muninn_consolidate` at every milestone boundary, regardless of whether stale engrams were found or pruned:

```
mcp__muninn__muninn_consolidate(vault: "default")
```

This step:
- Merges near-duplicate engrams using MuninnDB's built-in semantic similarity
- Reduces recall noise by collapsing redundant entries
- Runs AFTER pruning to avoid consolidating engrams that were just deleted
- Runs even if no stale engrams were found (deduplication is always valuable)

Log the consolidation result in the pruning report.

**6. Report pruning results:**

Store pruning report as a milestone metric:

```
mcp__muninn__muninn_remember(
  vault: "default",
  concept: "metric:memory-pruning-{milestone_version}",
  content: JSON.stringify({
    stale_detected: {count},
    human_approved_for_deletion: {count},
    forgotten: {count},
    consolidated: {count from muninn_consolidate result},
    total_engrams_analyzed: {count},
    stale_threshold: "5+ recalls, 0 positive, 3+ milestones dormant",
    pruned_at: new Date().toISOString()
  })
)
```

Log a summary after completion:
"Memory maintenance: {stale_detected} stale detected, {forgotten} forgotten (human-approved), {consolidated} consolidated. {total_engrams_analyzed} engrams analyzed."

### Step 1: Archive Milestone Memory

Create milestone-specific memory snapshot in MuninnDB:

```
# Export milestone memory graph for archival
mcp__muninn__muninn_export_graph(vault: "default")
```

Store the export as `.planning/milestones/v{version}-MEMORY-SNAPSHOT.json`.

Include in archive:

- All patterns validated during this milestone
- Key decisions and their outcomes
- Pitfalls discovered and avoided
- Memory effectiveness summary (precision, hit rate, token cost across milestone)

### Step 2: Clean Session State

After archiving, clear session context:

```
mcp__muninn__muninn_forget(vault: "default", id: "session:*")
```

Long-term learnings persist in MuninnDB across milestones.

## State Machine Integration

When updating state during milestone completion, use the bridge CLI as primary with STATE.md fallback:

```bash
# Read current state
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly
STATE_CONTENT=$(cat .planning/STATE.md 2>/dev/null || echo "")
```

After archiving the milestone, reset state for the next milestone:

```bash
# Reset state machine for next milestone
luca-bridge transition --event=RESET 2>/dev/null || true
luca-bridge ensure-init --force 2>/dev/null || true
luca-bridge set-field --field=current_milestone --value="Planning next" 2>/dev/null || true
luca-bridge snapshot 2>/dev/null || true
# Fallback: Update STATE.md directly if bridge unavailable
```

The bridge `snapshot` command automatically preserves the "Previous Milestones" section when regenerating STATE.md. Manually append the completed milestone to "Previous Milestones" before calling snapshot.

## Process

0. **Check for audit:**

   - Look for `.planning/v{version}-MILESTONE-AUDIT.md`
   - If missing or stale: recommend `/milestone-audit` first
   - If audit status is `gaps_found`: recommend `/milestone-gaps` first
   - If audit status is `passed`: proceed

1. **Verify readiness:**

   - Check all phases have completed plans (SUMMARY.md exists)
   - Present milestone scope and stats
   - Wait for confirmation

2. **Gather stats:**

   - Count phases, plans, tasks
   - Calculate git range, file changes, LOC
   - Extract timeline from git log

3. **Extract accomplishments:**

   - Read all phase SUMMARY.md files
   - Extract 4-6 key accomplishments
   - Present for approval

4. **Archive milestone:**

   - Create `.planning/milestones/v{version}-ROADMAP.md`
   - Fill milestone-archive.md template
   - Update ROADMAP.md to one-line summary with link

5. **Archive requirements:**

   - Create `.planning/milestones/v{version}-REQUIREMENTS.md`
   - Mark all v1 requirements as complete
   - Delete `.planning/REQUIREMENTS.md` (fresh one created for next milestone)

6. **Update PROJECT.md:**

   - Add "Current State" section with shipped version
   - Add "Next Milestone Goals" section

7. **Commit and tag:**

   ```bash
   git add .
   bun run commit --message="archive v{version} milestone" --type=chore --scope=milestone --no-push --skip-checks
   git tag -a v{version} -m "[milestone summary]"
   ```

   - Ask about pushing tag

7.5. **Process retrospective:**

### Dashboard (always shown)

Recall process metrics from MuninnDB for the current milestone:

1. Appetite accuracy trend:
   ```
   mcp__muninn__muninn_recall(vault: "default", context: "metric:appetite-accuracy {milestone_version}")
   ```

2. Rework ratio trend:
   ```
   mcp__muninn__muninn_recall(vault: "default", context: "metric:rework-ratio {milestone_version}")
   ```

3. Pre-mortem signal rate trend:
   ```
   mcp__muninn__muninn_recall(vault: "default", context: "metric:signal-rate {milestone_version}")
   ```

4. Agent performance scores:
   ```
   mcp__muninn__muninn_recall(vault: "default", context: "agent:scorecard {milestone_version}")
   ```

Display results as an ASCII table:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > PROCESS RETROSPECTIVE — v{version}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Metric             | Phases | Trend   | Current |
| ------------------ | ------ | ------- | ------- |
| Appetite Accuracy  | {N}    | {trend} | {val}   |
| Rework Ratio       | {N}    | {trend} | {val}   |
| Pre-Mortem Signal  | {N}    | {trend} | {val}   |
| Agent Scores (avg) | {N}    | {trend} | {val}   |

Trend: improving / stable / declining (compare first half vs second half of phases)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If no metric data is found in MuninnDB (first milestone with process data), display:
```
No process metrics found for v{version}. Dashboard will populate after future milestones with process data collection enabled.
```

### Developer Question (gated)

Before asking the question, check graduation criteria:
```
mcp__muninn__muninn_recall(vault: "default", context: "metric:retro-response-rate")
```

Parse the recalled engram:
- If `sample_count >= 10` AND `response_rate < 0.30`: SKIP the question (developer rarely engages). Show dashboard only. Update `metric:retro-response-rate` with `responded: false`.
- Otherwise: proceed with the question.

Ask the developer:
```
Anything to change about how we work? (optional — press Enter to skip)
```

**If developer responds with content:**
- Store as MuninnDB engram:
  ```
  mcp__muninn__muninn_remember(
    vault: "default",
    concept: "process:workflow-change",
    content: "Milestone: v{version}\nFeedback: {developer_response}\nRecorded: {timestamp}"
  )
  ```
- Update retro response rate:
  ```
  mcp__muninn__muninn_evolve(
    vault: "default",
    id: "metric:retro-response-rate",
    content: "sample_count: {N+1}, responses: {M+1}, response_rate: {updated_rate}"
  )
  ```
  If the metric engram does not exist yet, create it with `muninn_remember` instead of `muninn_evolve`.

**If developer skips (presses Enter or says "no"):**
- Update retro response rate (responded: false):
  ```
  mcp__muninn__muninn_evolve(
    vault: "default",
    id: "metric:retro-response-rate",
    content: "sample_count: {N+1}, responses: {M}, response_rate: {updated_rate}"
  )
  ```
  If the metric engram does not exist yet, create it with `muninn_remember`.

8. **Create GitHub milestone:**

   Create a GitHub milestone to match the local milestone archive. This provides visibility in GitHub's milestone tracker and links PRs to their milestone.

   ```bash
   # Create the milestone (closed, since it's already complete)
   gh api repos/{owner}/{repo}/milestones -X POST \
     -f title="v{version} — {milestone title}" \
     -f state="closed" \
     -f due_on="{completion date ISO 8601}" \
     -f description="{summary: phases, plans, commits, files changed, key deliverables}"

   # Attach the milestone PR (if one exists on the current branch)
   PR_NUMBER=$(gh pr list --head "$(git branch --show-current)" --json number --jq '.[0].number')
   if [ -n "$PR_NUMBER" ]; then
     MILESTONE_NUMBER=$(gh api repos/{owner}/{repo}/milestones --jq '.[] | select(.title | startswith("v{version}")) | .number')
     gh api repos/{owner}/{repo}/issues/$PR_NUMBER -X PATCH -f milestone=$MILESTONE_NUMBER
   fi
   ```

   - The milestone description should include: phase count, plan count, commit count, files changed, and 4-6 key deliverables
   - Set `state: "closed"` since the milestone is already complete
   - Set `due_on` to the completion date (last commit date)
   - Attach the branch PR to the milestone if one exists

8.5. **Divergent mode advisory:**

### Milestone Counter

Recall the convergent streak counter from MuninnDB:
```
mcp__muninn__muninn_recall(vault: "default", context: "metric:convergent-streak")
```

If no counter exists, create it with count = 1:
```
mcp__muninn__muninn_remember(
  vault: "default",
  concept: "metric:convergent-streak",
  content: "consecutive_milestones: 1, last_milestone: v{version}, last_updated: {timestamp}"
)
```

If counter exists, increment it:
```
mcp__muninn__muninn_evolve(
  vault: "default",
  id: "metric:convergent-streak",
  content: "consecutive_milestones: {N+1}, last_milestone: v{version}, last_updated: {timestamp}"
)
```

### Graduation Check

Before showing the nudge, check if divergent mode has graduated out:
```
mcp__muninn__muninn_recall(vault: "default", context: "metric:divergent-optin-rate")
```

If `sample_count >= 20` AND `rate < 0.10`: SKIP the nudge entirely. Developer consistently opts out. Update convergent streak and proceed to Step 9.

### Nudge (streak >= 8 AND not graduated out)

If `consecutive_milestones >= 8` AND graduation check passes:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > DIVERGENT MODE ADVISORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You've completed {N} consecutive milestones in convergent
(spec-driven) mode. Consider taking a divergent break:

  - Architecture sketching and exploration
  - Research reading and technology evaluation
  - Product exploration and shaping future work
  - Anything cognitively distinct from spec-driven development

Recommended duration: 1 calendar day (COMPLEX), 2 days (CRITICAL)
No acceptance criteria. No deliverables required.

[Y] Enter divergent mode  [N] Continue convergent work
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**If developer opts IN (Y):**
- Reset convergent streak to 0:
  ```
  mcp__muninn__muninn_evolve(
    vault: "default",
    id: "metric:convergent-streak",
    content: "consecutive_milestones: 0, last_milestone: v{version}, divergent_mode_entered: {timestamp}"
  )
  ```
- Update divergent opt-in rate (opted_in: true):
  ```
  mcp__muninn__muninn_evolve(
    vault: "default",
    id: "metric:divergent-optin-rate",
    content: "sample_count: {N+1}, optins: {M+1}, rate: {updated_rate}"
  )
  ```
  If the metric does not exist yet, create it with `muninn_remember`.
- Set cooldown reason via bridge:
  ```bash
  luca-bridge set-field \
    --field=cooldown_reason \
    --value='"Divergent mode: {N} consecutive milestones completed"' \
    2>/dev/null || true
  ```
- Emit COOLDOWN_COMPLETE via bridge to transition complete -> cooldown:
  ```bash
  luca-bridge transition \
    --event=COOLDOWN_COMPLETE 2>/dev/null || true
  ```
- Display: "Entering divergent mode. When ready to return, start a new session."

**If developer opts OUT (N):**
- Update divergent opt-in rate (opted_in: false):
  ```
  mcp__muninn__muninn_evolve(
    vault: "default",
    id: "metric:divergent-optin-rate",
    content: "sample_count: {N+1}, optins: {M}, rate: {updated_rate}"
  )
  ```
  If the metric does not exist yet, create it with `muninn_remember`.
- Emit SKIP_COOLDOWN via bridge to transition complete -> idle:
  ```bash
  luca-bridge transition \
    --event=SKIP_COOLDOWN 2>/dev/null || true
  ```
- Proceed to Step 9.

### No Nudge (streak < 8)

If `consecutive_milestones < 8`: do not show the nudge. Silently emit SKIP_COOLDOWN:

```bash
luca-bridge transition \
  --event=SKIP_COOLDOWN 2>/dev/null || true
```

Proceed to Step 9.

9. **Offer next steps:**
   - `/milestone-new` — start next milestone

## Success Criteria

- [ ] Milestone archived to `.planning/milestones/v{version}-ROADMAP.md`
- [ ] Requirements archived to `.planning/milestones/v{version}-REQUIREMENTS.md`
- [ ] `.planning/REQUIREMENTS.md` deleted (fresh for next milestone)
- [ ] ROADMAP.md collapsed to one-line entry
- [ ] PROJECT.md updated with current state
- [ ] Git tag v{version} created
- [ ] Commit successful
- [ ] GitHub milestone created (closed) and PR attached
- [ ] Process retrospective dashboard shown with metric trends
- [ ] Developer question asked (or skipped per graduation criteria)
- [ ] Retro response rate tracked in MuninnDB
- [ ] Divergent mode advisory shown (if streak >= 8)
- [ ] Convergent streak counter updated in MuninnDB
- [ ] Divergent opt-in rate tracked in MuninnDB
- [ ] Stale engrams reviewed by developer (if any found)
- [ ] Near-duplicates consolidated via muninn_consolidate
- [ ] Memory pruning report stored in MuninnDB

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Ready for next milestone | Start new milestone | `/milestone-new` |
| Want to review completion | Check progress | `/progress` |
| Need to create PR | Create pull request | Run `gh pr create` |
| Opted into divergent mode | Take a break | No command — start new session when ready |

**Primary:** `/milestone-new` — Start the next milestone cycle

**Also available:**

- `/progress` — Review completed work
- `/help` — See all available commands
</main>