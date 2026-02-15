# autopilot

Autonomous orchestrator that drives backlog, roadmap, plan, execute, and milestone workflows with configurable oversight.

## main

<main>
# Luca Autopilot

Autonomous orchestrator that drives the full Luca workflow: backlog scan, WSJF prioritization, roadmap revision, phase planning, execution, and milestone completion — with configurable human oversight levels.

**Arguments:** `[--oversight=flagged|milestone|phase|full-auto] [--skip-backlog] [--max-phases=N] [--dry-run]`

## Sub-agent/Sub-skill Delegation Requirements

This skill is a **meta-orchestrator**. It chains other SKILLS and AGENTS in an autonomous loop.

**Sub-skills invoked (via Skill tool):**

- `phase-discuss` — Context gathering for MODERATE+ phases
- `phase-plan` — Auto-generate PLAN.md files for phases
- `phase-execute` — Full execution pipeline (waves, harness, verification, code review)
- `milestone-complete` — Archive and complete milestones
- `milestone-new` — Start new milestones (if cross_milestone enabled)
- `git-commit` — Commit orchestrator-level changes

**Sub-agents spawned (via Task tool):**

- `lu-cognition` — Cognitive pre-flight at session start
- `lu-router` — Classify complexity for each phase
- `lu-pm-planner` — WSJF scoring and backlog prioritization (extended mode for roadmap revision)

**CRITICAL:** You are an orchestrator. Do NOT execute plans, verify code, or review code yourself. Invoke the appropriate sub-skills and sub-agents as described below.
</main>

## configuration

## Step 0: Configuration & Pre-Flight

### 0a. Read Autopilot Config

```bash
CONFIG=$(cat .planning/config.json 2>/dev/null || echo '{}')
# Primary: Read state from state machine (typed, validated)
STATE_JSON=$(bun run src/state-machine/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE=$(cat .planning/STATE.md 2>/dev/null || echo "")
ROADMAP=$(cat .planning/ROADMAP.md 2>/dev/null || echo "")
```

Extract autopilot settings (with defaults):

```bash
OVERSIGHT=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.autopilot?.oversight ?? 'milestone');
")
MAX_PHASES=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.autopilot?.max_phases_per_session ?? 10);
")
AUTO_PLAN=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.autopilot?.auto_plan_phases ?? true);
")
SKIP_UAT=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.autopilot?.skip_uat_in_autopilot ?? true);
")
GAP_RETRIES=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.autopilot?.gap_closure_retries ?? 1);
")
CROSS_MILESTONE=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.autopilot?.cross_milestone ?? false);
")
BACKLOG_SCAN=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.autopilot?.backlog_scan ?? true);
")
```

### 0b. Apply CLI Flag Overrides

- If `--oversight=<level>` passed: override OVERSIGHT
- If `--max-phases=N` passed: override MAX_PHASES
- If `--skip-backlog` passed: set BACKLOG_SCAN=false
- If `--dry-run` passed: set DRY_RUN=true (display plan, don't execute)

### 0c. Cognitive Pre-Flight

Unless the session already has cognitive context loaded:

```
Task(
  agent: "lu-cognition",
  prompt: "Run cognitive pre-flight for autopilot session. Load BRAIN.md, recall relevant MEMORY.md entries via memory bridge (bun run src/memory/bridge.ts read-memory --tags=planning,workflow,patterns --limit=10), initialize WORKING.md via bridge (bun run src/memory/bridge.ts clear-working)."
)
```

### 0d. Display Session Start

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca AUTOPILOT ► SESSION START
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oversight:     {OVERSIGHT}
Max phases:    {MAX_PHASES}
Auto-plan:     {AUTO_PLAN}
Backlog scan:  {BACKLOG_SCAN}
Cross-milestone: {CROSS_MILESTONE}
```

## backlog_scan

## Step 1: Backlog Scan & Unplanned Detection

**Skip if:** `--skip-backlog` passed OR `BACKLOG_SCAN=false`

### 1a. Read Pending Todos

```bash
TODOS=$(ls .planning/todos/pending/*.md 2>/dev/null || echo "")
TODO_COUNT=$(echo "$TODOS" | grep -c '.' 2>/dev/null || echo "0")
```

If TODO_COUNT == 0: Skip to Step 3 (execute existing roadmap).

### 1b. Read ROADMAP.md

```bash
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md 2>/dev/null || echo "")
```

### 1c. Detect Unplanned Work

For each todo file in `.planning/todos/pending/`:

1. Read the file content
2. Extract `title` from YAML frontmatter (between `---` delimiters)
3. Search ROADMAP_CONTENT for any reference to:
   - The todo's title (case-insensitive substring match)
   - The todo's filename (without .md extension)
4. If neither found: classify as **unplanned**
5. If found in a phase with `- [ ]` plans: classify as **planned but incomplete** (normal)

### 1d. Display Backlog Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca AUTOPILOT ► BACKLOG SCAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ {TODO_COUNT} pending todos found
◆ {UNPLANNED_COUNT} not yet in roadmap
◆ {PLANNED_INCOMPLETE} in roadmap, incomplete
```

If UNPLANNED_COUNT == 0: Skip to Step 3.

## roadmap_revision

## Step 2: Roadmap Revision

**Only runs when unplanned todos exist (Step 1c found UNPLANNED_COUNT > 0).**

### 2a. Spawn lu-pm-planner in Extended Mode

Read all todo contents for the prompt:

```bash
TODO_CONTENTS=""
for f in .planning/todos/pending/*.md; do
  TODO_CONTENTS="$TODO_CONTENTS\n---FILE: $f---\n$(cat "$f")"
done
```

Spawn the prioritizer:

```
Task(
  agent: "lu-pm-planner",
  prompt: """
<planning_context>
**Mode:** roadmap-revision (extended)

**All Pending Todos:**
{TODO_CONTENTS}

**Current ROADMAP.md:**
{ROADMAP_CONTENT}

**Current STATE.md:**
{STATE_CONTENT}

**Instructions:**
1. Score ALL pending todos by WSJF (Business Value + Time Criticality + Risk Reduction / Effort)
2. For todos already referenced in ROADMAP.md: validate their current priority ordering
3. For unplanned todos (not referenced in ROADMAP):
   a. Determine if the todo fits the scope of an existing incomplete phase
   b. If yes: recommend adding it to that phase
   c. If no: group related unplanned todos into proposed new phases with goals
   d. If a todo is COMPLEX/CRITICAL or architecturally distinct: flag it for potential new milestone
4. Return a revised phase ordering with WSJF rationale
5. Provide dependency recommendations for new phases

**Output:** ResultEnvelope with:
- status: "success"
- summary: Human-readable revision proposal
- artifacts: Each proposed change (new phases, reordered phases, todos absorbed)
- issues: Any warnings (dependency conflicts, milestone-worthy items, estimation uncertainty)
</planning_context>
"""
)
```

### 2b. Present Proposed Changes

Display the lu-pm-planner's proposal:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca AUTOPILOT ► ROADMAP REVISION PROPOSAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{summary from lu-pm-planner}

| Change | Detail |
|--------|--------|
| New phases | {count} proposed |
| Reordered | {count} phases |
| Absorbed | {count} todos into existing phases |
| Flagged | {count} items for new milestone |
```

### 2c. Oversight Gate: Approve Changes

- If OVERSIGHT == "full-auto" or "flagged": auto-approve all changes
- If OVERSIGHT == "milestone" or "phase": present changes and ask:

```
Options:
  1. Approve all — Apply proposed changes to ROADMAP.md
  2. Review details — Show full breakdown of each change
  3. Approve with modifications — Let me adjust before applying
  4. Skip — Proceed with existing roadmap (ignore unplanned work)
```

### 2d. Apply Changes

If approved:
1. Update ROADMAP.md with new/reordered phases
2. Create phase directories for new phases: `mkdir -p .planning/phases/{NN}-{phase-name}`
3. Commit changes:

```bash
git add .planning/ROADMAP.md .planning/phases/
bun run commit --message="revise roadmap with unplanned backlog items" --type=docs --scope=autopilot --no-push --skip-checks
```

### 2e. GitHub Issue & Branch

**After applying roadmap changes, ensure a GitHub issue and feature branch exist for the milestone.**

Read state from bridge (with STATE.md fallback) and check for existing GitHub issue/ticket:

\`\`\`bash
# Primary: Read state from bridge
STATE_JSON=$(bun run src/state-machine/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
# Check github_issue field from JSON; fallback: grep STATE.md
\`\`\`

**If no issue exists:**

- If OVERSIGHT == "full-auto" or "flagged": auto-create issue and branch
- If OVERSIGHT == "milestone" or "phase": present options (Create / Skip / Abort)

**Auto-create flow:**

1. Extract milestone name from ROADMAP.md (e.g., "v1.4.0 — Developer Experience & Verification")
2. Generate issue body from ROADMAP.md summary + REQUIREMENTS.md summary
3. Create issue:
   ```bash
   gh issue create --title "feat(framework): {milestone-name}" --body "{body}"
   ```
4. Extract issue number from output
5. Create feature branch:
   ```bash
   git checkout -b {issue_number}--{milestone-slug}
   ```
6. Push branch:
   ```bash
   git push -u origin {branch_name}
   ```
7. Update state via bridge:
   \`\`\`bash
   bun run src/state-machine/bridge.ts set-field --field=github_issue --value={issue_number} 2>/dev/null || true
   bun run src/state-machine/bridge.ts set-field --field=branch --value="{branch_name}" 2>/dev/null || true
   bun run src/state-machine/bridge.ts snapshot 2>/dev/null || true
   # Fallback: Update STATE.md directly
   \`\`\`

**If issue already exists:**

- Verify it is still open: `gh issue view {number} --json state`
- Ensure we are on the correct feature branch
- If not on feature branch: `git checkout {branch_name}` or create it
- Continue to Step 3

## execution_order

## Step 3: Determine Execution Order

### 3a. Parse Incomplete Phases

Re-read ROADMAP.md (may have been updated in Step 2):

```bash
ROADMAP=$(cat .planning/ROADMAP.md)
```

For each phase in ROADMAP.md:
1. Check if ALL plans are marked `[x]` — if so, phase is complete, skip it
2. Check if any plans are marked `[ ]` — phase has incomplete work
3. Check if no plans are listed — phase needs planning (PLAN.md generation)
4. Build list of incomplete phases

### 3b. Build Dependency Graph

For each incomplete phase, extract `**Depends on:**` line:
- Parse phase numbers from the dependency reference
- Build adjacency list: phase -> [dependent phases]

### 3c. Topological Sort

Sort phases respecting dependencies:
- Phases with no dependencies come first
- Phases whose dependencies are all complete come next
- Phases with incomplete dependencies are deferred until their dependencies complete

### 3d. Apply Max Phases Limit

If MAX_PHASES is set and execution_order length exceeds it:
- Truncate to MAX_PHASES
- Note deferred phases in log

### 3e. Display Execution Plan

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca AUTOPILOT ► EXECUTION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Order | Phase | Goal | Depends On | Status |
|-------|-------|------|------------|--------|
| 1 | {NN} | {goal} | None | Ready |
| 2 | {NN} | {goal} | Phase {X} | Ready |
| ... |

Total: {N} phases to execute
```

If `--dry-run`: Display this plan and EXIT. Do not proceed to execution.

## phase_loop

## Step 4: Phase Execution Loop

**Initialize tracking state:**

```
COMPLETED_PHASES=[]
PARKED_PHASES=[]
PHASE_INDEX=0
```

**For each phase in execution_order:**

### 4a. Dependency Check

Verify all phases listed in `Depends on:` are either:
- Already marked complete in ROADMAP.md, OR
- In COMPLETED_PHASES from this session

If any dependency is in PARKED_PHASES:
- Park this phase too: "Blocked by parked phase {X}"
- Add to PARKED_PHASES
- Continue to next phase

### 4b. Oversight Gate (Phase Level)

- If OVERSIGHT == "phase":

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca AUTOPILOT ► PHASE {NN}: {Name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Goal: {phase goal}
Depends on: {dependencies}
Plans: {plan count or "needs planning"}

Options:
  1. Continue — Plan and execute this phase
  2. Skip — Park this phase and move to next
  3. Stop — End autopilot session
```

Wait for user input. Route by choice.

- If OVERSIGHT == "milestone", "flagged", or "full-auto": auto-continue.

### 4c. Complexity Classification

Spawn lu-router to classify:

```
Task(
  agent: "lu-router",
  prompt: "Classify complexity for Phase {NN}: {phase_goal}. Consider file count, scope, and risk. Output: TRIVIAL, SIMPLE, MODERATE, COMPLEX, or CRITICAL."
)
```

Write complexity via bridge (falls back to STATE.md):

```bash
bun run src/state-machine/bridge.ts transition set-complexity --complexity="{COMPLEXITY}" 2>/dev/null || true
```

### 4d. Discussion (Complexity-Gated)

Read the complexity matrix from config.json for the classified level.

- If discussion == "skip" for this complexity level: skip to 4e
- If discussion == "optional" or "run" or "required":

```
Skill(skill: "phase-discuss", args: "{phase_number}")
```

### 4e. Planning

Check if PLAN.md files already exist for this phase:

```bash
PLAN_COUNT=$(ls .planning/phases/{phase_dir}/*-PLAN.md 2>/dev/null | grep -c '.' || echo "0")
```

If PLAN_COUNT == 0 and AUTO_PLAN == true:

```
Skill(skill: "phase-plan", args: "{phase_number}")
```

If PLAN_COUNT == 0 and AUTO_PLAN == false:
- Park this phase: "No plans and auto_plan disabled"
- Add to PARKED_PHASES
- Continue to next phase

If PLAN_COUNT > 0: skip planning (plans already exist).

### 4f. Execution

Build execution flags:

```bash
EXEC_FLAGS="{phase_number}"
if [ "$SKIP_UAT" = "true" ]; then
  EXEC_FLAGS="$EXEC_FLAGS --skip-uat"
fi
# Note: If OVERSIGHT == "phase", do NOT skip UAT (human available)
if [ "$OVERSIGHT" = "phase" ]; then
  EXEC_FLAGS="{phase_number}"  # No --skip-uat
fi
```

Invoke the full execution pipeline:

```
Skill(skill: "phase-execute", args: "{EXEC_FLAGS}")
```

### 4g. Result Handling

Parse the phase-execute outcome from STATE.md and phase VERIFICATION.md:

```bash
VERIFICATION=$(cat .planning/phases/{phase_dir}/*-VERIFICATION.md 2>/dev/null || echo "")
```

**Route by outcome:**

**If phase passed (verification status: "passed"):**
1. Add to COMPLETED_PHASES
2. Update ROADMAP.md plans to `[x]`
3. Log to WORKING.md via bridge: `bun run src/memory/bridge.ts append-working --section=findings --content="{timestamp} [PHASE-COMPLETE] Phase {NN} passed"`
4. Display:

```
◆ Phase {NN}: {Name} — PASSED ✓
```

5. Continue to next phase

**If gaps found (verification status: "gaps_found"):**
1. Attempt gap closure (up to GAP_RETRIES times):

```
Skill(skill: "phase-plan", args: "{phase_number} --gaps")
Skill(skill: "phase-execute", args: "{phase_number} --gaps-only --skip-uat")
```

2. Re-check verification
3. If still failing after GAP_RETRIES:
   - If OVERSIGHT == "flagged" or "phase": PAUSE and present failure to user
   - If OVERSIGHT == "milestone" or "full-auto": park phase

**If human_needed (verification requires manual check):**
- If OVERSIGHT == "phase" or "flagged": PAUSE and present to user
- If OVERSIGHT == "milestone" or "full-auto": park phase with reason "requires human verification"

**If CRITICAL code review issues found:**
- Always PAUSE regardless of oversight (safety gate)
- Present issues and options: Fix / Park / Stop

### 4h. Learning Capture

After each phase (per complexity gating):
- TRIVIAL: skip
- SIMPLE: brief
- MODERATE+: standard/full

Learning is already handled by phase-execute internally. No additional action needed here.

### 4i. Progress Display

After each phase:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca AUTOPILOT ► PROGRESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Completed: {COMPLETED_PHASES count}/{total}
Parked:    {PARKED_PHASES count}
Remaining: {remaining count}
```

Increment PHASE_INDEX and continue loop.

## milestone_gate

## Step 5: Milestone Boundary

After all phases in the execution order have been attempted (completed or parked):

### 5a. Milestone Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca AUTOPILOT ► MILESTONE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Milestone: {milestone name}

| Phase | Status | Notes |
|-------|--------|-------|
| {NN} | Passed ✓ | — |
| {NN} | Parked ⏸ | {reason} |

Completed: {N}/{total}
Parked: {N} phase(s)
```

### 5b. Milestone Completion Decision

**If ALL phases passed (no parked phases):**

- If OVERSIGHT == "full-auto":
  - Auto-invoke: `Skill(skill: "milestone-complete")`
  - If CROSS_MILESTONE == true: proceed to Step 6
  - If CROSS_MILESTONE == false: proceed to Step 7 (final summary)

- If OVERSIGHT == "flagged":
  - Auto-invoke: `Skill(skill: "milestone-complete")`
  - Proceed to Step 7

- If OVERSIGHT == "milestone" or "phase":

```
Milestone complete! All {N} phases passed.

Options:
  1. Complete milestone — Archive and finalize
  2. Review — Inspect results before completing
  3. Stop — End session without completing milestone
```

**If some phases were parked:**

- If OVERSIGHT == "full-auto":
  - Log parked phases as issues
  - Do NOT complete the milestone (incomplete)
  - Proceed to Step 7

- If OVERSIGHT == "flagged", "milestone", or "phase":

```
Milestone incomplete: {N} phase(s) parked.

| Parked Phase | Reason |
|-------------|--------|
| {NN} | {reason} |

Options:
  1. Retry parked — Attempt parked phases again
  2. Complete partial — Mark milestone as done with known gaps
  3. Stop — End session, resume later
```

## cross_milestone

## Step 6: Cross-Milestone Loop (Optional)

**Only runs if CROSS_MILESTONE == true AND OVERSIGHT allows it.**

After completing a milestone:

### 6a. Check for Next Milestone

1. Re-scan backlog: `ls .planning/todos/pending/*.md`
2. If pending todos exist: there may be work for a new milestone
3. If no pending todos and ROADMAP has no more milestones: done

### 6b. Start New Milestone

If there is work for a new milestone:

```
Skill(skill: "milestone-new", args: "{auto-generated milestone description}")
```

After milestone-new creates the new roadmap, loop back to Step 1 (backlog scan).

### 6c. Safety Limit

Track total milestones completed in this session. If exceeds 3:
- PAUSE regardless of oversight level
- Display: "3 milestones completed. Continue autopilot?"
- This prevents runaway execution.

## oversight_gates

## Oversight Gate Reference

### Gate Behavior Matrix

| Decision Point | full-auto | flagged | milestone | phase |
|----------------|-----------|---------|-----------|-------|
| Before each phase | continue | continue | continue | PAUSE: Continue/Skip/Stop |
| Phase failure/gaps | park, continue | PAUSE: Retry/Skip/Stop | park, continue | PAUSE: Retry/Skip/Stop |
| CRITICAL code review | PAUSE (safety) | PAUSE | PAUSE | PAUSE |
| Milestone boundary | auto-complete | PAUSE if parked | PAUSE: summary + confirm | PAUSE: summary + confirm |
| Roadmap revision | auto-approve | auto-approve | PAUSE: approve changes | PAUSE: approve changes |

### Oversight Descriptions

| Level | Description |
|-------|-------------|
| `full-auto` | No pauses except CRITICAL safety. Auto-plan, auto-execute, auto-complete. For overnight runs or trusted codebases. |
| `flagged` | Runs autonomously but pauses when issues are detected (gaps, failures, critical reviews). Smart auto mode. |
| `milestone` | Pauses between milestones. Autonomous within a milestone. Default and recommended starting point. |
| `phase` | Pauses after each phase. Most cautious. Phase-by-phase approval. |

### Relationship to Existing Gates

The autopilot overlays its oversight logic on top of the existing `gates` config in `.planning/config.json`. The existing gates act as a floor:

- If a gate is explicitly `false` in config.json: it stays false regardless of oversight
- If a gate is `true` in config.json: the autopilot may suppress the pause based on oversight level

For fully autonomous operation, set all gates to `false` in config.json AND use `--oversight=full-auto`.

## failure_handling

## Failure Handling: Park-and-Continue Strategy

### How Parking Works

When a phase cannot complete:

1. The phase is added to the PARKED_PHASES list with a reason
2. All phases that depend on the parked phase are also automatically parked ("blocked by Phase {X}")
3. Remaining independent phases (no dependency on parked phases) continue executing
4. The milestone is marked incomplete if any phases are parked

### Reasons for Parking

| Reason | Trigger | Oversight Override |
|--------|---------|-------------------|
| Gaps after retries | Verification gaps persist after GAP_RETRIES | flagged/phase: user can retry |
| Human verification needed | Verifier returns "human_needed" | phase: user reviews |
| Blocked by parked phase | Dependency on a previously parked phase | N/A (cascading) |
| No plans, auto-plan disabled | Phase has no PLAN.md and auto_plan=false | N/A |
| CRITICAL code review | Unresolved CRITICAL issues | Always pauses |

### Recovery

Parked phases can be retried by:
1. Running `/autopilot` again — parked phases will be re-attempted
2. Running `/phase-plan {N} --gaps` manually for specific phases
3. Running `/phase-execute {N}` manually after fixing issues

### Cascade Prevention

The dependency check in Step 4a prevents attempting phases whose prerequisites are parked. This avoids wasting execution time on phases that cannot succeed.

## summary

## Step 7: Final Summary

After all phases attempted and milestone boundary handled:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca AUTOPILOT ► SESSION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oversight:  {OVERSIGHT}
Duration:   {session duration}

## Results

| Metric | Count |
|--------|-------|
| Phases completed | {N} |
| Phases parked | {N} |
| Plans generated | {N} |
| Plans executed | {N} |
| Commits made | {N} |

## Completed Phases
{list of completed phases with one-line summaries}

## Parked Phases
{list of parked phases with reasons}

## Remaining Backlog
{count of remaining pending todos}

## Recommended Next Steps
{context-dependent recommendations:
  - If parked phases: "Review parked phases and fix issues, then run /autopilot again"
  - If milestone complete: "Run /milestone-audit to review"
  - If backlog remains: "Run /autopilot to continue with next milestone"
  - If all done: "All work complete. Consider adding new todos or starting a new milestone."}
```

### Update State

1. Update state via bridge (falls back to STATE.md):

```bash
bun run src/state-machine/bridge.ts transition complete-phase 2>/dev/null || true
```

2. Regenerate STATE.md via bridge snapshot:

```bash
bun run src/state-machine/bridge.ts snapshot 2>/dev/null || true
# Fallback: Update STATE.md manually with autopilot session results
```

3. Log final status to WORKING.md via bridge: `bun run src/memory/bridge.ts append-working --section=findings --content="Autopilot session complete"`
4. Commit session metadata:

```bash
git add .planning/STATE.md .planning/WORKING.md .planning/state.json
bun run commit --message="autopilot session complete" --type=docs --scope=autopilot --no-push --skip-checks
```