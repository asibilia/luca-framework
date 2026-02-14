/**
 * phase-execute Skill - Execute all plans in a phase with wave-based parallelization and harness verification.
 */
import { BaseSkillImpl } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.types";

// Define the phase-execute skill configuration
const phaseExecuteConfig: SkillConfig = {
  frontmatter: {
    name: "phase-execute",
    description: `Execute all plans in a phase with wave-based parallelization and harness verification.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Execute Phase

Execute all plans in a phase using wave-based parallel execution, then verify with code review and UAT.

Orchestrator stays lean: discover plans, analyze dependencies, group into waves, spawn subagents, collect results. Each subagent loads the full execute-plan context and handles its own plan.

**Arguments:** \`<phase-number> [--gaps-only] [--quality-fixes] [--skip-review] [--skip-uat] [--skip-memory]\`

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- \`lu-executor\` - Executes individual plans (PARALLEL per wave)
- \`lu-verifier\` - Verifies phase goal achieved
- \`lu-learner\` - Extracts learnings after verification
- \`dx-advocate\` - Code quality review
- \`code-simplifier\` - DRY and complexity review
- \`code-architect\` - Architecture review
- \`tailwind-auditor\` - Tailwind/styling review
- \`security-auditor\` - Security review (conditional)
- \`lu-planner\` - Plans fixes for issues (if needed)
- \`lu-plan-checker\` - Validates fix plans (if needed)
- \`lu-test-writer\` - Generates test files from plan verification criteria (spawned by lu-executor during TDD cycle)

**DO NOT** attempt to execute plans, verify, or review code yourself. Spawn the appropriate agents.

**Reference:** See \`.cursor/luca/references/task-directive.md\` for Task() syntax patterns.

## Context-Aware Sub-Agent Spawning (Phase 16+)

Each sub-agent receives only the context documents appropriate for its role and the current task complexity. The orchestrator assembles context per these rules:

**Context Tiers:**
| Tier | Documents Loaded |
|------|-----------------|
| T0 | Plan content only |
| T1 | + BRAIN.md summary |
| T2 | + STATE.md + selective MEMORY.md + WORKING.md |
| T3 | + full BRAIN.md + full MEMORY.md + agent summaries |

**Isolation Modes:**
| Mode | Restriction | Used By |
|------|------------|---------|
| none | Full context per tier | lu-executor, lu-planner, lu-learner |
| cold | Only git diff + BRAIN.md | dx-advocate, code-simplifier, code-architect |
| warm | Plans + summaries, NO WORKING.md | lu-verifier |

**Complexity promotes context:** At MODERATE+, sub-agents may receive one tier higher than their default.

## Execution Context

Read these reference files before executing:

- \`.cursor/luca/references/ui-brand.md\`
- \`.cursor/luca/workflows/execute-phase.md\`
- \`.cursor/luca/workflows/learning-capture.md\`

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

\`\`\`bash
WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "No working memory")
MEMORY_CONTENT=$(cat .planning/MEMORY.md 2>/dev/null || echo "No memory file")
VERIFICATION_RESULT="[from verifier return value]"
\`\`\`

Then spawn the learner:

\`\`\`python
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
- Write curated insights to MEMORY.md
- Clear WORKING.md after extraction
- Return summary of learnings captured
</output_requirements>

Extract learnings from this phase execution and update MEMORY.md.
""",
  subagent_type="lu-learner",
  model="{learner_model}",
  description="Capture phase learnings"
)
\`\`\`

**Do NOT proceed until the Task returns.**

**Complexity-gated learning depth:**

| Complexity | Learning Capture                                |
| ---------- | ----------------------------------------------- |
| TRIVIAL    | Skip (do not spawn lu-learner)                  |
| SIMPLE     | Brief (spawn with minimal context)              |
| MODERATE   | Standard (current behavior)                     |
| COMPLEX    | Full (include all working memory)               |
| CRITICAL   | Full + debrief (include retrospective analysis) |

For TRIVIAL: Skip the lu-learner spawn entirely.
For SIMPLE: Include only execution summary, not full working memory.
For MODERATE and above: Use the current lu-learner spawn as-is.
For CRITICAL: Add to the lu-learner prompt: "Include a retrospective analysis: what went well, what didn't, what would you do differently?"

### WORKING.md During Execution

Throughout execution, log to WORKING.md:

\`\`\`bash
# Log execution progress
echo "- $(date -u +%H:%M) [Plan X complete - finding Y]" >> .planning/WORKING.md
\`\`\`

Track:

- Execution findings and observations
- Issues encountered and how resolved
- Patterns that worked well (learning candidates)
- Decisions made during implementation

## Process

### 0. Resolve Model Profile

\`\`\`bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
\`\`\`

**Model lookup table:**

| Agent            | quality | balanced | budget |
| ---------------- | ------- | -------- | ------ |
| lu-executor      | opus    | sonnet   | sonnet |
| lu-verifier      | sonnet  | sonnet   | haiku  |
| dx-advocate      | opus    | sonnet   | haiku  |
| code-simplifier  | opus    | sonnet   | haiku  |
| code-architect   | opus    | sonnet   | haiku  |
| tailwind-auditor | opus    | sonnet   | haiku  |
| security-auditor | opus    | sonnet   | haiku  |
| lu-planner       | opus    | opus     | sonnet |
| lu-plan-checker  | sonnet  | sonnet   | haiku  |
| lu-test-writer   | sonnet  | sonnet   | haiku  |

> **Current Limitation:** Cursor's Task tool only supports \`model="fast"\` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

\`\`\`
# Lightweight agents → use "fast"
learner_model = "fast"

# Reasoning-intensive agents → omit (inherit from parent)
executor_model = (omit)
verifier_model = (omit)
planner_model = (omit)
checker_model = (omit)
reviewer_model = (omit)  # dx-advocate, code-simplifier, etc.
\`\`\`

### 0.5. Verify GitHub Tracking (Gate)

**Before executing any plans, verify issue/branch tracking is configured.**

Read STATE.md and check for \`GitHub Issue:\` line.

**If issue exists and is valid:**

- Extract issue number for commit messages
- Continue to phase validation

**If issue is "None" or missing:**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► GITHUB TRACKING MISSING ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No GitHub issue is configured for this milestone.
Commits will not reference issues and PR creation will require manual setup.

1. **Create issue now** — Set up tracking before execution
2. **Continue without tracking** — Proceed anyway (not recommended)
3. **Abort** — Stop and run /milestone-new to set up properly
\`\`\`

**If "Create issue now" selected:**

1. Generate issue from PROJECT.md Current Milestone + REQUIREMENTS.md
2. Create issue: \`gh issue create --title "feat({scope}): {milestone}" --body "{body}"\`
3. Create branch: \`git checkout -b {issue_number}--{milestone-slug}\`
4. Push: \`git push -u origin {branch_name}\`
5. Update STATE.md
6. Continue execution

**If "Continue without" selected:**

1. Warn: commits will use placeholder \`#0\` for issue reference
2. Log warning to phase SUMMARY
3. Continue execution

**If "Abort" selected:**

1. Exit with message to run \`/milestone-new\` or manually create issue

### 1. Validate Phase Exists

- Find phase directory matching argument
- Count PLAN.md files
- Error if no plans found

### 2. Discover Plans

- List all \\*-PLAN.md files in phase directory
- Check which have \\*-SUMMARY.md (already complete)
- If \`--gaps-only\`: filter to only plans with \`gap_closure: true\`
- Build list of incomplete plans

### 3. Group by Wave

- Read \`wave\` from each plan's frontmatter
- Group plans by wave number
- Report wave structure to user

### 4. Execute Waves

For each wave in order:

- Read plan contents (@ syntax doesn't work across Task boundaries)
- Spawn \`lu-executor\` for each plan in wave (parallel Task calls)
- Wait for completion
- Verify SUMMARYs created
- Proceed to next wave

**MANDATORY**: You MUST spawn lu-executor sub-agents for each plan. Do NOT attempt to execute plans yourself.

First, read plan contents (required because @ syntax doesn't work across Task boundaries):

\`\`\`bash
PLAN_01_CONTENT=$(cat "{plan_01_path}")
PLAN_02_CONTENT=$(cat "{plan_02_path}")
PLAN_03_CONTENT=$(cat "{plan_03_path}")
STATE_CONTENT=$(cat .planning/STATE.md)
WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "")
\`\`\`

Then spawn all executors for the wave in PARALLEL (same message, multiple Task calls):

\`\`\`python
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

**TDD Mode:** {tdd_enabled_or_disabled — read plan frontmatter for \`tdd: true\`. If present: "ENABLED", else: "DISABLED (standard execution)"}

<execution_rules>
- Execute each task in the plan sequentially
- Commit atomically after each task (git add . && bun run commit)
- Create SUMMARY.md when complete
- Log findings to WORKING.md
- Handle deviations per deviation rules
- If TDD Mode is ENABLED: follow TDD execution flow (generate tests -> confirm RED -> implement -> confirm GREEN) for each task
- If a task has \`testable: false\`: skip TDD for that task, execute normally
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

**TDD Mode:** {tdd_enabled_or_disabled — read plan frontmatter for \`tdd: true\`. If present: "ENABLED", else: "DISABLED (standard execution)"}

<execution_rules>
- Execute each task in the plan sequentially
- Commit atomically after each task (git add . && bun run commit)
- Create SUMMARY.md when complete
- Log findings to WORKING.md
- Handle deviations per deviation rules
- If TDD Mode is ENABLED: follow TDD execution flow (generate tests -> confirm RED -> implement -> confirm GREEN) for each task
- If a task has \`testable: false\`: skip TDD for that task, execute normally
</execution_rules>

Execute this plan. Return SUMMARY when complete.
""",
  subagent_type="lu-executor",
  model="{executor_model}",
  description="Execute {plan_02_name}"
)
\`\`\`

**Do NOT proceed to next wave until all Task calls return.**

### 5. Aggregate Results

- Collect summaries from all plans
- Report phase completion status

### 5.1 Parse Sub-Agent Results

When sub-agents return, attempt to parse their output as a result envelope:

\`\`\`json
{
  "status": "success|partial|failed|timeout",
  "summary": "Brief description of what was accomplished",
  "artifacts": [{ "path": "file.ts", "action": "created" }],
  "issues": [
    { "severity": "medium", "message": "...", "source_agent": "lu-executor" }
  ],
  "metadata": { "agent_name": "lu-executor", "context_tier": "T2" }
}
\`\`\`

If a sub-agent returns plain text instead of JSON, wrap it as:

- status: "partial"
- summary: the raw text (truncated to 2000 chars)
- artifacts: []
- issues: []

This ensures all sub-agent outputs can be uniformly aggregated.

### 6. Commit Orchestrator Corrections

\`\`\`bash
git status --porcelain
\`\`\`

If changes exist:

\`\`\`bash
git add .
bun run commit --message="orchestrator corrections" --type=fix --scope={phase} --no-push --skip-checks
\`\`\`

### 6.5. Run Verification Harness

**Run automated quality checks before agent verification.**

Run the harness runner:

\`\`\`bash
# Run harness (outputs JSON to stdout)
HARNESS_OUTPUT=$(bun run ./src/harness/runner.ts --project-dir=.)
HARNESS_EXIT=$?
echo "$HARNESS_OUTPUT"
\`\`\`

Parse the JSON output:

- If \`status: "passed"\` -- display results and continue to Step 7
- If \`status: "failed"\` -- enter failure-to-fix loop (Step 6.6)

Display:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► VERIFICATION HARNESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Check     | Status | Errors | Duration |
|-----------|--------|--------|----------|
| {name}    | {pass/fail} | {N} | {Ns}  |

Overall: {PASSED/FAILED}
\`\`\`

### 6.6. Loop A: Harness Fix Loop

**When harness checks fail (Step 6.5), run the unified iteration loop for mechanical failures.**

**This loop uses decision-support utilities from \`src/iteration/\`. You (the orchestrator) ARE the loop controller. Call the CLI utilities for convergence detection, error classification, checkpoint management, and budget tracking.**

#### 6.6.1. Initialize Loop A

Read iteration configuration:

\`\`\`bash
# Read complexity level from STATE.md
COMPLEXITY=$(grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}')

# Read iteration config
CONFIG=$(cat .planning/config.json)

# Extract limits: harnessFixIterations from complexity matrix
MAX_ITERATIONS=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const level = '\${COMPLEXITY}' || 'MODERATE';
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

# Override mode if --mode flag was passed
MODE="\${MODE_FLAG:-$DEFAULT_MODE}"
\`\`\`

Initialize tracking state:

\`\`\`bash
# Create initial budget state
BUDGET=$(bun run src/iteration/budget.ts create \\
  --max-iterations="$MAX_ITERATIONS" \\
  --soft-stop-percent="$SOFT_STOP")

# Initialize empty fingerprint ledger for error classification
LEDGER='{}'

# Initialize previous errors as empty (first iteration has no previous)
PREVIOUS_ERRORS='[]'
STALE_COUNT=0
PHASE_NUM={phase_number}
\`\`\`

Display loop start:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ITER ► LOOP A: HARNESS FIX (max {MAX_ITERATIONS} iterations, mode: {MODE})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`

#### 6.6.2. Loop A Iteration Cycle

For each iteration, follow these steps IN ORDER:

**Step A: Budget Pre-Check**

\`\`\`bash
BUDGET_CHECK=$(bun run src/iteration/budget.ts should-start --state="$BUDGET")
ALLOWED=$(echo "$BUDGET_CHECK" | bun -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).allowed)")
REASON=$(echo "$BUDGET_CHECK" | bun -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).reason)")
\`\`\`

If \`ALLOWED\` is false: display reason, exit loop with outcome "budget_exhausted".

**Step B: Classify Errors**

Classify the harness errors from the most recent harness run:

\`\`\`bash
CLASSIFIED=$(bun run src/iteration/classifier.ts \\
  --harness-result="$HARNESS_OUTPUT" \\
  --ledger="$LEDGER" \\
  --promotion-threshold="$PROMOTION_THRESHOLD")

# Extract classified errors and updated ledger
CURRENT_ERRORS=$(echo "$CLASSIFIED" | bun -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).classified))")
LEDGER=$(echo "$CLASSIFIED" | bun -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).updated_ledger))")
\`\`\`

Check for permanent errors. If any errors were newly promoted to permanent, log them:

\`\`\`
◆ Permanent errors (excluded from convergence):
  - {file}:{line} — {message} (seen {N} iterations)
\`\`\`

**Step C: Convergence Check** (skip for iteration 1 — no previous to compare)

If this is iteration 2+:

\`\`\`bash
# Get artifact delta from previous checkpoint
PREV_TAG="iter/\${PHASE_NUM}/harness/$((ITERATION - 1))"
ARTIFACT_DELTA=$(bun run src/iteration/checkpoint.ts artifact-delta --from-ref="$PREV_TAG")

# Assess convergence
CONVERGENCE=$(bun run src/iteration/convergence.ts \\
  --current="$CURRENT_ERRORS" \\
  --previous="$PREVIOUS_ERRORS" \\
  --artifact-delta="$ARTIFACT_DELTA" \\
  --previous-stale-count="$STALE_COUNT" \\
  --stale-threshold="$STALE_THRESHOLD")

CONV_STATUS=$(echo "$CONVERGENCE" | bun -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).status)")
SHOULD_HALT=$(echo "$CONVERGENCE" | bun -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).should_halt)")
STALE_COUNT=$(echo "$CONVERGENCE" | bun -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).consecutive_stale)")
\`\`\`

If \`SHOULD_HALT\` is true: display convergence failure, exit loop with outcome "convergence_failure".

Display convergence status:

\`\`\`
◆ Convergence: {CONV_STATUS} (stale count: {STALE_COUNT}/{STALE_THRESHOLD})
\`\`\`

**Step D: Create Checkpoint**

\`\`\`bash
COMMIT_HASH=$(bun run src/iteration/checkpoint.ts commit-hash)
TAG="iter/\${PHASE_NUM}/harness/\${ITERATION}"

# Build iteration record JSON and create checkpoint
RECORD='{ "tag": "'$TAG'", "phase": '$PHASE_NUM', "loop": "harness", "iteration": '$ITERATION', ... }'
bun run src/iteration/checkpoint.ts create --record="$RECORD"
\`\`\`

Fill in the full IterationRecord fields: error_count, error_delta, error_fingerprints, convergence_status, stale_count, permanent_errors, correctable_errors, transient_errors, artifacts_delta, commit_hash, agent_invoked, duration_ms, timestamp.

**Step E: HITL/AFK Decision Point**

If \`MODE\` is "hitl":

Display iteration summary table:

\`\`\`
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
\`\`\`

Wait for user input. Route by choice:

- **Continue**: Proceed to Step F
- **Rollback**: Run \`bun run src/iteration/checkpoint.ts rollback --tag="iter/\${PHASE_NUM}/harness/$((ITERATION-1))"\`. Decrement iteration counter. Re-run harness. Return to Step A.
- **Abort**: Exit loop with outcome "user_abort"
- **Skip**: Exit loop with outcome "user_skip"

If \`MODE\` is "afk": Skip to Step F (no pause).

**Step F: Spawn Executor with Fix Context**

Prepare fix context from classified errors. Include only correctable and transient errors (permanent are skipped):

\`\`\`python
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
\`\`\`

**Step G: Re-run Harness**

\`\`\`bash
HARNESS_OUTPUT=$(bun run ./src/harness/runner.ts --project-dir=.)
HARNESS_EXIT=$?
\`\`\`

If harness passes (status: "passed"): Exit loop with outcome "all_passed".

If harness fails: Update \`PREVIOUS_ERRORS = CURRENT_ERRORS\`, advance budget:

\`\`\`bash
BUDGET=$(bun run src/iteration/budget.ts advance --state="$BUDGET")
\`\`\`

Return to Step A for next iteration.

#### 6.6.3. Loop A Termination

When the loop exits (any outcome), display:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ITER ► LOOP A COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Outcome: {outcome}
Iterations: {N}/{MAX}
Active errors remaining: {count}
Permanent errors: {count}
\`\`\`

Pass results to Step 7 (verifier context):

- \`harness_status\`: "passed" if outcome is "all_passed", else "failed_after_fixes"
- \`harness_checks\`: from last harness run
- \`remaining_errors\`: classified errors still active
- \`loop_a_outcome\`: the outcome string
- \`loop_a_iterations\`: count

### 7. Verify Phase Goal

**MANDATORY**: You MUST spawn a lu-verifier sub-agent. Do NOT attempt to verify yourself.

First, read the required context:

\`\`\`bash
PHASE_DIR=".planning/phases/{phase_number}-*"
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
STATE_CONTENT=$(cat .planning/STATE.md)
WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "")
SUMMARIES=$(find $PHASE_DIR -name "*-SUMMARY.md" -exec cat {} \\;)
PLAN_CONTENTS=$(find $PHASE_DIR -name "*-PLAN.md" -exec cat {} \\;)
\`\`\`

Then spawn the verifier:

\`\`\`python
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

<!-- WARM ISOLATION: Verifier does NOT receive WORKING.md to prevent bias from executor's session notes -->
<!-- The working_content variable below should be empty or omitted when using context-aware spawning -->
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
\`\`\`

**Do NOT proceed until the Task returns.**

Route by returned status:

- \`passed\` → continue to Step 8 (Code Quality Review)
- \`human_needed\` → present items, get approval, then continue to Step 8
- \`gaps_found\` → proceed to Step 7.5 (Loop B: Verify Fix Loop)

**Note:** When gaps are found, Loop B will attempt automated gap resolution. Only if Loop B fails to resolve all gaps will the user be offered \`/phase-plan {X} --gaps\`.

### 7.5. Loop B: Verify Fix Loop

**When the verifier finds gaps (status: gaps_found), run the unified iteration loop for semantic gaps.**

**This loop re-executes ONLY the plans identified by the verifier's \`source_plan\` attribution.** Plans without gaps are NOT re-executed.

**Skip this step if:**

- Verifier status is "passed" or "human_needed"
- \`verifyFixIterations\` for the current complexity is 0 (e.g., TRIVIAL)
- \`--skip-verify-loop\` flag was passed

#### 7.5.1. Initialize Loop B

\`\`\`bash
# Extract verifyFixIterations from complexity matrix
VERIFY_MAX=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const level = '\${COMPLEXITY}' || 'MODERATE';
  console.log(c.complexity?.matrix?.[level]?.verifyFixIterations ?? 1);
")
\`\`\`

If \`VERIFY_MAX\` is 0: Skip Loop B, proceed to Step 8.

\`\`\`bash
# Create budget state for Loop B
VERIFY_BUDGET=$(bun run src/iteration/budget.ts create \\
  --max-iterations="$VERIFY_MAX" \\
  --soft-stop-percent="$SOFT_STOP")

VERIFY_STALE_COUNT=0
VERIFY_ITERATION=0
\`\`\`

Display:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ITER ► LOOP B: VERIFY FIX (max {VERIFY_MAX} iterations, mode: {MODE})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`

#### 7.5.2. Extract Gap-Targeted Plans

Parse the verifier's VERIFICATION.md frontmatter to extract gaps with source_plan attribution:

\`\`\`bash
# Read VERIFICATION.md and extract gaps with source_plan
VERIFICATION_MD=$(cat .planning/phases/{phase_dir}/*-VERIFICATION.md)
\`\`\`

From the YAML frontmatter, extract unique \`source_plan\` values from the gaps. These are the plans that need re-execution.

If no \`source_plan\` fields are present (verifier did not attribute gaps to plans): Re-execute ALL plans in the last wave with gap context. This is the backward-compatible fallback.

#### 7.5.3. Loop B Iteration Cycle

Follow the same pre-check/execute/evaluate cycle as Loop A, with these differences:

**Step B-A: Budget Pre-Check**

Same as Loop A Step A, using \`VERIFY_BUDGET\`.

**Step B-B: Spawn Targeted Executors**

For each plan with gaps, spawn a fix executor with gap-targeted instructions:

\`\`\`python
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
\`\`\`

Spawn all gap-targeted executors in PARALLEL (same message, multiple Task calls).

**Step B-C: Re-run Harness**

After executors return, re-run the harness to ensure fixes didn't break mechanical checks:

\`\`\`bash
HARNESS_OUTPUT=$(bun run ./src/harness/runner.ts --project-dir=.)
\`\`\`

If harness fails: Enter Loop A mini-loop (1 iteration only) to fix mechanical breakage, then continue Loop B.

**Step B-D: Re-run Verifier**

Spawn the verifier again (same context as Step 7, updated with new summaries):

\`\`\`python
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
\`\`\`

If verifier returns "passed": Exit Loop B with outcome "all_passed".
If verifier returns "gaps_found": Continue to convergence check.
If verifier returns "human_needed": Exit Loop B, proceed to human verification.

**Step B-E: Convergence Check**

Compare current gaps to previous gaps. Use gap count as the error signal:

- \`error_count_delta\`: current gap count - previous gap count
- \`fingerprint_overlap\`: Compare gap truth strings (hashed) for identity
- \`artifact_change_delta\`: from git diff --stat

Assess convergence same as Loop A. If should_halt: exit with "convergence_failure".

**Step B-F: Checkpoint & HITL**

Create checkpoint (same as Loop A, using "verify" loop type).
If HITL mode: display iteration summary and 4-choice menu.
Advance budget.

Return to Step B-A for next iteration.

#### 7.5.4. Loop B Termination

When Loop B exits, display summary same as Loop A.

If outcome is "all_passed": Continue to Step 8 (Code Quality Review).
If outcome is anything else: Display remaining gaps and offer \`/phase-plan {X} --gaps\` to the user.

### 8. Code Quality Review

**Skip if:** \`--skip-review\` flag passed OR \`workflow.code_review: false\` in config OR complexity is TRIVIAL or SIMPLE.

**Complexity gate:** Code review runs at MODERATE and above. TRIVIAL/SIMPLE skip code review entirely.

Get changed files for this phase:

\`\`\`bash
# Get TypeScript/TSX files changed in this branch vs main
CHANGED_FILES=$(git diff --name-only main...HEAD -- '*.ts' '*.tsx' 2>/dev/null | head -50)
FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c '.' || echo "0")
\`\`\`

**If no changed files:** Skip to step 9.

Display:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► CODE QUALITY REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Reviewing {FILE_COUNT} changed files...
\`\`\`

**Determine which reviewers to spawn:**

**Spawn based on complexity level** (read from STATE.md \`Task Complexity:\` field):

| Agent            | MODERATE      | COMPLEX       | CRITICAL |
| ---------------- | ------------- | ------------- | -------- |
| dx-advocate      | Run           | Run           | Run      |
| code-simplifier  | Run           | Run           | Run      |
| code-architect   | Skip          | Run           | Run      |
| tailwind-auditor | If UI files   | If UI files   | Run      |
| security-auditor | If auth files | If auth files | Always   |

If complexity not set, default to spawning all reviewers (backward-compatible).

Conditionally spawn \`security-auditor\` if files match patterns:

\`\`\`bash
echo "$CHANGED_FILES" | grep -E '(auth|api|convex|mutation|query|middleware|proxy)' && NEEDS_SECURITY=true
\`\`\`

**MANDATORY**: Spawn ALL applicable reviewers in a SINGLE message with multiple Task calls (PARALLEL).

**Context isolation:** Code reviewers operate in COLD isolation. They receive:

- Git diff of changed files (not full file contents)
- BRAIN.md summary (project conventions only)
- NO STATE.md, NO WORKING.md, NO MEMORY.md

This prevents reviewer bias from executor session context.

First, read project standards:

\`\`\`bash
CLAUDE_CONTENT=$(cat CLAUDE.md 2>/dev/null || echo "No CLAUDE.md")
\`\`\`

Then spawn all reviewers in PARALLEL:

\`\`\`\`python
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
\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: dx-advocate
\`\`\`\`

If no issues found, return: \`issues: []\`
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

\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: code-simplifier
\`\`\`

If no issues found, return: \`issues: []\`
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

\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: code-architect
\`\`\`

If no issues found, return: \`issues: []\`
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

\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: tailwind-auditor
\`\`\`

If no issues found, return: \`issues: []\`
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

\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: security-auditor
\`\`\`

If no issues found, return: \`issues: []\`
""",
subagent_type="security-auditor",
model="{reviewer_model}",
description="Security review"
)

\`\`\`

**Do NOT proceed until ALL reviewer Tasks return.**

**Merge findings:** Combine all issues, deduplicate by file:line.

### 8.1. Handle Code Review Results

**Route based on findings:**

| Severity | Action |
|----------|--------|
| CRITICAL | Block - must fix before continuing |
| HIGH | Strong warning - recommend fixing |
| MEDIUM | Warning - note for later |
| LOW | Informational only |

**If CRITICAL issues found:**

\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Luca ► CRITICAL CODE ISSUES ✗
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} critical issues must be fixed before continuing.

| File   | Line   | Issue   |
| ------ | ------ | ------- |
| {file} | {line} | {issue} |

## ▶ Next Up

Planning fixes automatically...

\`\`\`

- Spawn \`lu-planner\` in quality_fixes mode
- Spawn \`lu-plan-checker\` to verify plans
- Present ready status for \`/phase-execute {phase} --quality-fixes\`
- **EXIT** (user must run execute again with --quality-fixes)

**If HIGH/MEDIUM only:**

\`\`\`

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

\`\`\`\`

Wait for user response, then proceed accordingly.

**If clean (or LOW only):** Continue to step 9.

### 9. Update Roadmap and State

Update ROADMAP.md, STATE.md

### 10. Update Requirements

Mark phase requirements as Complete in REQUIREMENTS.md traceability table.

### 10.5. Checkpoint Cleanup

After the phase passes verification (Loop A + Loop B both succeeded or were not needed):

\`\`\`bash
# Prune all iteration checkpoints for this phase
bun run src/iteration/checkpoint.ts prune --phase={phase_number}
\`\`\`

This removes all \`iter/{phase}/*\` git tags and \`.planning/checkpoints/iter-{phase}-*.json\` metadata files, keeping the git tag namespace and checkpoint directory clean for future phases.

### 11. Commit Phase Completion

\`\`\`bash
git add .
bun run commit --message="complete {phase-name} phase" --type=docs --scope={phase} --no-push --skip-checks
\`\`\`\`

### 12. User Acceptance Testing (UAT)

**Skip if:** \`--skip-uat\` flag passed OR \`workflow.uat_required: false\` in config OR complexity is TRIVIAL or SIMPLE.

**Complexity gate:** UAT runs at MODERATE (optional) and above. For COMPLEX/CRITICAL, UAT is required.

| Complexity | UAT                               |
| ---------- | --------------------------------- |
| TRIVIAL    | Skip                              |
| SIMPLE     | Skip                              |
| MODERATE   | Optional (runs unless --skip-uat) |
| COMPLEX    | Required                          |
| CRITICAL   | Required + thorough               |

**Auto-transition into UAT mode:**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} EXECUTION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {Z}: {Name}**
{Y} plans executed
Goal verified ✓
Code review passed ✓

## ▶ Starting UAT

Testing deliverables from this phase...
\`\`\`

**Follow verify-work workflow inline:**

Read \`.cursor/luca/workflows/verify-work.md\` for detailed UAT process.

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

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} VERIFIED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N}/{N} UAT tests passed ✓
Code review passed ✓

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

/phase-discuss {Z+1} — gather context and clarify approach
\`\`\`

**Route B: All tests pass, milestone complete**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► MILESTONE COMPLETE 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} phases completed
All UAT tests passed ✓
All code reviews passed ✓

## ▶ Next Up

/milestone-audit
\`\`\`

**Route C: UAT issues found**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} ISSUES FOUND ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N}/{M} tests passed
{X} issues found

## ▶ Diagnosing and Planning Fixes...
\`\`\`

- Spawn parallel debug agents to diagnose root causes
- Spawn lu-planner in --gaps mode to create fix plans
- Spawn lu-plan-checker to verify fix plans
- Present ready status:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► FIXES READY ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} gap(s) diagnosed, {M} fix plan(s) created

## ▶ Next Up

/clear then /phase-execute {Z} --gaps-only
\`\`\`

**Route D: Verifier gaps found (before UAT)**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} GAPS FOUND ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Score: {N}/{M} must-haves verified

## ▶ Next Up

/phase-plan {Z} --gaps
\`\`\`

## Deviation Rules

During execution, handle discoveries automatically:

1. **Auto-fix bugs** - Fix immediately, document in Summary
2. **Auto-add critical** - Security/correctness gaps, add and document
3. **Auto-fix blockers** - Can't proceed without fix, do it and document
4. **Ask about architectural** - Major structural changes, stop and ask user

## Commit Rules

**IMPORTANT:** Always use \`bun run commit\` with flags. Always stage ALL files with \`git add .\` before committing. Partial commits are not allowed in standard workflow.

**Per-Task Commits:**

\`\`\`bash
git add .
bun run commit --message="{task-name}" --type={type} --scope={phase}-{plan} --no-push --skip-checks
\`\`\`

**Plan Metadata Commit:**

\`\`\`bash
git add .
bun run commit --message="complete {plan-name} plan" --type=docs --scope={phase}-{plan} --no-push --skip-checks
\`\`\`

**Phase Completion Commit:**

\`\`\`bash
git add .
bun run commit --message="complete {phase-name} phase" --type=docs --scope={phase} --no-push --skip-checks
\`\`\`

## Success Criteria

- [ ] All incomplete plans in phase executed
- [ ] Each plan has SUMMARY.md
- [ ] Phase goal verified (must_haves checked against codebase)
- [ ] VERIFICATION.md created in phase directory
- [ ] Code review subagents spawned (dx-advocate, code-simplifier, code-architect, tailwind-auditor, security-auditor)
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
| UAT passed, more phases        | Discuss next phase    | \`/phase-discuss {N+1}\`               |
| UAT passed, milestone complete | Audit milestone       | \`/milestone-audit\`                   |
| UAT gaps found                 | Execute gap fixes     | \`/phase-execute {N} --gaps-only\`     |
| Code review critical issues    | Execute quality fixes | \`/phase-execute {N} --quality-fixes\` |
| Verifier gaps found            | Plan gap closure      | \`/phase-plan {N} --gaps\`             |

**Primary:** \`/progress\` — Check status and get smart routing

**Also available:**

- \`/verify {phase}\` — Run UAT separately
- \`/session-pause\` — Create handoff if stopping mid-work
</main>
`,
      order: 1,
    },
  ],
};

export class PhaseExecuteSkill extends BaseSkillImpl {
  constructor() {
    super(phaseExecuteConfig);
  }
}
