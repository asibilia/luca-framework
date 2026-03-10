# phase-execute

Execute all plans in a phase with wave-based parallelization and harness verification.

## main

<main>
# Luca Execute Phase

Execute all plans in a phase using wave-based parallel execution, then verify with code review and UAT.

Orchestrator stays lean: discover plans, analyze dependencies, group into waves, spawn subagents, collect results. Each subagent loads the full execute-plan context and handles its own plan.

**Arguments:** `<phase-number> [--gaps-only] [--quality-fixes] [--skip-review] [--skip-uat] [--skip-memory] [--skip-replay]`

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- `lu-executor` - Executes individual plans (PARALLEL per wave)
- `lu-verifier` - Verifies phase goal achieved
- `lu-learner` - Extracts learnings after verification
- `dx-advocate` - Code quality review
- `code-simplifier` - DRY and complexity review
- `code-architect` - Architecture review
- `ui` - UI/styling review
- `security-auditor` - Security review (conditional)
- `lu-planner` - Plans fixes for issues (if needed)
- `lu-plan-checker` - Validates fix plans (if needed)
- `lu-test-writer` - Generates test files from plan verification criteria (spawned by lu-executor during TDD cycle)
- `lu-process-data` - Computes process metrics after learning capture (conditional on `process_data` gate)

**DO NOT** attempt to execute plans, verify, or review code yourself. Spawn the appropriate agents.

**Reference:** See `.cursor/luca/references/task-directive.md` for Task() syntax patterns.

## Context-Aware Sub-Agent Spawning (Phase 16+)

Each sub-agent receives only the context documents appropriate for its role and the current task complexity. The orchestrator assembles context per these rules:

**Context Tiers:**
| Tier | Documents Loaded |
|------|-----------------|
| T0 | Plan content only |
| T1 | + project identity summary (from MuninnDB brain:*) |
| T2 | + STATE.md + selective learnings + session context (from MuninnDB) |
| T3 | + full project identity + full learnings + agent summaries (from MuninnDB) |

**Isolation Modes:**
| Mode | Restriction | Used By |
|------|------------|---------|
| none | Full context per tier | lu-executor, lu-planner, lu-learner |
| cold | Only git diff + project identity | dx-advocate, code-simplifier, code-architect |
| warm | Plans + summaries, NO session context | lu-verifier |

**Complexity promotes context:** At MODERATE+, sub-agents may receive one tier higher than their default.

## Execution Context

Read these reference files before executing:

- `.cursor/luca/references/ui-brand.md`
- `.cursor/luca/workflows/execute-phase.md`
- `.cursor/luca/workflows/learning-capture.md`

## Always Verify & Learning Capture (NEW)

**Luca mandates verification at all levels.** After execution completes:

### Verification

Invoke lu-verifier with mode based on phase complexity:

| Phase Scope        | Verification Mode               |
| ------------------ | ------------------------------- |
| Simple (1-2 plans) | Standard verification           |
| Complex (3+ plans) | Full goal-backward verification |

**Verification always runs** - there is no skip option for verification in Luca.

### Learning Capture

After verification (pass or fail):

**MANDATORY**: You MUST spawn a lu-learner sub-agent. Do NOT attempt to capture learnings yourself.

First, read the required context:

**Use deferred recall cache (no redundant MCP calls):** If recall was already performed in Step 4 (via `setCachedRecall()`), reuse the cached results. Otherwise, perform the recall now and cache it.

```typescript
import { hasRecallCache, setCachedRecall } from "~/shared";
import { requestMemoryContext } from "~/shared";

// Reuse cached recall from Step 4 if available (avoids redundant MCP call)
if (!hasRecallCache(SESSION_ID)) {
  // Recall was not done in Step 4 (e.g., --skip-memory was used earlier)
  // Perform recall now for learning context
  const recallResult = mcp__muninn__muninn_recall(
    vault: "default",
    context: "session context, patterns, and decisions for phase {PHASE}"
  );

  setCachedRecall(SESSION_ID, {
    sessionId: SESSION_ID,
    patterns: [/* from recall */],
    decisions: [/* from recall */],
    pitfalls: [/* from recall */],
    findings: [/* from recall */],
    recalledAt: new Date().toISOString(),
  });
}

// Format cached recall for lu-learner
const workingContent = requestMemoryContext({
  agentName: "lu-learner",
  sessionId: SESSION_ID,
  memoryTags: ["*"],
  maxTokens: 500,
});
```

```bash
VERIFICATION_RESULT="[from verifier return value]"
```

Then spawn the learner:

```python
Task(
  prompt="""
<learning_context>

**Phase:** {phase_number}
**Verification Result:** {verification_result}

**Working Memory (session findings):**
{working_content}

**Current Long-Term Memory:**
{memory_content}

</learning_context>

<extraction_targets>
1. **Patterns**: What execution approaches worked well?
2. **Decisions**: What implementation choices were made?
3. **Pitfalls**: What issues were encountered during execution?
4. **Preferences**: What conventions emerged from this phase?
</extraction_targets>

<output_requirements>
- Extract ONLY validated learnings (verified by outcome)
- Write curated insights to MuninnDB via muninn_remember
- Clear session context via muninn_forget after extraction
- Return summary of learnings captured
</output_requirements>

Extract learnings from this phase execution and store in MuninnDB.
""",
  subagent_type="lu-learner",
  model="{learner_model}",
  description="Capture phase learnings"
)
```

**Do NOT proceed until the Task returns.**

**Learning capture always runs.** The lu-learner model tier is resolved from the routing table based on complexity:

| Complexity | Learning Depth                                  | Model Tier (from routing table) |
| ---------- | ----------------------------------------------- | ------------------------------- |
| TRIVIAL    | Standard (spawn with minimal context)           | fast                            |
| SIMPLE     | Standard (spawn with minimal context)           | fast                            |
| MODERATE   | Standard (current behavior)                     | fast                            |
| COMPLEX    | Full (include all working memory)               | fast                            |
| CRITICAL   | Full + debrief (include retrospective analysis) | balanced                        |

For TRIVIAL/SIMPLE: Include only execution summary, not full working memory.
For MODERATE and above: Use the current lu-learner spawn as-is.
For CRITICAL: Add to the lu-learner prompt: "Include a retrospective analysis: what went well, what didn't, what would you do differently?"

The model tier for lu-learner is resolved via `resolveModelForAgent("lu-learner", complexity)` from the centralized routing table in `src/complexity/__helpers/model-routing.ts`.

### Process Data Collection (after Learning Capture)

After lu-learner returns, check the `process_data` gate in `.planning/config.json`:

```bash
PROCESS_DATA_GATE=$(cat .planning/config.json 2>/dev/null | grep -o '"process_data"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

**If `process_data` gate is enabled (`true`):**

Collect metrics data from the orchestrator context and spawn `lu-process-data`:

```python
Task(
  prompt="""
<process_data_context>

**Phase:** {phase_number}
**Milestone:** {milestone_id}
**Complexity:** {complexity_level}

**Appetite Data:**
- Ceiling (tokens): {appetite_ceiling}
- Actual tokens consumed: {actual_tokens}

**Harness Data:**
- Fix iterations used: {harness_fix_iterations}
- Max fix iterations allowed: {max_harness_iterations}

**Pre-Mortem Data:**
- Pre-mortem ran: {true|false}
- Total risks identified: {total_risks}
- Risk categories: {risk_categories_list}
- Verification gaps found: {verification_gaps_list}

**Timing Data:**
- Phase start timestamp: {phase_start_timestamp}
- Final commit timestamp: {commit_timestamp}

**Verification Data:**
- Total harness runs: {total_harness_runs}
- Runs with failures: {runs_with_failures}

</process_data_context>

Compute all applicable process metrics and return structured JSON.
""",
  subagent_type="lu-process-data",
  model="{process_data_model}",
  description="Compute process metrics for phase {phase_number}"
)
```

**Do NOT proceed until the Task returns.**

After lu-process-data returns its JSON output, store each non-null metric as a MuninnDB engram:

```python
# Parse the JSON output from lu-process-data
metrics_json = parse_json(process_data_result)

# Store each non-null metric
for metric_name, value in metrics_json["metrics"].items():
    if value is not None:
        storage_key = metrics_json["storage_keys"][metric_name]
        mcp__muninn__muninn_remember(
            vault="default",
            concept=storage_key,
            content=json.dumps({
                "value": value,
                "phase": metrics_json["phase"],
                "milestone": metrics_json["milestone"],
                "complexity": metrics_json["complexity"],
                "computed_at": metrics_json["computed_at"]
            })
        )
```

Then emit the PROCESS_DATA_COMPLETE transition:

```bash
bun run packages/luca-framework/src/state/bridge.ts transition --event=PROCESS_DATA_COMPLETE 2>/dev/null || true
```

The model tier for lu-process-data is resolved via `resolveModelForAgent("lu-process-data", complexity)` from the centralized routing table.

**If `process_data` gate is disabled (`false`):** Skip process data collection and emit LEARN_COMPLETE as before:

```bash
bun run packages/luca-framework/src/state/bridge.ts transition --event=LEARN_COMPLETE 2>/dev/null || true
```

### Session Logging During Execution

Throughout execution, log findings to MuninnDB:

Log execution progress to MuninnDB:

```
mcp__muninn__muninn_remember(vault: "default", concept: "session:findings", content: "[timestamp] [Plan X complete - finding Y]")
```

Track:

- Execution findings and observations
- Issues encountered and how resolved
- Patterns that worked well (learning candidates)
- Decisions made during implementation

## Process

### 0. Resolve Model Routing

Model routing is handled by `resolveModelForAgent(agentName, complexity)` from `src/complexity/__helpers/model-routing.ts`. See the complexity-gating rule for the routing table summary. No manual profile selection is needed.

### 0.1. Capture Phase Start Commit

Store the current commit hash as the baseline for file-touch tracking during reassessment.

```bash
PHASE_START_COMMIT=$(git rev-parse HEAD)
ALREADY_PROMOTED=false
INITIAL_COMPLEXITY="$COMPLEXITY"
```

These variables are used by Step 4.6 (wave boundary reassessment) and Step 6.5.1 (harness boundary reassessment).

### 0.5. Verify GitHub Tracking (Gate)

**Before executing any plans, verify issue/branch tracking is configured.**

Read STATE.md and check for `GitHub Issue:` line.

**If issue exists and is valid:**

- Extract issue number for commit messages
- Continue to phase validation

**If issue is "None" or missing:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► GITHUB TRACKING MISSING ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No GitHub issue is configured for this milestone.
Commits will not reference issues and PR creation will require manual setup.

1. **Create issue now** — Set up tracking before execution
2. **Continue without tracking** — Proceed anyway (not recommended)
3. **Abort** — Stop and run /milestone-new to set up properly
```

**If "Create issue now" selected:**

1. Generate issue from PROJECT.md Current Milestone + REQUIREMENTS.md
2. Create issue: `gh issue create --title "feat({scope}): {milestone}" --body "{body}"`
3. Create branch: `git checkout -b {issue_number}--{milestone-slug}`
4. Push: `git push -u origin {branch_name}`
5. Update STATE.md
6. Continue execution

**If "Continue without" selected:**

1. Warn: commits will use placeholder `#0` for issue reference
2. Log warning to phase SUMMARY
3. Continue execution

**If "Abort" selected:**

1. Exit with message to run `/milestone-new` or manually create issue

### 0.6. Procedure Replay Check

**Skip if:** `--skip-replay` flag passed.

Before executing plans, check for replayable procedures that match the phase objective. High-confidence procedures (composite score >= 0.7, success_rate >= 0.5, 3+ executions) are surfaced as suggested pre-plans for lu-executor.

```bash
# Read phase objective from ROADMAP.md or plan files
PHASE_OBJECTIVE=$(grep -A 2 "Phase {phase_number}" .planning/ROADMAP.md | tail -1 | sed 's/^[[:space:]]*//')
```

Recall replayable procedures from MuninnDB:

```
REPLAY_RESULT = mcp__muninn__muninn_recall(vault: "default", context: "replayable procedures for $PHASE_OBJECTIVE")
```

Parse the recall result to determine if relevant procedures exist (REPLAY_COUNT).

**If replayable procedures found (REPLAY_COUNT > 0):**

Store `REPLAY_JSON` for injection into lu-executor context. When spawning lu-executor for each plan, include the pre-plans as additional context:

```
<procedure_replay_context>
The following pre-plans are suggested approaches from past successful executions.
They are ADVISORY, not mandatory. Use them as guidance if they match the current task.

{pre_plans from REPLAY_JSON}
</procedure_replay_context>
```

Track which pre-plans were injected for feedback recording in Step 6.7.

**If no replayable procedures found:**

Continue normally. No pre-plan context is injected.

### 1. Validate Phase Exists

- Find phase directory matching argument
- Count PLAN.md files
- Error if no plans found

### 2. Discover Plans

- List all \*-PLAN.md files in phase directory
- Check which have \*-SUMMARY.md (already complete)
- If `--gaps-only`: filter to only plans with `gap_closure: true`
- Build list of incomplete plans

### 3. Group by Wave

- Read `wave` from each plan's frontmatter
- Group plans by wave number
- Report wave structure to user

### 4. Execute Waves

For each wave in order:

- Read plan contents (@ syntax doesn't work across Task boundaries)
- Spawn `lu-executor` for each plan in wave (parallel Task calls)
- Wait for completion
- Verify SUMMARYs created
- **Append wave completion to journal** (persists across context compaction):

```bash
echo '{"wave":{wave_number},"plans":["{plan_01_name}","{plan_02_name}"],"status":"complete","summaries_found":{summaries_count},"ts":"'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'"}' >> {phase_dir}/.wave-progress.jsonl
```

This journal persists across context compaction. On resume, read it to skip already-completed waves.

- Proceed to next wave

#### 4.1. Appetite Budget Guard (per-wave boundary)

Before each wave, check whether the appetite budget has been exhausted:

```bash
# Read appetite state from bridge
APPETITE_JSON=$(bun run packages/luca-framework/src/state/bridge.ts read-status 2>/dev/null || echo '{}')
APPETITE_LEVEL=$(echo "$APPETITE_JSON" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.context?.appetite_level || '')" 2>/dev/null || echo "")
APPETITE_CEILING=$(echo "$APPETITE_JSON" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.context?.appetite_token_ceiling || 0)" 2>/dev/null || echo "0")
APPETITE_USED=$(echo "$APPETITE_JSON" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.context?.appetite_used_tokens || 0)" 2>/dev/null || echo "0")
```

**Guard logic (only fires when appetite is declared and ceiling > 0):**

1. Calculate `percent_used = (appetite_used_tokens / appetite_token_ceiling) * 100`
2. **At 80%** — Log a warning banner and continue:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Luca ► APPETITE WARNING — 80% of {appetite_level} budget consumed
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Used: {appetite_used_tokens} / {appetite_token_ceiling} tokens ({percent_used}%)
   Remaining budget will be consumed in the next wave(s).
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```
3. **At 100%** — PAUSE execution and present options to the developer:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Luca ► APPETITE EXHAUSTED — {appetite_level} budget fully consumed
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Used: {appetite_used_tokens} / {appetite_token_ceiling} tokens (100%+)

   Options:
   1. EXTEND — Increase appetite to next level (adds more budget)
   2. SCOPE-CUT — Reduce remaining scope to fit current budget
   3. HALT — Stop execution, preserve progress
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```
   Wait for developer response before continuing.

4. After each wave completes, update appetite_used_tokens via bridge:
   ```bash
   # Update used tokens after wave completion (estimated from wave results)
   bun run packages/luca-framework/src/state/bridge.ts set-field --field=appetite_used_tokens --value={updated_token_count} 2>/dev/null || true
   ```

**MANDATORY**: You MUST spawn lu-executor sub-agents for each plan. Do NOT attempt to execute plans yourself.

**Pre-wave context budget check** — run this before reading plan contents for each wave:

If the transcript feels large (many agent results already consumed in this session) or the context zone reads as "degrading" or higher, trigger the graceful handoff sequence:

1. Append the current wave state to the JSONL journal using the format above (wave number, plan names, status `"handoff"`, summaries found so far, UTC timestamp).
2. Write `.continue-here.md` to the phase directory:

```
# Continue Here

**Phase:** {phase_number}
**Last completed wave:** {last_completed_wave}
**Completed plans:** {comma_separated_completed_plan_ids}
**Remaining waves:** {comma_separated_remaining_wave_numbers}

## Resume Instructions

Run: `/phase-execute {phase_number}`

The phase-execute skill will read .wave-progress.jsonl to skip already-completed waves and resume from the next incomplete wave.
```

3. Print this banner to the user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Luca ► CONTEXT BUDGET HIGH — GRACEFUL HANDOFF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Context budget is in the HIGH/CRITICAL zone before wave {N}.
Progress saved to .wave-progress.jsonl and .continue-here.md.
Start a fresh session and run /phase-execute {phase_number} to resume.
```

4. Stop.

> **Note:** This is a lighter check than Step 4.5 (which handles the "stop" zone with bridge suspend/resume). This check fires earlier — at "degrading" or higher — to convert a potential compaction crash into a clean handoff before any new work begins. Step 4.5 and its bridge suspend/resume path remain unchanged.

First, read plan contents (required because @ syntax doesn't work across Task boundaries):

```bash
PLAN_01_CONTENT=$(cat "{plan_01_path}")
PLAN_02_CONTENT=$(cat "{plan_02_path}")
PLAN_03_CONTENT=$(cat "{plan_03_path}")
# Primary: Read state from state machine (typed, validated)
STATE_JSON=$(bun run packages/luca-framework/src/state/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE_CONTENT=$(cat .planning/STATE.md)
```

**Load memory context (deferred recall pattern):**

Check if memory has already been recalled this session using the session-scoped recall cache. If not, perform the MuninnDB recall and cache the result. Then format via `requestMemoryContext()`.

```typescript
import { getCachedRecall, setCachedRecall, hasRecallCache } from "~/shared";
import { requestMemoryContext } from "~/shared";

// Step 1: Check cache (keyed by SESSION_ID from STATE.md)
if (!hasRecallCache(SESSION_ID)) {
  // Step 2: First request this session — perform MuninnDB recall
  const recallResult = mcp__muninn__muninn_recall(
    vault: "default",
    context: "patterns, decisions, and pitfalls for phase {PHASE}"
  );

  // Step 3: Parse and cache the recall result
  setCachedRecall(SESSION_ID, {
    sessionId: SESSION_ID,
    patterns: [/* extracted patterns from recall */],
    decisions: [/* extracted decisions from recall */],
    pitfalls: [/* extracted pitfalls from recall */],
    findings: [/* session findings */],
    recalledAt: new Date().toISOString(),
  });
}

// Step 4: Format for sub-agents (cache-first, preferred approach)
const workingContent = requestMemoryContext({
  agentName: "lu-executor",
  sessionId: SESSION_ID,
  memoryTags: ["*"],
  maxTokens: 500,
});
```

**Note:** `requestMemoryContext()` reads the cache populated above and formats it via `buildMemoryContextBlock()` internally. You can still use `buildMemoryContextBlock()` directly if you need custom formatting, but `requestMemoryContext()` is the preferred approach for the deferred pattern.

Then spawn all executors for the wave in PARALLEL (same message, multiple Task calls):

```python
# Wave N executors - these MUST be called in PARALLEL (same message)
Task(
  prompt="""
<execution_context>

**Plan:** {plan_01_name}
**Phase:** {phase_number}
**Wave:** {wave_number}

**Plan Content:**
{plan_01_content}

**Project State:**
{state_content}

**Working Memory:**
{working_content}

</execution_context>

**TDD Mode:** {tdd_enabled_or_disabled — read plan frontmatter for `tdd: true`. If present: "ENABLED", else: "DISABLED (standard execution)"}

<execution_rules>
- Execute each task in the plan sequentially
- Commit atomically after each task (git add . && bun run commit)
- Create SUMMARY.md when complete
- Log findings to MuninnDB session memory
- Handle deviations per deviation rules
- If TDD Mode is ENABLED: follow TDD execution flow (generate tests -> confirm RED -> implement -> confirm GREEN) for each task
- If a task has `testable: false`: skip TDD for that task, execute normally
</execution_rules>

Execute this plan. Return SUMMARY when complete.
""",
  subagent_type="lu-executor",
  model="{executor_model}",
  description="Execute {plan_01_name}"
)

Task(
  prompt="""
<execution_context>

**Plan:** {plan_02_name}
**Phase:** {phase_number}
**Wave:** {wave_number}

**Plan Content:**
{plan_02_content}

**Project State:**
{state_content}

**Working Memory:**
{working_content}

</execution_context>

**TDD Mode:** {tdd_enabled_or_disabled — read plan frontmatter for `tdd: true`. If present: "ENABLED", else: "DISABLED (standard execution)"}

<execution_rules>
- Execute each task in the plan sequentially
- Commit atomically after each task (git add . && bun run commit)
- Create SUMMARY.md when complete
- Log findings to MuninnDB session memory
- Handle deviations per deviation rules
- If TDD Mode is ENABLED: follow TDD execution flow (generate tests -> confirm RED -> implement -> confirm GREEN) for each task
- If a task has `testable: false`: skip TDD for that task, execute normally
</execution_rules>

Execute this plan. Return SUMMARY when complete.
""",
  subagent_type="lu-executor",
  model="{executor_model}",
  description="Execute {plan_02_name}"
)
```

**Do NOT proceed to next wave until all Task calls return.**

### 4.5. Suspend/Resume Support

**Before each wave**, check context usage to decide if suspension is needed:

```bash
# Check context usage zone (context monitoring handled by hooks/MuninnDB)
# The context-check-throttled hook monitors usage automatically.
# For manual checks, read the zone from STATE.md or bridge:
ZONE=$(bun run packages/luca-framework/src/state/bridge.ts read-field --field=context_zone 2>/dev/null | bun -e "const d=JSON.parse(await Bun.stdin.text()); console.log(d.value || 'peak')" 2>/dev/null || echo "peak")
```

**If zone is "stop"** (context exhaustion imminent):

1. **Create checkpoint:** Record current progress so a new session can resume.

```bash
# Suspend with checkpoint via bridge
bun run packages/luca-framework/src/state/bridge.ts suspend \
  --phase={phase_number} \
  --reason=context_exhaustion \
  --wave={current_wave_index} \
  --tasks={comma_separated_completed_task_ids} \
  2>/dev/null || true
```

2. **Write `.continue-here.md`** as a handoff document for the next session:

```
# Continue Here

**Phase:** {phase_number}
**Suspended at wave:** {current_wave_index}
**Reason:** Context exhaustion (zone: stop)
**Completed plans:** {list of completed plan IDs}
**Remaining waves:** {list of remaining wave numbers}

## Resume Instructions

Run: `/phase-execute {phase_number}`

The phase-execute skill will detect the suspend checkpoint and resume
from the last incomplete wave automatically.
```

3. **Stop execution** and inform the user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE SUSPENDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Context usage is in the "stop" zone. Suspending to preserve quality.

Checkpoint saved. Resume in a new session with:
  /phase-execute {phase_number}
```

**On resume** (checkpoint exists for this phase):

At the start of phase execution, check for an existing suspend checkpoint:

```bash
# Check for suspend checkpoint
CHECKPOINT_EXISTS=$(bun run packages/luca-framework/src/state/bridge.ts resume-phase --phase={phase_number} 2>/dev/null && echo "true" || echo "false")
```

If a checkpoint exists:

1. Load the checkpoint to get completed wave index and task IDs
2. Skip waves that were already completed
3. Resume execution from the first incomplete wave
4. Clear the checkpoint after successful phase completion

### 4.6. Complexity Reassessment (Wave Boundary)

**After each wave completes**, check whether complexity should be promoted based on file-touch signal. At wave boundaries, only files_touched is reliably available (harness has not yet run), so iteration_budget_ratio and error_count are set to 0.

**Skip if:** `ALREADY_PROMOTED` is true (max one promotion per phase — CONTEXT.md Decision 1).

Collect the cumulative files touched since phase start:

```bash
# Count files touched since phase start (cumulative, not per-wave)
FILES_TOUCHED=$(git diff --stat "$PHASE_START_COMMIT" HEAD -- | tail -1 | grep -oE '[0-9]+ file' | grep -oE '[0-9]+' || echo "0")
```

Check whether promotion is warranted:

```bash
# Wave boundary: only files_touched signal available
# iteration_budget_ratio=0, stall_detected=false, error_count=0 (harness hasn't run yet)
```

Apply the reassessment logic from `src/complexity/__helpers/reassessment.ts`:

- Call `shouldPromoteComplexity()` with signals: `{ files_touched: $FILES_TOUCHED, iteration_budget_ratio: 0, stall_detected: false, error_count: 0, current_level: $COMPLEXITY }` and `alreadyPromoted: $ALREADY_PROMOTED`.
- If `should_promote` is true:
  1. Update state via bridge: `bun run packages/luca-framework/src/state/bridge.ts set-field --field=complexity --value='"$NEW_LEVEL"'`
  2. Update local variable: `COMPLEXITY="$NEW_LEVEL"`
  3. Set `ALREADY_PROMOTED=true`
  4. Log to MuninnDB session: `mcp__muninn__muninn_remember(vault: "default", concept: "session:findings", content: "[timestamp] [COMPLEXITY-PROMOTED] $REASON")`
  5. Display promotion banner

**Important:** Re-read complexity from the bridge before spawning the next wave's executors (research pitfall #4). The executor model tier will be resolved using the updated complexity level.

Display when promotion occurs:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► COMPLEXITY PROMOTED: {OLD} -> {NEW}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Trigger: {reason}
Subsequent waves will use upgraded model tiers and iteration budgets.
```

### 5. Aggregate Results

- Collect summaries from all plans
- Report phase completion status

### 5.1 Parse Sub-Agent Results

When sub-agents return, attempt to parse their output as a result envelope:

```json
{
  "status": "success|partial|failed|timeout",
  "summary": "Brief description of what was accomplished",
  "artifacts": [{ "path": "file.ts", "action": "created" }],
  "issues": [
    { "severity": "medium", "message": "...", "source_agent": "lu-executor" }
  ],
  "metadata": { "agent_name": "lu-executor", "context_tier": "T2" }
}
```

If a sub-agent returns plain text instead of JSON, wrap it as:

- status: "partial"
- summary: the raw text (truncated to 2000 chars)
- artifacts: []
- issues: []

This ensures all sub-agent outputs can be uniformly aggregated.

### 5.2 Prune Sub-Agent Output (Context Preservation)

**CRITICAL: After parsing each sub-agent result, immediately discard the raw output and retain ONLY the parsed envelope fields.**

Sub-agents can return very large outputs (50-100k+ tokens each). If you keep the full raw output in your working context while planning the next steps (harness, verification, code review, learning capture), you will exhaust the context window and freeze.

**Rules:**

1. Parse the result envelope per Step 5.1
2. Store ONLY these fields per agent: `status`, `summary` (max 500 chars), `artifacts` (paths only), `issues` (severity + message, max 10)
3. **Discard** the full raw output text — do NOT reference it again
4. Build a compact phase summary table for downstream steps:

```
| Plan | Status | Summary | Issues |
|------|--------|---------|--------|
| 01-01 | success | Brief summary | 0 |
| 01-02 | success | Brief summary | 1 |
```

5. Pass ONLY this compact summary to downstream agents (verifier, reviewers, learner)

**Why:** Parallel sub-agents returning ~200k+ combined tokens cause the orchestrator context to spike into the degradation zone (70%+), leading to freezes or extremely slow responses. This pruning step keeps the orchestrator lean for the remaining 6+ steps it must complete.

> **Future work:** A structured context-budget system will replace this manual pruning. See `docs/decisions/orchestrator-context-pruning.md` for the decision record and migration plan.

### 6. Commit Orchestrator Corrections

```bash
git status --porcelain
```

If changes exist:

```bash
git add .
bun run commit --message="orchestrator corrections" --type=fix --scope={phase} --no-push --skip-checks
```

### 6.5. Run Verification Harness

**Run automated quality checks before agent verification.**

Run the harness runner:

```bash
# Run harness (outputs JSON to stdout)
HARNESS_OUTPUT=$(bun run ./src/harness/runner.ts --project-dir=.)
HARNESS_EXIT=$?
echo "$HARNESS_OUTPUT"
```

Parse the JSON output:

- If `status: "passed"` -- display results and continue to Step 7
- If `status: "failed"` -- enter failure-to-fix loop (Step 6.6)

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► VERIFICATION HARNESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Check     | Status | Errors | Duration |
|-----------|--------|--------|----------|
| {name}    | {pass/fail} | {N} | {Ns}  |

Overall: {PASSED/FAILED}
```

### 6.5.1. Complexity Reassessment (Harness Boundary)

**After harness completes (Step 6.5), before entering harness fix loop (Step 6.6).**

**Skip if:** `ALREADY_PROMOTED` is true.

At this checkpoint, all 4 reassessment signals are available. This is the primary reassessment point.

Collect all signals:

```bash
# Signal 1: Cumulative files touched
FILES_TOUCHED=$(git diff --stat "$PHASE_START_COMMIT" HEAD -- | tail -1 | grep -oE '[0-9]+ file' | grep -oE '[0-9]+' || echo "0")

# Signal 2: Error count from harness results
ERROR_COUNT=$(echo "$HARNESS_OUTPUT" | bun -e "console.log(JSON.parse(await Bun.stdin.text()).totalErrors || 0)" 2>/dev/null || echo "0")

# Signal 3: Iteration budget ratio (0 if harness fix loop hasn't run yet)
BUDGET_RATIO="0"

# Signal 4: Stall detected (false if no convergence check yet)
STALL="false"
```

Apply the reassessment logic from `src/complexity/__helpers/reassessment.ts`:

- Call `shouldPromoteComplexity()` with all 4 signals and `alreadyPromoted: $ALREADY_PROMOTED`.
- If `should_promote` is true:
  1. Update state via bridge
  2. Update `COMPLEXITY` variable
  3. Set `ALREADY_PROMOTED=true`
  4. Log to MuninnDB session
  5. Display promotion banner (same format as Step 4.6)

**Critical (research pitfall #3):** After promotion, the harness fix loop (Step 6.6) must re-read iteration budgets from the complexity matrix using the NEW level. The loop initialization in Step 6.6.1 already reads complexity from the bridge, so promotion here will propagate automatically.

### 6.6. Loop A: Harness Fix Loop

**When harness checks fail (Step 6.5), run the unified iteration loop for mechanical failures.**

**This loop uses decision-support utilities from `src/iteration/`. You (the orchestrator) ARE the loop controller. Call the CLI utilities for convergence detection, error classification, checkpoint management, and budget tracking.**

#### 6.6.1. Initialize Loop A

Read iteration configuration:

```bash
# Primary: Read complexity from state machine bridge
COMPLEXITY=$(bun run packages/luca-framework/src/state/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "MODERATE")
# Fallback: grep STATE.md directly
if [ "$COMPLEXITY" = "" ] || [ "$COMPLEXITY" = "undefined" ]; then
  COMPLEXITY=$(grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}' || echo "MODERATE")
fi

# Read iteration config
CONFIG=$(cat .planning/config.json)

# Extract limits: harnessFixIterations from complexity matrix
MAX_ITERATIONS=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const level = '${COMPLEXITY}' || 'MODERATE';
  console.log(c.complexity?.matrix?.[level]?.harnessFixIterations ?? 3);
")

# Extract iteration settings
DEFAULT_MODE=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.iteration?.default_mode ?? 'afk');
")
SOFT_STOP=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.iteration?.soft_stop_percent ?? 80);
")
STALE_THRESHOLD=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.iteration?.stale_threshold ?? 2);
")
PROMOTION_THRESHOLD=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.iteration?.promotion_threshold ?? 3);
")

# Extract stall debate setting (default: true)
STALL_DEBATE_ENABLED=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.iteration?.stall_debate_enabled ?? true);
")

# Override mode if --mode flag was passed
MODE="${MODE_FLAG:-$DEFAULT_MODE}"
```

Initialize tracking state:

```bash
# Create initial budget state
BUDGET=$(bun run src/iteration/budget.ts create \
  --max-iterations="$MAX_ITERATIONS" \
  --soft-stop-percent="$SOFT_STOP")

# Initialize empty fingerprint ledger for error classification
LEDGER='{}'

# Initialize previous errors as empty (first iteration has no previous)
PREVIOUS_ERRORS='[]'
STALE_COUNT=0
PHASE_NUM={phase_number}
```

Display loop start:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ITER ► LOOP A: HARNESS FIX (max {MAX_ITERATIONS} iterations, mode: {MODE})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 6.6.2. Loop A Iteration Cycle

For each iteration, follow these steps IN ORDER:

**Step A: Budget Pre-Check**

```bash
BUDGET_CHECK=$(bun run src/iteration/budget.ts should-start --state="$BUDGET")
ALLOWED=$(echo "$BUDGET_CHECK" | bun -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).allowed)")
REASON=$(echo "$BUDGET_CHECK" | bun -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).reason)")
```

If `ALLOWED` is false: display reason, exit loop with outcome "budget_exhausted".

**Step B: Classify Errors**

Classify the harness errors from the most recent harness run:

```bash
CLASSIFIED=$(bun run src/iteration/classifier.ts \
  --harness-result="$HARNESS_OUTPUT" \
  --ledger="$LEDGER" \
  --promotion-threshold="$PROMOTION_THRESHOLD")

# Extract classified errors and updated ledger
CURRENT_ERRORS=$(echo "$CLASSIFIED" | bun -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).classified))")
LEDGER=$(echo "$CLASSIFIED" | bun -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).updated_ledger))")
```

Check for permanent errors. If any errors were newly promoted to permanent, log them:

```
◆ Permanent errors (excluded from convergence):
  - {file}:{line} — {message} (seen {N} iterations)
```

**Step C: Convergence Check** (skip for iteration 1 — no previous to compare)

If this is iteration 2+:

```bash
# Get artifact delta from previous checkpoint
PREV_TAG="iter/${PHASE_NUM}/harness/$((ITERATION - 1))"
ARTIFACT_DELTA=$(bun run src/iteration/checkpoint.ts artifact-delta --from-ref="$PREV_TAG")

# Assess convergence
CONVERGENCE=$(bun run src/iteration/convergence.ts \
  --current="$CURRENT_ERRORS" \
  --previous="$PREVIOUS_ERRORS" \
  --artifact-delta="$ARTIFACT_DELTA" \
  --previous-stale-count="$STALE_COUNT" \
  --stale-threshold="$STALE_THRESHOLD")

CONV_STATUS=$(echo "$CONVERGENCE" | bun -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).status)")
SHOULD_HALT=$(echo "$CONVERGENCE" | bun -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).should_halt)")
STALE_COUNT=$(echo "$CONVERGENCE" | bun -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).consecutive_stale)")
```

**Stall Debate (when enabled):**

If `SHOULD_HALT` is true AND `STALL_DEBATE_ENABLED` is true:

1. Extract the debate result from CONVERGENCE JSON: `DEBATE_STRATEGY`, `DEBATE_CONFIDENCE`, `DEBATE_REASONING`
2. If `DEBATE_STRATEGY` is NOT "halt": override `SHOULD_HALT=false`
3. Display debate outcome:
```
◆ Stall Debate: {DEBATE_STRATEGY} (confidence: {DEBATE_CONFIDENCE})
  Reasoning: {DEBATE_REASONING}
```
4. Act on strategy:
   - `retry_with_context_promotion`: Promote executor context tier for next iteration
   - `retry_with_error_focus`: Include top error patterns in next executor prompt
   - `retry_with_rollback`: Rollback to previous checkpoint before next iteration

If `SHOULD_HALT` is true (after debate, if applicable): display convergence failure, exit loop with outcome "convergence_failure".

Display convergence status:

```
◆ Convergence: {CONV_STATUS} (stale count: {STALE_COUNT}/{STALE_THRESHOLD})
```

**Step D: Create Checkpoint**

```bash
COMMIT_HASH=$(bun run src/iteration/checkpoint.ts commit-hash)
TAG="iter/${PHASE_NUM}/harness/${ITERATION}"

# Build iteration record JSON and create checkpoint
RECORD='{ "tag": "'$TAG'", "phase": '$PHASE_NUM', "loop": "harness", "iteration": '$ITERATION', ... }'
bun run src/iteration/checkpoint.ts create --record="$RECORD"
```

Fill in the full IterationRecord fields: error_count, error_delta, error_fingerprints, convergence_status, stale_count, permanent_errors, correctable_errors, transient_errors, artifacts_delta, commit_hash, agent_invoked, duration_ms, timestamp.

**Step E: HITL/AFK Decision Point**

If `MODE` is "hitl":

Display iteration summary table:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ITER ► ITERATION {N} COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Metric          | Previous | Current | Delta |
|-----------------|----------|---------|-------|
| Active errors   | {N}      | {N}     | {+/-} |
| Files changed   | {N}      | {N}     | {+/-} |
| Permanent       | {N}      | {N}     | {+/-} |

Status: {improved / stalled / regressed}
Budget: {N}/{MAX} iterations ({percent}%)

Options:
  1. Continue — Proceed to iteration {N+1}
  2. Rollback — Revert to iteration {N-1} checkpoint
  3. Abort — Stop loop, keep current state
  4. Skip — Skip remaining iterations, proceed to verification
```

Wait for user input. Route by choice:

- **Continue**: Proceed to Step F
- **Rollback**: Run `bun run src/iteration/checkpoint.ts rollback --tag="iter/${PHASE_NUM}/harness/$((ITERATION-1))"`. Decrement iteration counter. Re-run harness. Return to Step A.
- **Abort**: Exit loop with outcome "user_abort"
- **Skip**: Exit loop with outcome "user_skip"

If `MODE` is "afk": Skip to Step F (no pause).

**Step F: Spawn Executor with Fix Context**

Prepare fix context from classified errors. Include only correctable and transient errors (permanent are skipped):

```python
Task(
  prompt="""
<fix_context>
**Harness failures (Loop A, iteration {N}/{MAX}):**

**Correctable errors (retry with context):**
{correctable_errors_json}

**Transient errors (retry):**
{transient_errors_json}

**Permanent errors (SKIP — do not attempt to fix):**
{permanent_errors_summary}

**Instructions:**
- Fix ONLY the correctable and transient errors listed above
- Do NOT attempt to fix permanent errors — they have been tried {N}+ times
- Do NOT refactor or improve unrelated code
- Do NOT modify test expectations to make tests pass
- Commit fixes atomically
</fix_context>

Fix these harness failures.
""",
  subagent_type="lu-executor",
  model="{executor_model}",
  description="Fix harness failures (Loop A, iteration {N})"
)
```

**Step G: Re-run Harness**

```bash
HARNESS_OUTPUT=$(bun run ./src/harness/runner.ts --project-dir=.)
HARNESS_EXIT=$?
```

If harness passes (status: "passed"): Exit loop with outcome "all_passed".

If harness fails: Update `PREVIOUS_ERRORS = CURRENT_ERRORS`, advance budget:

```bash
BUDGET=$(bun run src/iteration/budget.ts advance --state="$BUDGET")
```

Return to Step A for next iteration.

#### 6.6.3. Loop A Termination

When the loop exits (any outcome), display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ITER ► LOOP A COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Outcome: {outcome}
Iterations: {N}/{MAX}
Active errors remaining: {count}
Permanent errors: {count}
```

Pass results to Step 7 (verifier context):

- `harness_status`: "passed" if outcome is "all_passed", else "failed_after_fixes"
- `harness_checks`: from last harness run
- `remaining_errors`: classified errors still active
- `loop_a_outcome`: the outcome string
- `loop_a_iterations`: count

### 6.7. Record Procedure Replay Feedback

**Skip if:** `--skip-replay` flag passed OR no pre-plans were injected in Step 0.6.

After harness verification completes, record feedback for each pre-plan that was followed. This closes the learning loop: procedure replays feed back into procedure scoring.

For each pre-plan that was injected during execution, record the outcome in MuninnDB:

```
# For each procedure that was replayed:
# HARNESS_PASSED is true if harness_status === "passed", false otherwise
# EXECUTION_DURATION_MS is computed from phase start time

for each PROC_ID in INJECTED_PROCEDURE_IDS:
  mcp__muninn__muninn_evolve(vault: "default", id: "procedure:$PROC_ID", content: "replay outcome: success=$HARNESS_PASSED, duration_ms=$EXECUTION_DURATION_MS")
```

This ensures that:
- Successful replays boost procedure confidence (success_count incremented)
- Failed replays degrade procedure confidence (only execution_count incremented)
- Consistently failing procedures are auto-retired (success_rate < 0.4 after 5+ executions)

### 7. Verify Phase Goal

**MANDATORY**: You MUST spawn a lu-verifier sub-agent. Do NOT attempt to verify yourself.

First, read the required context:

```bash
PHASE_DIR=".planning/phases/{phase_number}-*"
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
# Primary: Read state from state machine bridge
STATE_JSON=$(bun run packages/luca-framework/src/state/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE_CONTENT=$(cat .planning/STATE.md)
SUMMARIES=$(find $PHASE_DIR -name "*-SUMMARY.md" -exec cat {} \;)
PLAN_CONTENTS=$(find $PHASE_DIR -name "*-PLAN.md" -exec cat {} \;)
```

Recall session context from MuninnDB:

```
mcp__muninn__muninn_recall(vault: "default", context: "current session context and findings for phase verification")
```

Then spawn the verifier:

```python
Task(
  prompt="""
<verification_context>

**Phase:** {phase_number}
**Phase Directory:** {phase_dir}
**Mode:** full (goal-backward verification)

**Phase Goal (from ROADMAP.md):**
{phase_goal}

**Execution Summaries:**
{summaries}

**Plan Contents (for specification anchoring):**
{plan_contents}

**Project State:**
{state_content}

<!-- WARM ISOLATION: Verifier does NOT receive session findings to prevent bias -->
<!-- Use buildMemoryContextBlock() with ONLY recalledPitfalls and recalledPatterns (no sessionFindings, no recalledDecisions) to respect warm isolation -->
**Working Memory:**
{working_content}

**Harness Results:**
{harness_status}
{harness_checks_summary}
{remaining_errors_if_any}

</verification_context>

<specification_anchoring>
PLAN.md contents are included above. Use them in Step 2.5 (Specification Anchoring) to trace must-haves to plan objectives, and in Step 9.5 (Goal-Backward Objective Check) to confirm each plan's objective was achieved. If plan contents are empty, skip these steps gracefully.
</specification_anchoring>

<verification_levels>
1. EXISTS: Do deliverables exist in codebase?
2. SUBSTANTIVE: Do they work correctly?
3. WIRED: Are they properly integrated?
</verification_levels>

<output_requirements>
- Create VERIFICATION.md in phase directory
- Return status: passed | human_needed | gaps_found
- List any gaps or issues found
- If harness passed: Note "All automated checks passed" in your report under an "Automated Checks" section.
- If harness failed after fix attempts: Include remaining mechanical errors as gaps in your verification.
</output_requirements>

Verify the phase goal was achieved using goal-backward analysis.
""",
  subagent_type="lu-verifier",
  model="{verifier_model}",
  description="Verify Phase {phase_number}"
)
```

**Do NOT proceed until the Task returns.**

Route by returned status:

- `passed` → continue to Step 8 (Code Quality Review)
- `human_needed` → present items, get approval, then continue to Step 8
- `gaps_found` → proceed to Step 7.5 (Loop B: Verify Fix Loop)
- `human_needed` with T1/T3 conflict → proceed to Step 7.25 (Verification Tribunal)

**Note:** When gaps are found, Loop B will attempt automated gap resolution. Only if Loop B fails to resolve all gaps will the user be offered `/phase-plan {X} --gaps`.

### 7.2. Store Calibration Engram

**After verification and memory feedback**, store a calibration engram comparing the initial complexity prediction to the actual observed level. This feeds back into future classification accuracy (CONTEXT.md Decision 4).

Build the calibration data using `buildCalibrationEngram()` from `src/complexity/__helpers/reassessment.ts`:

Parameters:
- `phase`: {phase_number}
- `milestone`: Read from STATE.md or ROADMAP.md (e.g., "v3.3.0")
- `predicted`: `$INITIAL_COMPLEXITY` (captured in Step 0.1)
- `actual`: `$COMPLEXITY` (may differ from predicted if promotion occurred)
- `promoted_mid_execution`: `$ALREADY_PROMOTED`
- `promotion_trigger`: The reason string from Step 4.6 or 6.5.1 (or empty string if no promotion)
- `files_touched`: Final cumulative files touched
- `harness_iterations`: Number of harness fix loop iterations consumed (from Loop A results)

Store in MuninnDB:

```
mcp__muninn__muninn_remember(
  vault: "default",
  concept: "decision:complexity-calibration-{milestone}-phase-{phase}",
  content: "{calibration_json}"
)
```

The concept uses milestone-scoped naming (`decision:complexity-calibration-v3.3.0-phase-2`) to ensure uniqueness across milestones (research pitfall #5). This engram will be semantically recalled during future cognitive pre-flights when complexity/calibration keywords match.

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► CALIBRATION RECORDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Predicted: {INITIAL_COMPLEXITY}
Actual: {COMPLEXITY}
Promoted: {yes/no}
Engram: decision:complexity-calibration-{milestone}-phase-{phase}
```

### 7.25. Verification Tribunal (Conditional)

**Skip if:** `workflow.verification_tribunal_enabled: false` in config (default: true), OR complexity is below COMPLEX, OR no T1/T3 conflict detected.

**When to trigger:** The verifier returned `human_needed` AND the verification report shows a T1/T3 signal conflict (T1 STRONG PASS with T3 PARTIAL or FAIL, or T1 PARTIAL with T3 PARTIAL).

**Gate check:**

```bash
VT_ENABLED=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.workflow?.verification_tribunal_enabled ?? true);
")
```

**When enabled at COMPLEX+ complexity with T1/T3 conflict:**

1. **Extract conflict signal**: Parse the verifier's T1 and T3 signal statuses and evidence from VERIFICATION.md
2. **Build diagnostic prompts**: Generate three prompts using the conflict signal — one for each diagnostic agent
3. **Spawn three diagnostic agents in PARALLEL**:

```python
# Spawn lu-test-writer diagnostic
Task(
  prompt="""
<diagnostic_context>
{test_writer_diagnostic_prompt}

**Phase:** {phase_number}
**VERIFICATION.md:** {verification_content}

Analyze the T1/T3 conflict from your perspective as test coverage expert.
</diagnostic_context>
""",
  subagent_type="lu-test-writer",
  model="{diagnostic_model}",
  description="Test Writer Diagnostic"
)

# Spawn lu-verifier diagnostic (IN PARALLEL)
Task(
  prompt="""
<diagnostic_context>
{verifier_diagnostic_prompt}

**Phase:** {phase_number}
**VERIFICATION.md:** {verification_content}

Re-examine your T3 analysis for potential over-specification.
</diagnostic_context>
""",
  subagent_type="lu-verifier",
  model="{diagnostic_model}",
  description="Verifier Diagnostic"
)

# Spawn lu-integration-checker diagnostic (IN PARALLEL)
Task(
  prompt="""
<diagnostic_context>
{integration_diagnostic_prompt}

**Phase:** {phase_number}
**VERIFICATION.md:** {verification_content}

Analyze cross-component wiring for integration gaps.
</diagnostic_context>
""",
  subagent_type="lu-integration-checker",
  model="{diagnostic_model}",
  description="Integration Diagnostic"
)
```

**Do NOT proceed until ALL three diagnostic Tasks return.**

4. **Parse diagnostic responses**: Extract CATEGORY, CONFIDENCE, EVIDENCE, and ACTION from each agent's response
5. **Resolve tribunal**: Majority vote determines consensus category. If three-way split, use highest confidence as tiebreaker
6. **Route by consensus category**:

| Category | Action |
|----------|--------|
| `tests_incomplete` | Flag for test augmentation — existing tests don't cover the goal specification |
| `goal_over_specified` | Adjust verification — T3 must-haves exceed plan scope |
| `wiring_issue` | Flag for integration fix — components exist but aren't connected |

**Display tribunal results:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > VERIFICATION TRIBUNAL RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Metric                | Value                          |
| --------------------- | ------------------------------ |
| Conflict type         | {conflict_type}                |
| T1 status             | {t1_status}                    |
| T3 status             | {t3_status}                    |
| Consensus category    | {consensus_category}           |
| Consensus confidence  | {consensus_confidence}         |
| Dissenting agent      | {dissent_agent or "None"}      |
| Token cost            | ~{estimated_token_cost}        |
```

7. **Append tribunal result to VERIFICATION.md**:

Add a new section `### Verification Tribunal` to the existing VERIFICATION.md with the tribunal results, perspectives, and recommended remediation.

8. **Continue based on category**:
   - If `tests_incomplete`: Present to user with recommendation to augment tests, then continue to Step 8
   - If `goal_over_specified`: Note that verification may be overly strict, adjust status to `passed` if user approves, then continue to Step 8
   - If `wiring_issue`: Proceed to Step 7.5 (Loop B) with integration fix focus

### 7.5. Loop B: Verify Fix Loop

**When the verifier finds gaps (status: gaps_found), run the unified iteration loop for semantic gaps.**

**This loop re-executes ONLY the plans identified by the verifier's `source_plan` attribution.** Plans without gaps are NOT re-executed.

**Skip this step if:**

- Verifier status is "passed" or "human_needed"
- `verifyFixIterations` for the current complexity is 0 (e.g., TRIVIAL)
- `--skip-verify-loop` flag was passed

#### 7.5.1. Initialize Loop B

```bash
# Extract verifyFixIterations from complexity matrix
VERIFY_MAX=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const level = '${COMPLEXITY}' || 'MODERATE';
  console.log(c.complexity?.matrix?.[level]?.verifyFixIterations ?? 1);
")
```

If `VERIFY_MAX` is 0: Skip Loop B, proceed to Step 8.

```bash
# Create budget state for Loop B
VERIFY_BUDGET=$(bun run src/iteration/budget.ts create \
  --max-iterations="$VERIFY_MAX" \
  --soft-stop-percent="$SOFT_STOP")

VERIFY_STALE_COUNT=0
VERIFY_ITERATION=0
```

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ITER ► LOOP B: VERIFY FIX (max {VERIFY_MAX} iterations, mode: {MODE})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 7.5.2. Extract Gap-Targeted Plans

Parse the verifier's VERIFICATION.md frontmatter to extract gaps with source_plan attribution:

```bash
# Read VERIFICATION.md and extract gaps with source_plan
VERIFICATION_MD=$(cat .planning/phases/{phase_dir}/*-VERIFICATION.md)
```

From the YAML frontmatter, extract unique `source_plan` values from the gaps. These are the plans that need re-execution.

If no `source_plan` fields are present (verifier did not attribute gaps to plans): Re-execute ALL plans in the last wave with gap context. This is the backward-compatible fallback.

#### 7.5.3. Loop B Iteration Cycle

Follow the same pre-check/execute/evaluate cycle as Loop A, with these differences:

**Step B-A: Budget Pre-Check**

Same as Loop A Step A, using `VERIFY_BUDGET`.

**Step B-B: Spawn Targeted Executors**

For each plan with gaps, spawn a fix executor with gap-targeted instructions:

```python
Task(
  prompt="""
<gap_fix_context>
**Verify Loop B (iteration {N}/{MAX}):**
**Plan:** {plan_name}

**Verifier Gaps for this plan:**
{gap_details_for_this_plan}

**Original Plan Content:**
{plan_content}

**Instructions:**
- Address ONLY the gaps listed above
- The verifier found that the plan's objectives were not fully met
- Refer to the original plan for context on what was intended
- Do NOT refactor or change unrelated code
- Commit fixes atomically
</gap_fix_context>

Fix the verification gaps for this plan.
""",
  subagent_type="lu-executor",
  model="{executor_model}",
  description="Fix verify gaps for {plan_name} (Loop B, iteration {N})"
)
```

Spawn all gap-targeted executors in PARALLEL (same message, multiple Task calls).

**Step B-C: Re-run Harness**

After executors return, re-run the harness to ensure fixes didn't break mechanical checks:

```bash
HARNESS_OUTPUT=$(bun run ./src/harness/runner.ts --project-dir=.)
```

If harness fails: Enter Loop A mini-loop (1 iteration only) to fix mechanical breakage, then continue Loop B.

**Step B-D: Re-run Verifier**

Spawn the verifier again (same context as Step 7, updated with new summaries):

```python
Task(
  prompt="""
<verification_context>
**Phase:** {phase_number}
**Phase Directory:** {phase_dir}
**Mode:** full (re-verification after gap fixes)
...same context as Step 7...
</verification_context>

Re-verify the phase goal after gap fix iteration {N}.
""",
  subagent_type="lu-verifier",
  model="{verifier_model}",
  description="Re-verify Phase {phase_number} (Loop B, iteration {N})"
)
```

If verifier returns "passed": Exit Loop B with outcome "all_passed".
If verifier returns "gaps_found": Continue to convergence check.
If verifier returns "human_needed": Exit Loop B, proceed to human verification.

**Step B-E: Convergence Check**

Compare current gaps to previous gaps. Use gap count as the error signal:

- `error_count_delta`: current gap count - previous gap count
- `fingerprint_overlap`: Compare gap truth strings (hashed) for identity
- `artifact_change_delta`: from git diff --stat

Assess convergence same as Loop A. If should_halt: exit with "convergence_failure".

**Step B-F: Checkpoint & HITL**

Create checkpoint (same as Loop A, using "verify" loop type).
If HITL mode: display iteration summary and 4-choice menu.
Advance budget.

Return to Step B-A for next iteration.

#### 7.5.4. Loop B Termination

When Loop B exits, display summary same as Loop A.

If outcome is "all_passed": Continue to Step 8 (Code Quality Review).
If outcome is anything else: Display remaining gaps and offer `/phase-plan {X} --gaps` to the user.

### 8. Code Quality Review

**Skip if:** `--skip-review` flag passed OR `workflow.code_review: false` in config.

**Always runs** (model tier resolved from routing table per complexity). Each reviewer agent resolves its model tier via `resolveModelForAgent(agentName, complexity)`.

Get changed files for this phase:

```bash
# Get TypeScript/TSX files changed in this branch vs main
CHANGED_FILES=$(git diff --name-only main...HEAD -- '*.ts' '*.tsx' 2>/dev/null | head -50)
FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c '.' || echo "0")
```

**If no changed files:** Skip to step 9.

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► CODE QUALITY REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Reviewing {FILE_COUNT} changed files...
```

**Determine which reviewers to spawn:**

**Always spawn ALL reviewers.** Each reviewer resolves its model tier from the routing table based on complexity:

| Agent            | TRIVIAL | SIMPLE  | MODERATE | COMPLEX | CRITICAL |
| ---------------- | ------- | ------- | -------- | ------- | -------- |
| dx-advocate      | fast    | balanced | capable  | capable | capable  |
| code-simplifier  | fast    | balanced | capable  | capable | capable  |
| code-architect   | fast    | balanced | capable  | capable | capable  |
| performance-auditor | fast | balanced | capable  | capable | capable  |
| security-auditor | fast    | balanced | capable  | capable | capable  |

At lower complexity, reviewers run with lighter models (fast tier), making them low-cost but still active. The `--skip-review` flag and `workflow.code_review: false` config override still allow skipping entirely.

Conditionally spawn `security-auditor` if files match patterns:

```bash
echo "$CHANGED_FILES" | grep -E '(auth|api|convex|mutation|query|middleware|proxy)' && NEEDS_SECURITY=true
```

**MANDATORY**: Spawn ALL applicable reviewers in a SINGLE message with multiple Task calls (PARALLEL).

**Context isolation:** Code reviewers operate in COLD isolation. They receive:

- Git diff of changed files (not full file contents)
- Project identity summary (conventions only, from MuninnDB brain:*)
- NO STATE.md, NO session context, NO long-term learnings

This prevents reviewer bias from executor session context.

First, read project standards:

```bash
CLAUDE_CONTENT=$(cat CLAUDE.md 2>/dev/null || echo "No CLAUDE.md")
```

Then spawn all reviewers in PARALLEL:

````python
# DX Advocate - conventions, coding standards
Task(
  prompt="""
Review the following changed files for code quality issues.

**Changed files:**
{CHANGED_FILES}

**Project standards:**
{claude_content}

**Your focus:** Naming conventions, coding standards, Lodash vs native methods, snake_case API keys, import organization.

**Return format:**
```yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: dx-advocate
````

If no issues found, return: `issues: []`
""",
subagent_type="dx-advocate",
model="{reviewer_model}",
description="DX review"
)

# Code Simplifier - DRY violations, complexity

Task(
prompt="""
Review the following changed files for complexity and duplication.

**Changed files:**
{CHANGED_FILES}

**Your focus:** DRY violations, duplicated code, unnecessary complexity, code that could be simplified.

**Return format:**

```yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: code-simplifier
```

If no issues found, return: `issues: []`
""",
subagent_type="code-simplifier",
model="{reviewer_model}",
description="Simplification review"
)

# Code Architect - architecture, patterns

Task(
prompt="""
Review the following changed files for architecture issues.

**Changed files:**
{CHANGED_FILES}

**Your focus:** Architecture patterns, module boundaries, component structure, separation of concerns.

**Return format:**

```yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: code-architect
```

If no issues found, return: `issues: []`
""",
subagent_type="code-architect",
model="{reviewer_model}",
description="Architecture review"
)

# Tailwind Auditor - styling patterns

Task(
prompt="""
Review the following changed files for Tailwind and styling issues.

**Changed files:**
{CHANGED_FILES}

**Your focus:** Dynamic color system usage, Tailwind patterns, shadcn anti-patterns, MUI deprecation compliance.

**Return format:**

```yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: ui
```

If no issues found, return: `issues: []`
""",
subagent_type="ui",
model="{reviewer_model}",
description="Tailwind review"
)

# Security Auditor - ONLY if auth/api files changed

# (Spawn this only if NEEDS_SECURITY=true from earlier check)

Task(
prompt="""
Review the following changed files for security issues.

**Changed files:**
{CHANGED_FILES}

**Your focus:** Authentication, authorization, injection vulnerabilities, XSS, data validation, API security.

**Return format:**

```yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: security-auditor
```

If no issues found, return: `issues: []`
""",
subagent_type="security-auditor",
model="{reviewer_model}",
description="Security review"
)

```

**Do NOT proceed until ALL reviewer Tasks return.**

**Merge findings:** Combine all issues, deduplicate by file:line.

### 8.5. Design Tribunal (Conditional)

**Skip if:** Complexity is below COMPLEX, OR `workflow.tribunal_enabled: false` in config (default: true), OR no disagreements detected.

**Gate check:**

```bash
TRIBUNAL_ENABLED=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(c.workflow?.tribunal_enabled ?? true);
")
```

**When enabled at COMPLEX+ complexity:**

1. **Normalize findings**: Parse all reviewer outputs into structured ReviewFinding format
2. **Detect disagreements**: Group findings by file:line and identify severity mismatches, scope overlaps, and contradictions
3. **Gate check**: If no disagreements involve CRITICAL or HIGH findings, skip tribunal
4. **Build rebuttal prompts**: For each disagreement, generate challenger/defender prompt pairs
5. **Spawn rebuttal agents**: Send prompts to challenger and defender agents in PARALLEL
6. **Resolve rebuttals**: Aggregate rebuttal outcomes into unified recommendations with confidence scores
7. **Build tribunal result**: Compile final result with metrics

**Display tribunal results:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > DESIGN TRIBUNAL RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Metric                | Value |
| --------------------- | ----- |
| Total findings        | {N}   |
| Disagreements found   | {N}   |
| Rebuttals conducted   | {N}   |
| Findings withdrawn    | {N}   |
| Findings modified     | {N}   |
| Debate token cost     | ~{N}  |
```

**Record tribunal metrics** using `buildReviewMetrics` from 91-A (set `debate_enabled: true`, `disagreements_detected: N`).

**Replace merged findings** with the tribunal's unified recommendations for Step 8.1.

### 8.1. Handle Code Review Results

**Route based on findings:**

| Severity | Action |
|----------|--------|
| CRITICAL | Block - must fix before continuing |
| HIGH | Strong warning - recommend fixing |
| MEDIUM | Warning - note for later |
| LOW | Informational only |

**If CRITICAL issues found:**

```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Luca ► CRITICAL CODE ISSUES ✗
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} critical issues must be fixed before continuing.

| File   | Line   | Issue   |
| ------ | ------ | ------- |
| {file} | {line} | {issue} |

## ▶ Next Up

Planning fixes automatically...

```

- Spawn `lu-planner` in quality_fixes mode
- Spawn `lu-plan-checker` to verify plans
- Present ready status for `/phase-execute {phase} --quality-fixes`
- **EXIT** (user must run execute again with --quality-fixes)

**If HIGH/MEDIUM only:**

```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Luca ► CODE REVIEW WARNINGS ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Severity | Count | Examples      |
| -------- | ----- | ------------- |
| HIGH     | {N}   | {first issue} |
| MEDIUM   | {N}   | {first issue} |

## Options

1. **Fix now** — plan and execute fixes before UAT
2. **Continue to UAT** — address later
3. **Review details** — see full findings

````

Wait for user response, then proceed accordingly.

**If clean (or LOW only):** Continue to step 9.

**Write REVIEW.md** — persist reviewer findings before the Step 9 state transition fires. This ordering is critical: a compaction event between Steps 8 and 9 must not lose review data.

```bash
cat > {phase_dir}/REVIEW.md << 'REVIEW_EOF'
# Code Review — Phase {phase_number}

**Timestamp:** {timestamp_utc}
**Files reviewed:** {file_count}
**Reviewers:** dx-advocate, code-simplifier, code-architect, ui, security-auditor

## Severity Summary

| Severity | Count |
|----------|-------|
| CRITICAL | {critical_count} |
| HIGH     | {high_count} |
| MEDIUM   | {medium_count} |
| LOW      | {low_count} |

## Findings

{merged_deduplicated_findings_in_markdown}
REVIEW_EOF
```

This file persists reviewer findings across context compaction. It is referenced by session-resume when recovering a mid-review session.

### 9. Signal Verification and Update State

Signal verification passed via bridge. Do NOT send COMMIT_COMPLETE here — the machine transitions to `learning` state and expects LEARN_COMPLETE before committing.

```bash
bun run packages/luca-framework/src/state/bridge.ts transition --event=VERIFY_PASSED 2>/dev/null || true
```

Also update STATE.md directly for backward compatibility.

### 10. Update Requirements

Mark phase requirements as Complete in REQUIREMENTS.md traceability table.

### 10.5. Checkpoint Cleanup

After the phase passes verification (Loop A + Loop B both succeeded or were not needed):

```bash
# Prune all iteration checkpoints for this phase
bun run src/iteration/checkpoint.ts prune --phase={phase_number}
```

This removes all `iter/{phase}/*` git tags and `.planning/checkpoints/iter-{phase}-*.json` metadata files, keeping the git tag namespace and checkpoint directory clean for future phases.

### 11. Commit Phase Completion

```bash
git add .
bun run commit --message="complete {phase-name} phase" --type=docs --scope={phase} --no-push --skip-checks
````

Signal commit complete via bridge (after the actual commit succeeds):

```bash
bun run packages/luca-framework/src/state/bridge.ts transition --event=COMMIT_COMPLETE 2>/dev/null || true
```

### 12. User Acceptance Testing (UAT)

**Skip if:** `--skip-uat` flag passed OR `workflow.uat_required: false` in config.

**Always runs** (verification depth scales with complexity via `verificationMode`). The `--skip-uat` flag and `workflow.uat_required: false` config override still allow skipping entirely.

| Complexity | UAT                               | Verification Mode |
| ---------- | --------------------------------- | ----------------- |
| TRIVIAL    | Run (quick)                       | quick             |
| SIMPLE     | Run (quick)                       | quick             |
| MODERATE   | Run (standard)                    | standard          |
| COMPLEX    | Run (full)                        | full              |
| CRITICAL   | Run (full + thorough)             | full+human        |

**Auto-transition into UAT mode:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} EXECUTION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {Z}: {Name}**
{Y} plans executed
Goal verified ✓
Code review passed ✓

## ▶ Starting UAT

Testing deliverables from this phase...
```

**Follow verify-work workflow inline:**

Read `.cursor/luca/workflows/verify-work.md` for detailed UAT process.

1. **Find SUMMARY.md files** for the phase
2. **Extract testable deliverables** (user-observable outcomes)
3. **Create {phase}-UAT.md** with test list
4. **Present tests one at a time** — show expected behavior, wait for response
5. **Process responses:**
   - "yes/y/pass/next" → pass
   - Anything else → issue (severity inferred)
6. **Update UAT.md** after each response

### 13. Handle UAT Results

**Route A: All tests pass, more phases remain**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} VERIFIED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N}/{N} UAT tests passed ✓
Code review passed ✓

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

/phase-discuss {Z+1} — gather context and clarify approach
```

**Route B: All tests pass, milestone complete**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► MILESTONE COMPLETE 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} phases completed
All UAT tests passed ✓
All code reviews passed ✓

## ▶ Next Up

/milestone-audit
```

**Route C: UAT issues found**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} ISSUES FOUND ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N}/{M} tests passed
{X} issues found

## ▶ Diagnosing and Planning Fixes...
```

- Spawn parallel debug agents to diagnose root causes
- **Root Cause Tribunal (conditional):** When debug agents return ROOT CAUSE FOUND during UAT diagnosis, check tribunal gating conditions before creating fix plans:
  - Gate: `root_cause_tribunal_enabled` in config (default: true) AND complexity is COMPLEX+ AND multi-issue debugging (issue_count >= 2)
  - When gated in: Spawn three tribunal agents in parallel (lu-debugger as defender, lu-verifier as challenger, lu-integration-checker as arbiter) to validate the proposed fix before planning
  - Resolution: "verified_fix" proceeds to fix planning; "needs_deeper_investigation" re-runs diagnosis with tribunal findings as additional context
- Spawn lu-planner in --gaps mode to create fix plans
- Spawn lu-plan-checker to verify fix plans
- Present ready status:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► FIXES READY ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} gap(s) diagnosed, {M} fix plan(s) created

## ▶ Next Up

/clear then /phase-execute {Z} --gaps-only
```

**Route D: Verifier gaps found (before UAT)**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} GAPS FOUND ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Score: {N}/{M} must-haves verified

## ▶ Next Up

/phase-plan {Z} --gaps
```

## Deviation Rules

During execution, handle discoveries automatically:

1. **Auto-fix bugs** - Fix immediately, document in Summary
2. **Auto-add critical** - Security/correctness gaps, add and document
3. **Auto-fix blockers** - Can't proceed without fix, do it and document
4. **Ask about architectural** - Major structural changes, stop and ask user

## Commit Rules

**IMPORTANT:** Always use `bun run commit` with flags. Always stage ALL files with `git add .` before committing. Partial commits are not allowed in standard workflow.

**Per-Task Commits:**

```bash
git add .
bun run commit --message="{task-name}" --type={type} --scope={phase}-{plan} --no-push --skip-checks
```

**Plan Metadata Commit:**

```bash
git add .
bun run commit --message="complete {plan-name} plan" --type=docs --scope={phase}-{plan} --no-push --skip-checks
```

**Phase Completion Commit:**

```bash
git add .
bun run commit --message="complete {phase-name} phase" --type=docs --scope={phase} --no-push --skip-checks
```

## Success Criteria

- [ ] All incomplete plans in phase executed
- [ ] Each plan has SUMMARY.md
- [ ] Phase goal verified (must_haves checked against codebase)
- [ ] VERIFICATION.md created in phase directory
- [ ] Code review subagents spawned (dx-advocate, code-simplifier, code-architect, ui, security-auditor)
- [ ] CRITICAL code issues block until fixed
- [ ] HIGH/MEDIUM code issues presented with options
- [ ] UAT.md created with tests from SUMMARY.md
- [ ] UAT tests presented one at a time
- [ ] UAT issues diagnosed and fix plans created (if any)
- [ ] STATE.md reflects phase completion
- [ ] ROADMAP.md updated
- [ ] REQUIREMENTS.md updated
- [ ] User routed to next phase or fix execution

## Next Steps

| Condition                      | Action                | Command                                 |
| ------------------------------ | --------------------- | --------------------------------------- |
| UAT passed, more phases        | Discuss next phase    | `/phase-discuss {N+1}`               |
| UAT passed, milestone complete | Audit milestone       | `/milestone-audit`                   |
| UAT gaps found                 | Execute gap fixes     | `/phase-execute {N} --gaps-only`     |
| Code review critical issues    | Execute quality fixes | `/phase-execute {N} --quality-fixes` |
| Verifier gaps found            | Plan gap closure      | `/phase-plan {N} --gaps`             |

**Primary:** `/progress` — Check status and get smart routing

**Also available:**

- `/verify {phase}` — Run UAT separately
- `/session-pause` — Create handoff if stopping mid-work
</main>