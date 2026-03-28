/**
 * lu-phase-loop Sub-Skill — Phase loop, milestone gate, and session summary.
 *
 * Extracts the execution order, phase loop, milestone gate, cross-milestone,
 * failure handling, oversight gates, and summary sections from the monolithic
 * lu skill. This is the LARGEST sub-skill (~500+ lines) but follows the todo
 * spec decomposition exactly per CONTEXT.md Decision #2.
 *
 * **Responsibility:** Determine execution order from the roadmap, execute phases
 * (serial and parallel paths), check milestone gate, handle cross-milestone
 * continuation, and generate the session summary.
 *
 * **Input:** None (reads roadmap and config from context file and filesystem)
 * **Output:** Populated `lu_phase_loop` section in `/tmp/lu-context.json`
 *
 * This skill invokes sub-skills (phase-discuss, phase-plan, phase-execute,
 * milestone-complete, milestone-new, git-commit) and sub-agents (lu-router,
 * lu-planner, lu-executor) for the execution pipeline.
 *
 * @see .planning/phases/224-anti-skip-rollout/04-PLAN.md Task 6
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const luPhaseLoopConfig: SkillConfig = {
  frontmatter: {
    name: "lu-phase-loop",
    description:
      "Execute the phase loop, check milestone gate, and generate session summary for the lu sub-skill chain.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# lu-phase-loop — Phase Execution, Milestone Gate, Summary

Determine execution order, execute phases (serial + parallel), check milestone gate, handle cross-milestone, and generate session summary. Write results to the shared context file.

## Context File Protocol

This sub-skill is part of the lu chain. It reads/writes the shared context file at \`/tmp/lu-context.json\`.

**Read:** Call \`readLuContext()\` from \`src/skills/__schemas/lu-context.schemas.ts\`. If \`success: false\`, ABORT immediately.

**Write:** Call \`writeLuContext({ lu_phase_loop: { ... } })\` to populate the \`lu_phase_loop\` section.

## Sub-Agent Delegation

**Skill tool** — for workflow sub-skills:
- \`phase-discuss\` — Context gathering for all phases
- \`phase-plan\` — Auto-generate PLAN.md files for phases
- \`phase-execute\` — Full execution pipeline (waves, harness, verification, code review)
- \`milestone-complete\` — Archive and complete milestones
- \`milestone-new\` — Start new milestones (if cross_milestone enabled)
- \`git-commit\` — Commit orchestrator-level changes

**Task tool** — for specialized agents:
- \`lu-router\` — Classify complexity for each phase
- \`lu-planner\` — Generate PLAN.md (parallel planning)
- \`lu-executor\` — Execute plans (parallel execution)

### Model Resolution

Resolve models before spawning agents:

\`\`\`bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
\`\`\`

| Agent       | quality | balanced | budget |
| ----------- | ------- | -------- | ------ |
| lu-verifier | sonnet  | sonnet   | haiku  |
| lu-learner  | sonnet  | haiku    | haiku  |
| lu-planner  | opus    | opus     | sonnet |
| lu-executor | opus    | sonnet   | sonnet |

## CRITICAL CONSTRAINTS

1. **You are an orchestrator.** Do NOT execute plans, verify code, or review code yourself. Invoke the appropriate sub-skills and sub-agents.
2. **Every step is a binding instruction, not a suggestion.** You MUST NOT skip, simplify, or substitute workflow steps.
3. **If a step says to use TeamCreate, you MUST use TeamCreate.** Do not replace with parallel Task calls.
4. **NEVER write code directly.** All code changes happen through \`Skill(skill: "phase-execute")\`.
5. **The phase pipeline is inviolable: classify -> discuss -> plan -> execute.** Every phase MUST pass through these steps in order.
6. **current_state Tracking:** Write \`current_state\` to the lu context file via \`writeLuContext({ current_state: "..." })\` after each major phase-loop transition. The pre-step hook reads this field to validate sub-skill ordering.
</main>`,
      order: 1,
    },
    {
      title: "execution_order",
      content: `## Step 3: Determine Execution Order

### 3a. Parse Incomplete Phases

Re-read ROADMAP.md (may have been updated by lu-backlog):

\`\`\`bash
ROADMAP=$(cat .planning/ROADMAP.md)
\`\`\`

For each phase in ROADMAP.md:
1. Check if ALL plans are marked \`[x]\` — if so, phase is complete, skip it
2. Check if any plans are marked \`[ ]\` — phase has incomplete work
3. Check if no plans are listed — phase needs planning (PLAN.md generation)
4. Build list of incomplete phases

### 3b. Build Dependency Graph

For each incomplete phase, extract \`**Depends on:**\` line:
- Parse phase numbers from the dependency reference
- Build adjacency list: phase -> [dependent phases]

### 3c. Topological Sort

Sort phases respecting dependencies:
- Phases with no dependencies come first
- Phases whose dependencies are all complete come next
- Phases with incomplete dependencies are deferred

### 3d. Group Independent Phases (Swarm Detection)

If SWARM_ENABLED == true:

Group phases into "levels" based on the dependency DAG:
- **Level 0**: phases with no dependencies (or all deps already complete)
- **Level 1**: phases whose only dependencies are Level 0 phases
- **Level N**: phases whose dependencies are all in levels 0..N-1

For each level with 2+ phases:
- Mark as **PARALLEL** — will use agent team
- Cap group size at MAX_PARALLEL (excess overflow to a new group)

For each level with 1 phase:
- Mark as **SERIAL** — will execute normally via Steps 4a-4i

If SWARM_ENABLED == false:
- Every level contains exactly 1 phase — all execution is serial

### 3e. Apply Max Phases Limit

If MAX_PHASES is set and total phase count exceeds it:
- Truncate levels to fit within MAX_PHASES
- Note deferred phases in log

### 3f. Display Execution Plan

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > EXECUTION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Level | Phases | Mode | Depends On |
|-------|--------|------|------------|
| 0 | Phase 87, 88, 89 | PARALLEL (team) | None |
| 1 | Phase 90 | SERIAL | Level 0 |
| 2 | Phase 91, 92 | PARALLEL (team) | Level 1 |

Total: {N} phases across {L} levels
Parallel levels: {P} (will use agent teams)
\`\`\`

If \`--dry-run\`: Display this plan and EXIT. Do not proceed to execution.`,
      order: 2,
    },
    {
      title: "phase_loop",
      content: `## Step 4: Level-Based Execution Loop

**Initialize tracking state:**

\`\`\`
COMPLETED_PHASES=[]
PARKED_PHASES=[]
LEVEL_INDEX=0
\`\`\`

**For each level in execution_levels (from Step 3d):**

Check the level's mode:
- If **SERIAL** (1 phase): execute via Steps 4a-4i (existing serial path)
- If **PARALLEL** (2+ phases, SWARM_ENABLED): execute via Steps 4-swarm-a through 4-swarm-h

> **MANDATORY:** When the level mode is PARALLEL, you MUST use TeamCreate to create an agent team and spawn teammates via Task with \`team_name\`. Do NOT substitute with individual Task calls.

---

### Serial Execution Path (Steps 4a-4i)

Used for single-phase levels OR when SWARM_ENABLED == false.

### 4a. Dependency Check

Verify all phases listed in \`Depends on:\` are either:
- Already marked complete in ROADMAP.md, OR
- In COMPLETED_PHASES from this session

If any dependency is in PARKED_PHASES:
- Park this phase too: "Blocked by parked phase {X}"
- Add to PARKED_PHASES
- Continue to next phase

### 4b. Oversight Gate (Phase Level)

- If OVERSIGHT == "phase":

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > PHASE {NN}: {Name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Goal: {phase goal}
Depends on: {dependencies}
Plans: {plan count or "needs planning"}

Options:
  1. Continue — Plan and execute this phase
  2. Skip — Park this phase and move to next
  3. Stop — End session
\`\`\`

Wait for user input. Route by choice.

- If OVERSIGHT == "milestone", "flagged", or "full-auto": auto-continue.

### 4c. Complexity Classification (MANDATORY)

**STOP-CHECK: Before this step, you should have completed 4a (dependency check) and 4b (oversight gate). If you have not, go back.**

Spawn lu-router to classify:

\`\`\`
Task(
  agent: "lu-router",
  prompt: "**Recipient:** lu orchestrator (report classification back to this orchestrator)\\n\\nClassify complexity for Phase {NN}: {phase_goal}. Consider file count, scope, and risk. Output: TRIVIAL, SIMPLE, MODERATE, COMPLEX, or CRITICAL."
)
\`\`\`

Write complexity via bridge:

\`\`\`bash
luca-bridge transition --event=ROUTE_COMPLETE --data='{"complexity":"{COMPLEXITY}"}' 2>/dev/null || true
\`\`\`

**IMPORTANT: The complexity result determines model tiers and iteration counts only. It does NOT allow skipping any subsequent steps. ALL phases proceed through 4d -> 4e -> 4f regardless of complexity.**

### 4d. Discussion (MANDATORY — No Exceptions)

**You MUST call this Skill tool invocation. This step has no skip condition.**

Resolve premortem gate before invoking phase-discuss:

\`\`\`bash
PREMORTEM_FLAG=""
PREMORTEM_ENABLED=$(luca-bridge gate-check --gate=premortem 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.enabled)" 2>/dev/null || echo "false")
if [ "$PREMORTEM_ENABLED" = "true" ]; then
  PREMORTEM_FLAG="--run-premortem"
else
  PREMORTEM_FLAG="--skip-premortem"
fi
\`\`\`

\`\`\`
Skill(skill: "phase-discuss", args: "{phase_number} $PREMORTEM_FLAG")
\`\`\`

Transition state machine after discussion:

\`\`\`bash
luca-bridge transition --event=DISCUSS_COMPLETE 2>/dev/null || true
\`\`\`

**Write state:**
\`\`\`typescript
await writeLuContext({ current_state: "executing" });
\`\`\`

### 4e. Planning (MANDATORY — No Exceptions)

**You MUST ensure PLAN.md files exist before proceeding to execution. phase-execute WILL FAIL without them.**

Check if PLAN.md files already exist:

\`\`\`bash
PLAN_COUNT=$(ls .planning/phases/{phase_dir}/*-PLAN.md 2>/dev/null | grep -c '.' || echo "0")
\`\`\`

If PLAN_COUNT == 0 and AUTO_PLAN == true:

\`\`\`
Skill(skill: "phase-plan", args: "{phase_number}")
\`\`\`

If PLAN_COUNT == 0 and AUTO_PLAN == false:
- Park this phase: "No plans and auto_plan disabled"
- Add to PARKED_PHASES
- Continue to next phase

If PLAN_COUNT > 0: skip planning (plans already exist).

**STOP-CHECK: Verify PLAN.md files now exist. If they do not, do NOT proceed to 4f.**

Transition state machine:

\`\`\`bash
luca-bridge transition --event=PLAN_COMPLETE 2>/dev/null || true
\`\`\`

**Write state:**
\`\`\`typescript
await writeLuContext({ current_state: "executing" });
\`\`\`

### 4f. Execution (MANDATORY — Via Sub-Skill Only)

**You MUST invoke phase-execute via Skill tool. Do NOT write, edit, or modify any project files yourself.**

Build execution flags:

\`\`\`bash
EXEC_FLAGS="{phase_number}"
if [ "$SKIP_UAT" = "true" ]; then
  EXEC_FLAGS="$EXEC_FLAGS --skip-uat"
fi
if [ "$OVERSIGHT" = "phase" ]; then
  EXEC_FLAGS="{phase_number}"
fi
\`\`\`

Resolve process_data gate:

\`\`\`bash
PROCESS_DATA_FLAG=""
PROCESS_DATA_ENABLED=$(luca-bridge gate-check --gate=process_data 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.enabled)" 2>/dev/null || echo "false")
if [ "$PROCESS_DATA_ENABLED" = "true" ]; then
  PROCESS_DATA_FLAG="--run-process-data"
else
  PROCESS_DATA_FLAG="--skip-process-data"
fi
EXEC_FLAGS="$EXEC_FLAGS $PROCESS_DATA_FLAG"
\`\`\`

\`\`\`
Skill(skill: "phase-execute", args: "{EXEC_FLAGS}")
\`\`\`

**NEVER substitute this Skill call with direct file writes.**

**Write state after execution:**
\`\`\`typescript
await writeLuContext({ current_state: "executing" });
\`\`\`

### 4g. Result Handling

Parse the phase-execute outcome from STATE.md and VERIFICATION.md:

\`\`\`bash
VERIFICATION=$(cat .planning/phases/{phase_dir}/*-VERIFICATION.md 2>/dev/null || echo "")
\`\`\`

**Route by outcome:**

**If phase passed (verification status: "passed"):**
1. Add to COMPLETED_PHASES
2. Update ROADMAP.md plans to \`[x]\`
3. Log to MuninnDB session memory
4. Continue to next phase

**If gaps found (verification status: "gaps_found"):**
1. Attempt gap closure (up to GAP_RETRIES times):
   \`\`\`
   Skill(skill: "phase-plan", args: "{phase_number} --gaps")
   Skill(skill: "phase-execute", args: "{phase_number} --gaps-only --skip-uat")
   \`\`\`
2. Re-check verification
3. If still failing after GAP_RETRIES:
   - If OVERSIGHT == "flagged" or "phase": PAUSE and present to user
   - If OVERSIGHT == "milestone" or "full-auto": park phase

**If human_needed:**
- If OVERSIGHT == "phase" or "flagged": PAUSE and present to user
- If OVERSIGHT == "milestone" or "full-auto": park phase

**If CRITICAL code review issues found:**
- Always PAUSE regardless of oversight (safety gate)

### 4h. Learning Capture

Learning is already handled by phase-execute internally. No additional action needed here.

### 4i. Progress Display

After each phase:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > PROGRESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Completed: {COMPLETED_PHASES count}/{total}
Parked:    {PARKED_PHASES count}
Remaining: {remaining count}
\`\`\`

---

### Parallel Execution Path (Swarm Mode)

Used for levels with 2+ independent phases when SWARM_ENABLED == true.

### 4-swarm-a. Oversight Gate (Parallel Level)

- If OVERSIGHT == "phase": present parallel level and ask user
- If OVERSIGHT == "milestone", "flagged", or "full-auto": auto-continue

### Phase A: Parallel Planning with Lead Review Gate

### 4-swarm-b. Create Planning Team

\`\`\`
TeamCreate(
  team_name: "lu-plan-L{N}-{timestamp}",
  description: "Parallel planning for {count} independent phases"
)
\`\`\`

### 4-swarm-c. Spawn Planning Teammates (in parallel)

Each planner explores the codebase and generates a PLAN.md. They do NOT write code.

\`\`\`
For each phase (in parallel, using Task tool):
  Task(
    team_name: "lu-plan-L{N}-{timestamp}",
    name: "planner-{NN}",
    subagent_type: "lu-planner",
    prompt: "Plan Phase {NN}: {goal}. Create PLAN.md with goal-backward analysis, atomic tasks, wave grouping."
  )
\`\`\`

### 4-swarm-d. Lead Reviews All Plans Together

After all planners complete, shutdown the planning team. Then perform cross-plan review:
1. **Conflicting file modifications**: merge plans or demote to serial
2. **Shared utility opportunities**: note for first executor
3. **API contract alignment**: order plans or demote to serial

### Phase B: Parallel Execution

### 4-swarm-e. Create Execution Team

\`\`\`
TeamCreate(
  team_name: "lu-exec-L{N}-{timestamp}",
  description: "Parallel execution of {count} reviewed plans"
)
\`\`\`

### 4-swarm-f. Spawn Execution Teammates (in parallel)

\`\`\`
For each phase with an approved plan:
  Task(
    team_name: "lu-exec-L{N}-{timestamp}",
    name: "executor-{NN}",
    subagent_type: "lu-executor",
    isolation: "worktree",
    prompt: "Execute Phase {NN} plan in isolated worktree."
  )
\`\`\`

### 4-swarm-g. Monitor Execution

- Teammate messages are auto-delivered
- On completion: log progress
- On error: mark phase as FAILED, continue monitoring others
- Timeout: 30 min no progress -> status check, 10 min more -> TIMED_OUT

### 4-swarm-h. Merge and Verify

After all executors complete:
1. Merge each worktree branch sequentially
2. Run post-merge harness after each merge
3. If harness fails: attempt fix (max 2 iterations), then revert and park
4. Final full harness after all merges

### 4-swarm-i. Cleanup Level

1. Shutdown teammates and TeamDelete
2. Update ROADMAP.md
3. Add completed/failed phases to tracking
4. Update state via bridge
5. Log to MuninnDB session memory

### 4-swarm-j. Level Progress Display

Display level results table and continue to next level.`,
      order: 3,
    },
    {
      title: "milestone_gate",
      content: `## Step 5: Milestone Boundary

After all phases attempted (completed or parked):

### 5a. Milestone Summary

Display milestone summary table with all phase results.

### 5b. Milestone Completion Decision

**If ALL phases passed (no parked phases):**

- If OVERSIGHT == "full-auto":
  - Auto-invoke: \`Skill(skill: "milestone-complete")\`
  - If CROSS_MILESTONE == true: proceed to Step 6
  - If CROSS_MILESTONE == false: proceed to Step 7

- If OVERSIGHT == "flagged":
  - Auto-invoke: \`Skill(skill: "milestone-complete")\`
  - Proceed to Step 7

- If OVERSIGHT == "milestone" or "phase":
  Present options: Complete milestone / Review / Stop

**Write state after milestone-complete:**
\`\`\`typescript
await writeLuContext({ current_state: "complete" });
\`\`\`

**If some phases were parked:**

- If OVERSIGHT == "full-auto":
  - Log parked phases as issues
  - Do NOT complete the milestone (incomplete)
  - Proceed to Step 7

- If OVERSIGHT == "flagged", "milestone", or "phase":
  Present options: Retry parked / Complete partial / Stop`,
      order: 4,
    },
    {
      title: "cross_milestone",
      content: `## Step 6: Cross-Milestone Loop (Optional)

**Only runs if CROSS_MILESTONE == true AND OVERSIGHT allows it.**

### 6a. Check for Next Milestone

1. Re-scan backlog: \`ls .planning/todos/pending/*.md\`
2. If pending todos exist: there may be work for a new milestone
3. If no pending todos: done

### 6b. Start New Milestone

\`\`\`
Skill(skill: "milestone-new", args: "{auto-generated milestone description}")
\`\`\`

After milestone-new creates the new roadmap, loop back to Step 1 (backlog scan) by re-invoking lu-backlog and then lu-phase-loop.

### 6c. Safety Limit

Track total milestones completed. If exceeds 3:
- PAUSE regardless of oversight level
- Display: "3 milestones completed. Continue?"`,
      order: 5,
    },
    {
      title: "oversight_gates",
      content: `## Oversight Gate Reference

### Gate Behavior Matrix

| Decision Point | full-auto | flagged | milestone | phase |
|----------------|-----------|---------|-----------|-------|
| Before each phase | continue | continue | continue | PAUSE |
| Before parallel level | continue | continue | continue | PAUSE |
| Phase failure/gaps | park, continue | PAUSE | park, continue | PAUSE |
| Teammate failure | skip phase | PAUSE | skip phase | PAUSE |
| Merge conflict | auto-resolve or skip | PAUSE | skip phase | PAUSE |
| CRITICAL code review | PAUSE (safety) | PAUSE | PAUSE | PAUSE |
| Milestone boundary | auto-complete | PAUSE if parked | PAUSE | PAUSE |
| Roadmap revision | auto-approve | auto-approve | PAUSE | PAUSE |

### Oversight Descriptions

| Level | Description |
|-------|-------------|
| \`full-auto\` | No pauses except CRITICAL safety. For overnight runs. |
| \`flagged\` | Autonomous but pauses on issues. Smart auto mode. |
| \`milestone\` | Pauses between milestones. Default. |
| \`phase\` | Pauses after each phase. Most cautious. \`--ask\` shorthand. |`,
      order: 6,
    },
    {
      title: "failure_handling",
      content: `## Failure Handling: Park-and-Continue Strategy

### How Parking Works

When a phase cannot complete:
1. Added to PARKED_PHASES with a reason
2. All dependent phases are also automatically parked
3. Remaining independent phases continue executing
4. Milestone is marked incomplete if any phases are parked

### Reasons for Parking

| Reason | Trigger |
|--------|---------|
| Gaps after retries | Verification gaps persist after GAP_RETRIES |
| Human verification needed | Verifier returns "human_needed" |
| Blocked by parked phase | Dependency on a previously parked phase |
| No plans, auto-plan disabled | Phase has no PLAN.md and auto_plan=false |
| CRITICAL code review | Unresolved CRITICAL issues |
| Teammate timeout | Executor unresponsive for 40+ minutes |
| Teammate error | Executor encountered unrecoverable error |
| Merge conflict | Worktree branch conflicts with feature branch |
| Post-merge harness failure | Tests/types fail after merge (2 fix attempts) |

### Recovery

Parked phases can be retried by:
1. Running \`/lu\` again
2. Running \`/phase-plan {N} --gaps\` manually
3. Running \`/phase-execute {N}\` manually after fixing issues`,
      order: 7,
    },
    {
      title: "summary",
      content: `## Step 7: Final Summary

After all phases attempted and milestone boundary handled:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > SESSION COMPLETE
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
| Parallel levels | {N} |

## Completed Phases
{list of completed phases with one-line summaries}

## Parked Phases
{list of parked phases with reasons}

## Remaining Backlog
{count of remaining pending todos}

## Recommended Next Steps
{context-dependent recommendations}
\`\`\`

### Update State

1. Update state via bridge:
\`\`\`bash
luca-bridge transition --event=COMMIT_COMPLETE 2>/dev/null || true
\`\`\`

2. Regenerate STATE.md:
\`\`\`bash
luca-bridge snapshot 2>/dev/null || true
\`\`\`

3. Log final status to MuninnDB session memory
4. Commit session metadata

### Write Results to Context File

\`\`\`typescript
writeLuContext({
  lu_phase_loop: {
    phases_executed: <count>,
    milestone_gate_checked: true,
    summary_generated: true,
  },
});
\`\`\`

## Completion

After writing results, return to the lu orchestrator. The orchestrator will write \`current_state: "complete"\`.`,
      order: 8,
    },
  ],
};

export const luPhaseLoopSkill = createSkill(luPhaseLoopConfig);
