# <%= branding.commandSlash %>

Unified entry point and autonomous orchestrator for all <%= branding.frameworkName %> workflows with cognitive pre-flight, complexity routing, and configurable oversight.

## main

**Branding:** Read `.planning/config.json` branding section. Use `/{commandPrefix}` and `{frameworkName}` in user-facing output. Defaults: `<%= branding.commandSlash %>`, `<%= branding.frameworkName %>`.

The single entry point for all <%= branding.frameworkName %> workflows. This is a **flat Agent() orchestrator** — it spawns leaf-worker agents via Agent(), manages state, and controls the pipeline.

**Arguments:** `<task-description | Jira-URL | [TICKET-ID]> [--complexity=LEVEL] [--force-complex] [--skip-memory] [--skip-branch] [--oversight=MODE] [--skip-backlog] [--max-phases=N] [--no-swarm] [--dry-run] [--ask] [--v2]`

## Constraints

1. **ALL Agent() calls originate from this orchestrator** — sub-agents are leaf workers that CANNOT call Agent(), Task(), or Skill()
2. **Every step is binding** — you MUST NOT skip, simplify, or substitute workflow steps
3. **NEVER write code directly** — delegate to Agent() sub-agents for all code work
4. **Prompt templates** are in `src/skills/__helpers/agent-prompts.ts` — read that file with the Read tool when you need a template, then pass its content as the Agent() prompt
5. **v2 prompt templates** are also in `agent-prompts.ts` — RESEARCH_SCOPE_PROMPT, PARALLEL_RESEARCH_PROMPT, RESEARCH_SYNTHESIS_PROMPT, RESEARCH_REVIEW_PROMPT, RESEARCH_GRADUATION_PROMPT, PLAN_REVIEW_PROMPT

## Context File: `/tmp/lu-context.json`

```bash
bun src/skills/__schemas/context-cli.ts init lu          # Initialize
bun src/skills/__schemas/context-cli.ts write lu '{"lu_route":{"request_parsed":true}}'  # Write sub-agent output
bun src/skills/__schemas/context-cli.ts read lu           # Read context
```

## Vault Resolution

```bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then REPO_VAULT=${LUCA_MUNINN_VAULT:-default}; fi
```

## Pipeline

### Step 1: Parse Args, Crash Recovery, Initialize

Parse user request and all CLI flags.

**Crash recovery:**
```bash
EXISTING_STATE=$(bun src/skills/__schemas/context-cli.ts state lu 2>/dev/null || echo "")
PIPELINE_POS=$(luca-bridge read-field --field=pipeline_position 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.value || 'idle')" 2>/dev/null || echo "idle")
if [ "$PIPELINE_POS" != "idle" ] || ([ -n "$EXISTING_STATE" ] && [ "$EXISTING_STATE" != "idle" ] && [ "$EXISTING_STATE" != "unknown" ]); then
  echo "Resuming from pipeline position: $PIPELINE_POS (context state: $EXISTING_STATE)"
  # Skip completed steps based on PIPELINE_POS
else
  bun src/skills/__schemas/context-cli.ts init lu
fi
```

```bash
luca-bridge write-status --skill=lu --stage=INITIALIZING 2>/dev/null || true
```

### Step 2: Cognitive Pre-Flight + Classify + Route (idle -> routed)

Read `agent-prompts.ts`, spawn:
```
Agent(name: "cognition", prompt: COGNITION_PROMPT({phase, complexity, vault, currentState}))
Agent(name: "classify", prompt: CLASSIFY_PROMPT({...}))
```

Parse COMPLEXITY and ROUTE from classify agent's output.

```bash
luca-bridge write-status --step=preflight 2>/dev/null || true
luca-bridge transition --event=START 2>/dev/null || true
luca-bridge transition --event=PREFLIGHT_COMPLETE 2>/dev/null || true
luca-bridge transition --event=ROUTE_COMPLETE --data='{"complexity":"COMPLEXITY_LEVEL"}' 2>/dev/null || true
```

(Replace COMPLEXITY_LEVEL with the actual classified complexity.)

### Step 3: Route Branch

**If ROUTE != "phase-execute":** Handle non-phase-execute routes:
```
Agent(name: "{route}-handler", prompt: ROUTE_HANDLER_PROMPT(route, {...}))
```
Then: Agent("verify-route") + Agent("learn-route") (conditional), commit, write "complete", RETURN.

**If ROUTE == "phase-execute":** Continue to Step 4.

### Step 4: Configure Session (routed -> configured)

```
Agent(name: "configure", prompt: CONFIGURE_PROMPT({...}))
```

**v2 config resolution:**
```bash
# Read workflow version from config (default: "v1")
WORKFLOW_VERSION=$(cat .planning/config.json 2>/dev/null | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$WORKFLOW_VERSION" ]; then WORKFLOW_VERSION="v1"; fi
# CLI override: --v2 flag forces v2 regardless of config
if echo "$ARGS" | grep -q -- "--v2"; then WORKFLOW_VERSION="v2"; fi
```

### Step 4.5: Git Workflow Setup (INLINE, conditional: not --skip-branch)

If --skip-branch flag is present: SKIP this step entirely.

This step MUST run before any code work. It creates the GitHub issue and feature branch that all subsequent commits will land on.

**1. Create GitHub issue for the milestone/task:**

```bash
# Extract milestone title from ROADMAP.md current milestone
MILESTONE_TITLE=$(grep "^## v" .planning/ROADMAP.md | head -1 | sed 's/^## //')
# Or use the task description for non-milestone work

ISSUE_URL=$(gh issue create \
  --title "$MILESTONE_TITLE" \
  --body "## Summary\n\n[Auto-generated from <%= branding.commandSlash %> orchestrator]\n\nPhases and deliverables TBD after planning." \
  --label "enhancement" 2>&1)
ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -o '[0-9]*$')
```

**2. Create feature branch from current base:**

```bash
# Branch naming convention:
# - Milestones: {version}--{kebab-case-description} (e.g., v8.6.0--scout-article-intelligence)
# - Single phases: phase-{NN}--{kebab-case-description}
# - Non-milestone: {ticket-id}--{kebab-case-description}
# - Fallback: PROJ-0000--{kebab-case-description}

git checkout -b "$BRANCH_NAME"
git push -u origin "$BRANCH_NAME"
```

**3. Store in context for later PR creation:**

Write ISSUE_NUMBER, ISSUE_URL, and BRANCH_NAME to the lu context file so Step 8 (Milestone Boundary) can create the PR.

```bash
bun src/skills/__schemas/context-cli.ts write lu "{\"git_workflow\":{\"issue_number\":$ISSUE_NUMBER,\"issue_url\":\"$ISSUE_URL\",\"branch_name\":\"$BRANCH_NAME\"}}"
```

**4. Update STATE.md** with the branch and issue info for visibility.

### Step 5: Backlog Scan (configured -> scanned) — CONDITIONAL

If --skip-backlog or config backlog_scan==false: skip.

Otherwise:
```
Agent(name: "backlog", prompt: BACKLOG_PROMPT({...}))
```

### Step 6: Build Phase Execution Order (INLINE)

Read .planning/ROADMAP.md. Parse incomplete phases. Build dependency graph. Topological sort. Apply MAX_PHASES limit. If --dry-run: display plan and RETURN.

### Step 7: Phase Execution Loop

**FOR each phase in execution order (serial):**

Write loop counter to context file for recovery: `{"loop_index": N, "remaining_phases": [...]}`

#### 7a. Phase dependency check (INLINE)
Verify all dependencies complete. If not: park phase, continue.

#### 7b. Oversight gate (INLINE, interactive)
If oversight != "full-auto": prompt user for phase confirmation.

#### 7c. Per-phase complexity re-classify
```
Agent(name: "classify-{NN}", prompt: CLASSIFY_PROMPT({phase: NN, ...}))
```

#### 7d. Gate resolution (INLINE)
```bash
PREMORTEM=$(luca-bridge gate-check --gate=premortem 2>/dev/null | ...)
PROCESS_DATA=$(luca-bridge gate-check --gate=process_data 2>/dev/null | ...)
```

#### 7d-v2. Research Pipeline (v2 ONLY — skip entirely if WORKFLOW_VERSION != "v2")

`luca-bridge write-status --step=research --phase={NN} 2>/dev/null || true`

**Gate:** If WORKFLOW_VERSION != "v2": SKIP to 7e. This entire block is fail-closed.

**Graceful degradation:** If ANY v2 step below fails (agent returns failure or error), log the failure and SKIP remaining v2 steps. Continue to 7e (Discussion) with whatever research context is available. v1 pipeline is never blocked by v2 failures.

**7d-v2a. Research Scope** (skip if research/ directory already populated)
```
Agent(name: "research-scope-{NN}", prompt: RESEARCH_SCOPE_PROMPT({phase: NN, ...}))
```
Parse RESEARCH-SCOPE.md to get specialist assignments.

**7d-v2b. Parallel Research** (spawn 4 specialists simultaneously)
```
Agent(name: "research-arch-{NN}", prompt: PARALLEL_RESEARCH_PROMPT("architecture", {...}))
Agent(name: "research-impl-{NN}", prompt: PARALLEL_RESEARCH_PROMPT("implementation", {...}))
Agent(name: "research-eco-{NN}", prompt: PARALLEL_RESEARCH_PROMPT("ecosystem", {...}))
Agent(name: "research-risk-{NN}", prompt: PARALLEL_RESEARCH_PROMPT("risks", {...}))
```

**7d-v2c. Research Synthesis**
```
Agent(name: "research-synth-{NN}", prompt: RESEARCH_SYNTHESIS_PROMPT({phase: NN, ...}))
```

**7d-v2d. Research Review Loop** (iterate up to researchReviewIterations)
```
FOR iteration = 1 to RESEARCH_REVIEW_ITERATIONS:
  # Spawn 3 reviewers in parallel
  Agent(name: "review-accuracy-{NN}", prompt: RESEARCH_REVIEW_PROMPT("accuracy", {...}))
  Agent(name: "review-completeness-{NN}", prompt: RESEARCH_REVIEW_PROMPT("completeness", {...}))
  Agent(name: "review-actionability-{NN}", prompt: RESEARCH_REVIEW_PROMPT("actionability", {...}))
  # Check results
  IF all reviewers PASS or no CRITICAL_GAPS: BREAK
  # Expand research for gaps
  Agent(name: "research-expand-{NN}-{iteration}", prompt: expand gaps from reviewer feedback)
  Agent(name: "research-synth-{NN}-{iteration}", prompt: RESEARCH_SYNTHESIS_PROMPT re-merge)
```

**7d-v2e. Research Graduation**
```
Agent(name: "research-graduate-{NN}", prompt: RESEARCH_GRADUATION_PROMPT({phase: NN, ...}))
```

#### 7e. Discussion (conditional: skip if --skip-discuss)

`luca-bridge write-status --step=discuss --phase={NN} 2>/dev/null || true`

```
Agent(name: "discuss-{NN}", prompt: phase discussion with premortem if --run-premortem)
```
After discussion returns (or if skipped):
```bash
luca-bridge transition --event=DISCUSS_COMPLETE 2>/dev/null || true
# If discussion was skipped: luca-bridge transition --event=SKIP 2>/dev/null || true
```

#### 7f. Plan existence check (INLINE)
If .planning/phases/{NN}-*/PLAN.md exists: skip planning.

#### 7g. Planning

`luca-bridge write-status --step=plan --phase={NN} 2>/dev/null || true`

```
Agent(name: "plan-{NN}", prompt: create PLAN.md with tasks and wave grouping)
```
After planning returns:
```bash
luca-bridge transition --event=PLAN_COMPLETE 2>/dev/null || true
```

#### 7g-v2. Plan Review Loop (v2 ONLY — skip if WORKFLOW_VERSION != "v2")

**Gate:** If WORKFLOW_VERSION != "v2": SKIP to 7h. Fail-closed.

```
PREVIOUS_ISSUES=""
FOR iteration = 1 to PLAN_REVIEW_ITERATIONS:
  Agent(name: "plan-review-{NN}-{iteration}", prompt: PLAN_REVIEW_PROMPT(iteration, PREVIOUS_ISSUES, {...}))
  Parse RECOMMEND from agent output.
  IF RECOMMEND == "approve": BREAK
  IF RECOMMEND == "escalate": prompt user for decision, BREAK
  # Planner revises
  PREVIOUS_ISSUES = agent's issues output
  Agent(name: "plan-revise-{NN}-{iteration}", prompt: revise PLAN.md based on issues)
```

#### 7h. Execution

`luca-bridge write-status --step=execute --phase={NN} 2>/dev/null || true`

```
Agent(name: "execute-{NN}", prompt: EXECUTE_WAVES_PROMPT({phase: NN, ...}))
```

#### 7i. Harness Fix Loop (INLINE, hoisted)

`luca-bridge write-status --step=harness --phase={NN} 2>/dev/null || true`

```
FOR attempt = 1 to HARNESS_FIX_ITERATIONS:
  Agent(name: "harness-{NN}", prompt: HARNESS_CHECK_PROMPT({...}))
  IF PASSED: BREAK
  Agent(name: "fix-{NN}", prompt: HARNESS_FIX_PROMPT(errors, {...}))
```
Then: `luca-bridge transition --event=VERIFY_PASSED`

#### 7j. Goal-backward verification

`luca-bridge write-status --step=verify --phase={NN} 2>/dev/null || true`

```
Agent(name: "verify-{NN}", prompt: GOAL_VERIFY_PROMPT({phase: NN, ...}))
```

#### 7k. Code review (conditional: complexity >= MODERATE, not --skip-review)

`luca-bridge write-status --step=review --phase={NN} 2>/dev/null || true`

Spawn PARALLEL reviewers:
```
Agent(name: "review-arch-{NN}", prompt: CODE_REVIEW_PROMPT("architecture", {...}))
Agent(name: "review-dx-{NN}", prompt: CODE_REVIEW_PROMPT("dx-advocate", {...}))
Agent(name: "review-security-{NN}", prompt: CODE_REVIEW_PROMPT("security", {...}))
Agent(name: "review-simplify-{NN}", prompt: CODE_REVIEW_PROMPT("simplifier", {...}))
```

#### 7l. Learning capture

`luca-bridge write-status --step=learn --phase={NN} 2>/dev/null || true`

```
Agent(name: "learn-{NN}", prompt: LEARNING_CAPTURE_PROMPT({phase: NN, ...}))
```
`luca-bridge transition --event=LEARN_COMPLETE`

#### 7m. Process data (conditional: --run-process-data)
```
Agent(name: "process-data-{NN}", prompt: PROCESS_DATA_PROMPT({phase: NN, ...}))
```

#### 7n. Commit (INLINE)

`luca-bridge write-status --step=commit --phase={NN} 2>/dev/null || true`

Commits land on the feature branch created in Step 4.5 (or main if --skip-branch).
```bash
git add . && git commit -m "feat(#{ISSUE_NUMBER}): Phase {NN} — {phase description}"
# Push to remote after each phase commit:
git push
```

#### 7o. Update state (INLINE)
Mark phase complete in ROADMAP.md. Write loop counter + remaining phases to context file.

#### 7p. Gap closure retry (INLINE, if phase had failures)
```
FOR retry = 1 to GAP_RETRIES:
  Agent(name: "plan-gaps-{NN}", prompt: plan only for gaps)
  Agent(name: "execute-gaps-{NN}", prompt: execute gap plan only)
  Re-run harness (7i pattern)
  IF gaps closed: BREAK
IF still failing: park phase, cascade to dependents
```

### Step 8: Milestone Boundary Check

If all phases in current milestone complete:
```
Agent(name: "milestone-learn", prompt: MILESTONE_LEARN_PROMPT({...}))
Agent(name: "milestone-prune", prompt: MILESTONE_PRUNE_PROMPT({...}))
Agent(name: "milestone-shadow", prompt: MILESTONE_SHADOW_PROMPT({...}))  # conditional
Agent(name: "milestone-archive", prompt: MILESTONE_ARCHIVE_PROMPT({...}))
Agent(name: "milestone-finalize", prompt: MILESTONE_FINALIZE_PROMPT({...}))
```

#### 8a. Create Pull Request (INLINE, conditional: not --skip-branch)

If a feature branch was created in Step 4.5, create a PR to merge it back to main:

```bash
# Read git workflow context
ISSUE_NUMBER=$(bun src/skills/__schemas/context-cli.ts read lu 2>/dev/null | bun -e "..." || echo "")
BRANCH_NAME=$(git branch --show-current)

# Ensure all commits are pushed
git push

# Build PR body from phase results
# Include: summary of phases completed, key deliverables, file counts

gh pr create \
  --title "feat(#$ISSUE_NUMBER): $MILESTONE_TITLE" \
  --body "## Summary\n\n[Phase summaries]\n\n## Test plan\n\n- [ ] `bunx --bun tsc --noEmit` passes\n- [ ] All todos moved to done/\n\nCloses #$ISSUE_NUMBER\n\nGenerated with [Claude Code](https://claude.com/claude-code)"
```

Report the PR URL to the user.

### Step 9: Cross-Milestone Continuation (INLINE)

If CROSS_MILESTONE config == true and next milestone exists: loop back to Step 6.

### Step 10: Gap Detection Audit (INLINE)

Verify all required context sections are populated. Advisory warning if gaps found.

### Step 11: Session Summary + Cleanup

```bash
luca-bridge clear-status 2>/dev/null || true
```
`luca-bridge transition --event=COMMIT_COMPLETE`