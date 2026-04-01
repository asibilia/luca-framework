/**
 * lu Skill — Flat Agent() orchestrator for all Luca workflows.
 *
 * The single entry point that delegates ALL work to Agent() sub-agents.
 * Inlines the full phase execution loop (previously in lu-phase-loop).
 *
 * Agent() prompt templates live in `src/skills/__helpers/agent-prompts.ts`.
 * The compiled SKILL.md references templates by name — the LLM reads the
 * file at runtime via the Read tool. This keeps the compiled output small.
 *
 * ## Three-Layer Observability Architecture (Phase 250)
 *
 * Layer A — State machine transitions:
 *   The skill prompt emits luca-bridge transitions (PHASE_START, HARNESS_COMPLETE,
 *   PHASE_COMPLETE, etc.) and the agent-transition-sync hook auto-fires transitions
 *   for discuss-*, plan-*, verify-*, learn-* agent completions.
 *   Files: this file + src/hooks/scripts/agent-transition-sync.ts
 *
 * Layer B — Agent type routing:
 *   Every Agent() call specifies subagent_type (lu-executor, lu-planner, etc.)
 *   and model (resolved from MODEL_ROUTING_TABLE by complexity level).
 *   Files: this file + src/complexity/__helpers/model-routing.ts
 *
 * Layer C — Pipeline enforcement:
 *   pre-step-lu.ts validates agent names against state machine state.
 *   pre-step-lu-allowlist.ts warns on unregistered agent names.
 *   agent-status-sync.ts updates the statusline HUD.
 *   Files: src/hooks/scripts/pre-step-lu.ts, pre-step-lu-allowlist.ts, agent-status-sync.ts
 *
 * To add a new agent to the pipeline, update all four hook files:
 *   1. agent-status-sync.ts (LU_STEP_MAP) — status display
 *   2. agent-transition-sync.ts (lu block) — if it needs a state transition
 *   3. pre-step-lu.ts (agentPrefixes + validStates) — enforcement
 *   4. pre-step-lu-allowlist.ts (REGISTERED) — allowlist
 *   5. model-routing.ts (MODEL_ROUTING_TABLE) — if new subagent_type
 *
 * @see src/skills/__helpers/agent-prompts.ts
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const luSkillConfig: SkillConfig = {
  frontmatter: {
    name: "lu",
    description:
      "Unified entry point and autonomous orchestrator for all Luca workflows with cognitive pre-flight, complexity routing, and configurable oversight.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `**Branding:** Read \`.planning/config.json\` branding section. Use \`/{commandPrefix}\` and \`{frameworkName}\` in user-facing output. Defaults: \`/lu\`, \`Luca\`.

The single entry point for all Luca workflows. This is a **flat Agent() orchestrator** — it spawns leaf-worker agents via Agent(), manages state, and controls the pipeline.

**Arguments:** \`<task-description | Jira-URL | [TICKET-ID]> [--complexity=LEVEL] [--force-complex] [--skip-memory] [--skip-branch] [--oversight=MODE] [--skip-backlog] [--max-phases=N] [--no-swarm] [--dry-run] [--ask] [--v2] [--profile=budget|balanced|quality]\`

## Constraints

1. **ALL Agent() calls originate from this orchestrator** — sub-agents are leaf workers that CANNOT call Agent(), Task(), or Skill()
2. **Every step is binding** — you MUST NOT skip, simplify, or substitute workflow steps
3. **NEVER write code directly** — delegate to Agent() sub-agents for all code work
4. **Prompt templates** are in \`src/skills/__helpers/agent-prompts.ts\` — read that file with the Read tool when you need a template, then pass its content as the Agent() prompt
5. **v2 prompt templates** are also in \`agent-prompts.ts\` — RESEARCH_SCOPE_PROMPT, PARALLEL_RESEARCH_PROMPT, RESEARCH_SYNTHESIS_PROMPT, RESEARCH_REVIEW_PROMPT, RESEARCH_GRADUATION_PROMPT, PLAN_REVIEW_PROMPT
6. **Agent type routing** — every Agent() call MUST include \`subagent_type\` and \`model\`. After Step 2 determines COMPLEXITY, resolve model tiers from the routing table: fast→"haiku", balanced→"sonnet", capable→"opus". See the agent-to-type mapping table below.

## Agent Type Mapping

When spawning Agent() calls, ALWAYS include \`subagent_type\` and \`model\`:

| Agent name pattern | subagent_type | Routing preset |
|---|---|---|
| cognition | lu-cognition | ALWAYS_FAST (always haiku) |
| backlog | lu-phase-researcher | ORCHESTRATOR |
| discuss-* | lu-discuss-researcher | ORCHESTRATOR |
| plan-*, plan-revise-*, plan-gaps-* | lu-planner | ORCHESTRATOR |
| plan-review-* | lu-plan-checker | ORCHESTRATOR |
| execute-*, execute-gaps-*, fix-* | lu-executor | ORCHESTRATOR |
| harness-* | lu-verifier-fast | FAST_PROMOTED |
| verify-* | lu-verifier | DEEP_ANALYSIS |
| review-arch-* | code-architect | DEEP_ANALYSIS |
| review-dx-* | dx-advocate | DEEP_ANALYSIS |
| review-security-* | security-auditor | DEEP_ANALYSIS |
| review-simplify-* | code-simplifier | DEEP_ANALYSIS |
| learn-*, milestone-learn, milestone-archive, milestone-finalize | lu-learner | FAST_PROMOTED |
| process-data-* | lu-process-data | FAST_PROMOTED |
| milestone-prune | lu-shadow-scanner | FAST_PROMOTED |
| milestone-shadow | lu-shadow-scanner | FAST_PROMOTED |
| research-scope-* | lu-phase-researcher | ORCHESTRATOR |
| research-arch-* | lu-architecture-researcher | ROUTER |
| research-impl-* | lu-implementation-researcher | ROUTER |
| research-eco-* | lu-ecosystem-researcher | ROUTER |
| research-risk-* | lu-risk-researcher | ROUTER |
| research-synth-*, research-expand-* | lu-research-synthesizer | ORCHESTRATOR |
| research-graduate-* | lu-research-graduator | ORCHESTRATOR |
| review-accuracy-* | lu-accuracy-reviewer | DEEP_ANALYSIS |
| review-completeness-* | lu-completeness-reviewer | DEEP_ANALYSIS |
| review-actionability-* | lu-actionability-reviewer | DEEP_ANALYSIS |

**NOTE:** Model tiers shown are for the \`balanced\` profile. \`budget\` demotes non-protected agents one tier; \`quality\` promotes all agents one tier. Protected agents (lu-executor, lu-discuss-researcher, code-architect, dx-advocate, security-auditor, code-simplifier, lu-learner) ignore budget demotion.

**Routing presets by COMPLEXITY (resolve after Step 2):**

| Preset | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
|---|---|---|---|---|---|
| ALWAYS_FAST | haiku | haiku | haiku | haiku | haiku |
| FAST_PROMOTED | haiku | haiku | haiku | haiku | sonnet |
| ROUTER | haiku | haiku | sonnet | sonnet | sonnet |
| ORCHESTRATOR | haiku | sonnet | sonnet | opus | opus |
| DEEP_ANALYSIS | haiku | sonnet | opus | opus | opus |

## Context File: \`/tmp/lu-context.json\`

\`\`\`bash
bun src/skills/__schemas/context-cli.ts init lu          # Initialize
bun src/skills/__schemas/context-cli.ts write lu '{"lu_route":{"request_parsed":true}}'  # Write sub-agent output
bun src/skills/__schemas/context-cli.ts read lu           # Read context
\`\`\`

## Vault Resolution

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then REPO_VAULT=\${LUCA_MUNINN_VAULT:-default}; fi
\`\`\`

## Pipeline

### Step 1: Parse Args, Crash Recovery, Initialize

Parse user request and all CLI flags.

**Parse --profile flag:**
\`\`\`bash
# Token profile: budget | balanced | quality (default: balanced)
if echo "$ARGS" | grep -qo -- '--profile=[a-z]*'; then
  CLI_PROFILE=$(echo "$ARGS" | grep -o -- '--profile=[a-z]*' | head -1 | cut -d= -f2)
  # Validate: must be one of budget, balanced, quality
  case "$CLI_PROFILE" in
    budget|balanced|quality) ;;
    *) echo "WARNING: Invalid --profile=$CLI_PROFILE, falling back to balanced"; CLI_PROFILE="" ;;
  esac
fi
\`\`\`

**Initialize state machine:**
\`\`\`bash
luca-bridge ensure-init 2>/dev/null || true
\`\`\`

**Pipeline lock — prevent concurrent sessions and enable crash recovery:**
\`\`\`bash
# Step 0c: Pipeline lock
LOCK_STATUS=$(luca-bridge lock-status 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.status)" 2>/dev/null || echo "clear")
if [ "$LOCK_STATUS" = "live" ]; then
  LOCK_PID=$(luca-bridge lock-status 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.lock?.pid || 'unknown')" 2>/dev/null || echo "unknown")
  if echo "$ARGS" | grep -q -- "--force"; then
    echo "WARNING: Overriding live lock (PID $LOCK_PID) due to --force flag"
    luca-bridge lock-release 2>/dev/null || true
  else
    echo "ERROR: Another /lu session is already running (PID $LOCK_PID). Use --force to override."
    exit 1
  fi
elif [ "$LOCK_STATUS" = "stale" ]; then
  echo "INFO: Stale pipeline lock detected. Clearing for recovery."
  luca-bridge lock-release 2>/dev/null || true
fi
SESSION_ID=$(luca-bridge read-field --field=session_id 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.value || '')" 2>/dev/null || echo "")
if [ -z "$SESSION_ID" ]; then SESSION_ID=$(cat /dev/urandom | base64 | tr -dc 'a-z0-9' | head -c 12 2>/dev/null || echo "unknown"); fi
luca-bridge lock-acquire --session-id="$SESSION_ID" --pipeline-step="init" --phase-step="" 2>/dev/null || true
\`\`\`

**Crash recovery:**
\`\`\`bash
EXISTING_STATE=$(bun src/skills/__schemas/context-cli.ts state lu 2>/dev/null || echo "")
PIPELINE_POS=$(luca-bridge read-field --field=pipeline_position 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.value || 'idle')" 2>/dev/null || echo "idle")
if [ "$PIPELINE_POS" != "idle" ] || ([ -n "$EXISTING_STATE" ] && [ "$EXISTING_STATE" != "idle" ] && [ "$EXISTING_STATE" != "unknown" ]); then
  echo "Resuming from pipeline position: $PIPELINE_POS (context state: $EXISTING_STATE)"
  # Skip completed steps based on PIPELINE_POS
else
  bun src/skills/__schemas/context-cli.ts init lu
fi
\`\`\`


### Step 2: Cognitive Pre-Flight + Classify + Route (idle -> routed)

Read \`agent-prompts.ts\`, spawn cognition agent:
\`\`\`
Agent(name: "cognition", subagent_type: "lu-cognition", model: ALWAYS_FAST, prompt: COGNITION_PROMPT({phase, complexity, vault, currentState}))
\`\`\`

**Deterministic classification (no Agent() call):**

If \`--complexity\` flag was provided, skip the classifier entirely and use the override value.

Otherwise, run the deterministic classifier CLI:
\`\`\`bash
# Extract file count and scope from task description / ROADMAP context
FILE_COUNT=\${FILE_COUNT:-0}
SCOPE=\${SCOPE:-""}

CLASSIFY_RESULT=$(bun src/complexity/__helpers/classify.ts --description="$TASK_DESCRIPTION" --file-count=$FILE_COUNT --scope="$SCOPE" 2>/dev/null)
RAW_COMPLEXITY=$(echo "$CLASSIFY_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "MODERATE")
ROUTE=$(echo "$CLASSIFY_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.route === 'phased' ? 'phase-execute' : r.route)" 2>/dev/null || echo "phase-execute")
\`\`\`

**Adaptive adjustment** (adjusts based on routing history):
\`\`\`bash
USER_OVERRIDE=""
if echo "$ARGS" | grep -q -- "--complexity="; then
  USER_OVERRIDE=$(echo "$ARGS" | grep -o -- '--complexity=[A-Z]*' | head -1 | cut -d= -f2)
fi

HISTORY_JSON=$(bun -e "import { readRoutingHistory } from './src/complexity/__helpers/routing-history'; const h = await readRoutingHistory({ tail: 20 }); console.log(JSON.stringify(h))" 2>/dev/null || echo "[]")

ADJUST_RESULT=$(bun -e "
import { adjustComplexity } from './src/complexity/__helpers/adaptive-adjust';
const raw = '$RAW_COMPLEXITY';
const override = '$USER_OVERRIDE' || undefined;
const history = JSON.parse('$HISTORY_JSON');
const r = adjustComplexity({ raw_complexity: raw, history, override });
console.log(JSON.stringify(r));
" 2>/dev/null || echo '{"adjusted":"'$RAW_COMPLEXITY'","reason":"fallback"}')

COMPLEXITY=$(echo "$ADJUST_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.adjusted)" 2>/dev/null || echo "$RAW_COMPLEXITY")
\`\`\`

Parse COMPLEXITY and ROUTE from the classifier and adjustment output.

\`\`\`bash
luca-bridge transition --event=ROUTE_COMPLETE --data='{"complexity":"COMPLEXITY_LEVEL"}' 2>/dev/null || true
luca-bridge lock-update --pipeline-step="routed" --phase-step="" 2>/dev/null || true
\`\`\`

(Replace COMPLEXITY_LEVEL with the actual classified complexity.)

### Step 3: Route Branch

**If ROUTE != "phase-execute":** Handle non-phase-execute routes:
\`\`\`
Agent(name: "{route}-handler", subagent_type: "lu-executor", model: ORCHESTRATOR_MODEL, prompt: ROUTE_HANDLER_PROMPT(route, {...}))
\`\`\`
Then: Agent("verify-route") + Agent("learn-route") (conditional), commit, write "complete".
\`\`\`bash
luca-bridge lock-release 2>/dev/null || true
\`\`\`
RETURN.

**If ROUTE == "phase-execute":** Continue to Step 4.

### Step 4: Configure Session (routed -> configured)

**Inline configuration (no Agent() call needed):**
\`\`\`bash
# Read configuration values directly from config.json
WORKFLOW_VERSION=$(cat .planning/config.json 2>/dev/null | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$WORKFLOW_VERSION" ]; then WORKFLOW_VERSION="v1"; fi
# CLI override: --v2 flag forces v2 regardless of config
if echo "$ARGS" | grep -q -- "--v2"; then WORKFLOW_VERSION="v2"; fi

TOKEN_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"token_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$TOKEN_PROFILE" ]; then TOKEN_PROFILE="balanced"; fi
# CLI --profile override takes precedence over config.json value
if [ -n "$CLI_PROFILE" ]; then TOKEN_PROFILE="$CLI_PROFILE"; fi
# Store resolved profile in state
luca-bridge set-field --field=token_profile --value='"'$TOKEN_PROFILE'"' 2>/dev/null || true
echo "Token profile: $TOKEN_PROFILE"
# Warn if budget profile with high complexity (now that both vars are assigned)
if [ "$TOKEN_PROFILE" = "budget" ] && ([ "$COMPLEXITY" = "COMPLEX" ] || [ "$COMPLEXITY" = "CRITICAL" ]); then
  echo "WARNING: --profile=budget with $COMPLEXITY complexity — model demotion may reduce quality."
fi
luca-bridge lock-update --pipeline-step="configured" --phase-step="" 2>/dev/null || true
\`\`\`

### Step 4.5: Git Workflow Setup (INLINE, conditional: not --skip-branch)

\`\`\`bash
luca-bridge write-status --step="git-setup" --stage="EXECUTING" --detail="Creating issue and branch" 2>/dev/null || true
\`\`\`

If --skip-branch flag is present: SKIP this step entirely.

This step MUST run before any code work. It creates the GitHub issue and feature branch that all subsequent commits will land on.

**1. Create GitHub issue for the milestone/task:**

\`\`\`bash
# Extract milestone title from ROADMAP.md current milestone
MILESTONE_TITLE=$(grep "^## v" .planning/ROADMAP.md | head -1 | sed 's/^## //')
# Or use the task description for non-milestone work

ISSUE_URL=$(gh issue create \\
  --title "$MILESTONE_TITLE" \\
  --body "## Summary\\n\\n[Auto-generated from /lu orchestrator]\\n\\nPhases and deliverables TBD after planning." \\
  --label "enhancement" 2>&1)
ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -o '[0-9]*$')
\`\`\`

**2. Create feature branch from current base:**

\`\`\`bash
# Branch naming convention:
# - Milestones: {version}--{kebab-case-description} (e.g., v8.6.0--scout-article-intelligence)
# - Single phases: phase-{NN}--{kebab-case-description}
# - Non-milestone: {ticket-id}--{kebab-case-description}
# - Fallback: PROJ-0000--{kebab-case-description}

git checkout -b "$BRANCH_NAME"
git push -u origin "$BRANCH_NAME"
\`\`\`

**3. Store in context for later PR creation:**

Write ISSUE_NUMBER, ISSUE_URL, and BRANCH_NAME to the lu context file so Step 8 (Milestone Boundary) can create the PR.

\`\`\`bash
bun src/skills/__schemas/context-cli.ts write lu "{\\\"git_workflow\\\":{\\\"issue_number\\\":$ISSUE_NUMBER,\\\"issue_url\\\":\\\"$ISSUE_URL\\\",\\\"branch_name\\\":\\\"$BRANCH_NAME\\\"}}"
\`\`\`

**4. Update state** with the branch and issue info for visibility.

### Step 5: Backlog Scan (configured -> scanned) — CONDITIONAL

If --skip-backlog or config backlog_scan==false: skip.

Otherwise:
\`\`\`
Agent(name: "backlog", subagent_type: "lu-phase-researcher", model: ORCHESTRATOR_MODEL, prompt: BACKLOG_PROMPT({...}))
\`\`\`
\`\`\`bash
luca-bridge lock-update --pipeline-step="scanned" --phase-step="" 2>/dev/null || true
\`\`\`

### Step 6: Build Phase Execution Order (INLINE)

\`\`\`bash
luca-bridge write-status --step="phase-order" --stage="EXECUTING" --detail="Building execution order" 2>/dev/null || true
\`\`\`

Read .planning/ROADMAP.md. Parse incomplete phases. Build dependency graph. Topological sort. Apply MAX_PHASES limit. If --dry-run: display plan and RETURN.

### Profile-Aware Model Resolution

All Agent() calls in Steps 7e–7l use profile-aware model resolution:
\`\`\`
# Profile-aware model resolution:
# resolveModelWithProfile(subagent_type, COMPLEXITY, TOKEN_PROFILE)
# fast→haiku, balanced→sonnet, capable→opus
# Protected agents (lu-executor, lu-discuss-researcher, code-architect,
#   dx-advocate, security-auditor, code-simplifier, lu-learner) ignore budget demotion.
#
# ORCHESTRATOR_MODEL = resolveModelWithProfile(subagent_type, COMPLEXITY, TOKEN_PROFILE)
# DEEP_MODEL         = resolveModelWithProfile(subagent_type, COMPLEXITY, TOKEN_PROFILE)
# FAST_PROMOTED_MODEL = resolveModelWithProfile(subagent_type, COMPLEXITY, TOKEN_PROFILE)
# ROUTER_MODEL       = resolveModelWithProfile(subagent_type, COMPLEXITY, TOKEN_PROFILE)
# ALWAYS_FAST        = always haiku (unaffected by profile — already at floor)
\`\`\`

### Step 7: Phase Execution Loop

**FOR each phase in execution order (serial):**

Write loop counter to context file for recovery: \`{"loop_index": N, "remaining_phases": [...]}\`

**Emit PHASE_START:**
\`\`\`bash
luca-bridge transition --event=PHASE_START --data='{"phase_id":PHASE_NUMBER}' 2>/dev/null || true
luca-bridge write-status --step="phase-start" --phase=PHASE_NUMBER --stage="EXECUTING" 2>/dev/null || true
luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="start" --phase-id=PHASE_NUMBER 2>/dev/null || true
\`\`\`

#### 7a. Phase dependency check (INLINE)
Verify all dependencies complete. If not: park phase, continue.

#### 7b. Oversight gate (INLINE, interactive)
If oversight != "full-auto": prompt user for phase confirmation.

#### 7c. Per-phase complexity re-classify (deterministic, no Agent() call)
\`\`\`bash
# Re-classify per-phase using deterministic classifier
PHASE_GOAL=$(grep "^## " .planning/phases/{NN}-*/PLAN.md 2>/dev/null | head -1 | sed 's/^## //')
PHASE_FILE_COUNT=$(grep -c "@" .planning/phases/{NN}-*/PLAN.md 2>/dev/null || echo "0")
PHASE_CLASSIFY=$(bun src/complexity/__helpers/classify.ts --description="$PHASE_GOAL" --file-count=$PHASE_FILE_COUNT 2>/dev/null)
PHASE_COMPLEXITY=$(echo "$PHASE_CLASSIFY" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "$COMPLEXITY")
\`\`\`

#### 7d. Gate resolution (INLINE)
\`\`\`bash
PREMORTEM=$(luca-bridge gate-check --gate=premortem 2>/dev/null | ...)
PROCESS_DATA=$(luca-bridge gate-check --gate=process_data 2>/dev/null | ...)
\`\`\`

#### 7d-v2. Research Pipeline (v2 ONLY — skip entirely if WORKFLOW_VERSION != "v2")


**Gate:** If WORKFLOW_VERSION != "v2": SKIP to 7e. This entire block is fail-closed.

**Token profile v2 gating:**
\`\`\`bash
# Profile controls v2 research pipeline depth:
# - budget:   Skip v2 research entirely (force WORKFLOW_VERSION="v1" for this phase)
# - balanced: Use config's researchReviewIterations as-is (default behavior)
# - quality:  Double researchReviewIterations via applyLoopBudgetMultiplier
if [ "$TOKEN_PROFILE" = "budget" ]; then
  echo "INFO: budget profile — skipping v2 research pipeline"
  # Override to v1 for this phase regardless of config
  WORKFLOW_VERSION_EFFECTIVE="v1"
elif [ "$TOKEN_PROFILE" = "quality" ]; then
  # Double the research review iterations: applyLoopBudgetMultiplier(base, "quality")
  RESEARCH_REVIEW_ITERATIONS=$((RESEARCH_REVIEW_ITERATIONS * 2))
fi
\`\`\`

**Graceful degradation:** If ANY v2 step below fails (agent returns failure or error), log the failure and SKIP remaining v2 steps. Continue to 7e (Discussion) with whatever research context is available. v1 pipeline is never blocked by v2 failures.

**7d-v2a. Research Scope** (skip if research/ directory already populated)
\`\`\`
Agent(name: "research-scope-{NN}", subagent_type: "lu-phase-researcher", model: ORCHESTRATOR_MODEL, prompt: RESEARCH_SCOPE_PROMPT({phase: NN, ...}))
\`\`\`
Parse RESEARCH-SCOPE.md to get specialist assignments.

**7d-v2b. Parallel Research** (spawn 4 specialists simultaneously)
\`\`\`
Agent(name: "research-arch-{NN}", subagent_type: "lu-architecture-researcher", model: ROUTER_MODEL, prompt: PARALLEL_RESEARCH_PROMPT("architecture", {...}))
Agent(name: "research-impl-{NN}", subagent_type: "lu-implementation-researcher", model: ROUTER_MODEL, prompt: PARALLEL_RESEARCH_PROMPT("implementation", {...}))
Agent(name: "research-eco-{NN}", subagent_type: "lu-ecosystem-researcher", model: ROUTER_MODEL, prompt: PARALLEL_RESEARCH_PROMPT("ecosystem", {...}))
Agent(name: "research-risk-{NN}", subagent_type: "lu-risk-researcher", model: ROUTER_MODEL, prompt: PARALLEL_RESEARCH_PROMPT("risks", {...}))
\`\`\`

**7d-v2c. Research Synthesis**
\`\`\`
Agent(name: "research-synth-{NN}", subagent_type: "lu-research-synthesizer", model: ORCHESTRATOR_MODEL, prompt: RESEARCH_SYNTHESIS_PROMPT({phase: NN, ...}))
\`\`\`

**7d-v2d. Research Review Loop** (iterate up to researchReviewIterations)
\`\`\`
FOR iteration = 1 to RESEARCH_REVIEW_ITERATIONS:
  # Spawn 3 reviewers in parallel
  Agent(name: "review-accuracy-{NN}", subagent_type: "lu-accuracy-reviewer", model: DEEP_MODEL, prompt: RESEARCH_REVIEW_PROMPT("accuracy", {...}))
  Agent(name: "review-completeness-{NN}", subagent_type: "lu-completeness-reviewer", model: DEEP_MODEL, prompt: RESEARCH_REVIEW_PROMPT("completeness", {...}))
  Agent(name: "review-actionability-{NN}", subagent_type: "lu-actionability-reviewer", model: DEEP_MODEL, prompt: RESEARCH_REVIEW_PROMPT("actionability", {...}))
  # Check results
  IF all reviewers PASS or no CRITICAL_GAPS: BREAK
  # Expand research for gaps
  Agent(name: "research-expand-{NN}-{iteration}", subagent_type: "lu-research-synthesizer", model: ORCHESTRATOR_MODEL, prompt: expand gaps from reviewer feedback)
  Agent(name: "research-synth-{NN}-{iteration}", subagent_type: "lu-research-synthesizer", model: ORCHESTRATOR_MODEL, prompt: RESEARCH_SYNTHESIS_PROMPT re-merge)
\`\`\`

**7d-v2e. Research Graduation**
\`\`\`
Agent(name: "research-graduate-{NN}", subagent_type: "lu-research-graduator", model: ORCHESTRATOR_MODEL, prompt: RESEARCH_GRADUATION_PROMPT({phase: NN, ...}))
\`\`\`

#### 7e. Discussion (conditional: skip if --skip-discuss)

\`\`\`bash
luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="discuss" --phase-id=PHASE_NUMBER 2>/dev/null || true
\`\`\`
\`\`\`
Agent(name: "discuss-{NN}", subagent_type: "lu-discuss-researcher", model: ORCHESTRATOR_MODEL, prompt: phase discussion with premortem if --run-premortem)
\`\`\`
After discussion returns (or if skipped):
\`\`\`bash
# If discussion was skipped: luca-bridge transition --event=SKIP 2>/dev/null || true
\`\`\`

#### 7f. Plan existence check (INLINE)
If .planning/phases/{NN}-*/PLAN.md exists: skip planning.

#### 7g. Planning

\`\`\`bash
luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="plan" --phase-id=PHASE_NUMBER 2>/dev/null || true
\`\`\`
\`\`\`
# SIZE-01/02: Include PLAN_SIZING_GUIDANCE in planner prompt to require per-task file_count_estimate and scope labels
# See: src/skills/__helpers/agent-prompts.ts → PLAN_SIZING_GUIDANCE constant
Agent(name: "plan-{NN}", subagent_type: "lu-planner", model: ORCHESTRATOR_MODEL, prompt: create PLAN.md with tasks and wave grouping + PLAN_SIZING_GUIDANCE)
\`\`\`

#### 7g-v2. Plan Review Loop (v2 ONLY — skip if WORKFLOW_VERSION != "v2")

**Gate:** If WORKFLOW_VERSION != "v2": SKIP to 7h. Fail-closed.

\`\`\`
PREVIOUS_ISSUES=""
FOR iteration = 1 to PLAN_REVIEW_ITERATIONS:
  Agent(name: "plan-review-{NN}-{iteration}", subagent_type: "lu-plan-checker", model: ORCHESTRATOR_MODEL, prompt: PLAN_REVIEW_PROMPT(iteration, PREVIOUS_ISSUES, {...}))
  Parse RECOMMEND from agent output.
  IF RECOMMEND == "approve": BREAK
  IF RECOMMEND == "escalate": prompt user for decision, BREAK
  # Planner revises
  PREVIOUS_ISSUES = agent's issues output
  # SIZE-01/02: Include PLAN_SIZING_GUIDANCE in revision prompt
  Agent(name: "plan-revise-{NN}-{iteration}", subagent_type: "lu-planner", model: ORCHESTRATOR_MODEL, prompt: revise PLAN.md based on issues + PLAN_SIZING_GUIDANCE)
\`\`\`

#### 7h. Execution (per-wave dispatch loop)

\`\`\`bash
luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="execute" --phase-id=PHASE_NUMBER 2>/dev/null || true
\`\`\`

**Per-wave dispatch loop** — one Agent() per wave, with fresh context per wave:
\`\`\`bash
# Parse waves from PLAN.md frontmatter (deterministic, no LLM)
WAVES=$(bun -e "
const glob = new Bun.Glob('.planning/phases/{NN}-*/*-PLAN.md');
const waves = new Set();
for await (const f of glob.scan('.')) {
  const text = await Bun.file(f).text();
  const m = text.match(/^wave:\\s*(\\d+)/m);
  if (m) waves.add(parseInt(m[1]));
}
console.log(JSON.stringify([...waves].sort((a,b) => a-b)));
" 2>/dev/null || echo '[1]')
\`\`\`

\`\`\`
# --- Phase 264 Context Assembly & Task Sizing summary ---
# CTXT-01: PhaseContextPayload schema (context/__schemas/context.schemas.ts)
# CTXT-02: assembleAndSerialize() produces capped payloads (context/__helpers/context-assembler.ts)
# CTXT-03: inlinedContext parameter in AgentPromptParams and prompt templates
# SIZE-01/02: PLAN_SIZING_GUIDANCE constant enforces per-task/wave metadata
# SIZE-03: Plan-checker Dimension 7 validates file counts (BLOCKER >= 10)
# SIZE-04: OVERFLOW protocol (Phase 263, verified below)

FOR each WAVE_NUM in $WAVES (serial):
  # CTXT-01/02: Assemble fresh context payload for this agent tier
  # Orchestrator calls assembleAndSerialize(agentName, COMPLEXITY, availableDocs, 2000)
  # Tier mapping: lu-executor=Full(T2/T3), lu-verifier/reviewers=Scoped(warm),
  #               harness-checker=Minimal(T0/cold), lu-discuss-researcher/lu-learner=unchanged
  # Cap enforced at <= 2K tokens. Pass payload as inlinedContext in prompt params.
  INLINED_CONTEXT=$(assembleAndSerialize("lu-executor", COMPLEXITY, AVAILABLE_DOCS, 2000).payload)

  # Assemble wave context: read only the wave's task section from PLAN.md (cap ~2K tokens)
  WAVE_SECTION=$(bun -e "
  const glob = new Bun.Glob('.planning/phases/{NN}-*/*-PLAN.md');
  for await (const f of glob.scan('.')) {
    const text = await Bun.file(f).text();
    const m = text.match(/^wave:\\s*\${WAVE_NUM}/m);
    if (m) {
      // Extract up to 1500 chars (~2K tokens) of the plan content
      console.log(text.slice(0, 1500));
      break;
    }
  }
  " 2>/dev/null || echo "")

  WAVE_RESULT=$(Agent(
    name: "execute-{NN}-w{WAVE_NUM}",
    subagent_type: "lu-executor",
    model: ORCHESTRATOR_MODEL,
    prompt: EXECUTE_WAVE_PROMPT({phase: NN, wave: WAVE_NUM, waveContext: WAVE_SECTION, ...})
  ))

  # OVERFLOW protocol: if agent output contains OVERFLOW:{task-id}, spawn fresh agent for remainder
  # <!-- SIZE-04: verified Phase 263 — detection + fresh spawn + startFromTask threading all present -->
  if echo "$WAVE_RESULT" | grep -q "OVERFLOW:"; then
    OVERFLOW_TASK=$(echo "$WAVE_RESULT" | grep -o "OVERFLOW:[^ ]*" | head -1 | cut -d: -f2)
    echo "INFO: Wave $WAVE_NUM overflow at task $OVERFLOW_TASK — spawning fresh agent for remainder"
    Agent(
      name: "execute-{NN}-w{WAVE_NUM}-overflow",
      subagent_type: "lu-executor",
      model: ORCHESTRATOR_MODEL,
      prompt: EXECUTE_WAVE_PROMPT({phase: NN, wave: WAVE_NUM, startFromTask: OVERFLOW_TASK, ...})
    )
  fi
\`\`\`

#### 7i. Harness Fix Loop (INLINE, hoisted) — Convergence-Aware

\`\`\`bash
luca-bridge write-status --step="harness" --stage="VERIFYING" --phase=PHASE_NUMBER 2>/dev/null || true
luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="harness" --phase-id=PHASE_NUMBER 2>/dev/null || true
\`\`\`

\`\`\`bash
# Loop budget multiplier: apply token profile to HARNESS_FIX_ITERATIONS
# budget:   Math.max(1, Math.floor(base * 0.5)) — halve (floor 1)
# balanced: identity (no change)
# quality:  base * 2 — double
# HARNESS_FIX_ITERATIONS = applyLoopBudgetMultiplier(HARNESS_FIX_ITERATIONS, TOKEN_PROFILE)
\`\`\`

**Initialize convergence tracking state before harness fix loop:**
\`\`\`bash
# --- Convergence state init (STUCK-01) ---
FINGERPRINT_LEDGER='{}'           # Record<string, number>: fingerprint -> iterations_seen
PREVIOUS_CLASSIFIED='[]'          # ClassifiedError[] from the previous iteration
HARNESS_ITER_HISTORY='[]'         # Lightweight iteration history for stall-debate
CONSECUTIVE_STALE=0               # int: consecutive stale count
CONTEXT_TIER="T1"                 # Current context tier, starts at T1 for harness loop
PREV_CHECKPOINT_TAG=""            # Git tag of the previous checkpoint (for rollback)
CURRENT_CLASSIFIED='[]'           # ClassifiedError[] from the current iteration
\`\`\`

\`\`\`
FOR attempt = 1 to HARNESS_FIX_ITERATIONS:

  # --- STUCK-06: Create git checkpoint before each fix iteration ---
  COMMIT_HASH=$(bun src/iteration/__helpers/checkpoint.ts commit-hash 2>/dev/null | \
    bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.commit_hash)" 2>/dev/null || echo "unknown")
  CHECKPOINT_TAG="iter/PHASE_NUMBER/harness/\${attempt}"
  STALL_STRATEGY=""  # F3-fix: Initialize before conditional assignment
  # F2-fix: Export vars so child bun -e processes can read them
  export CHECKPOINT_TAG CURRENT_CLASSIFIED CONSECUTIVE_STALE COMMIT_HASH CONVERGENCE_RESULT BUDGET_REMAINING HARNESS_ITER_HISTORY CONTEXT_TIER
  ITER_RECORD=$(bun -e "console.log(JSON.stringify({
    tag: process.env.CHECKPOINT_TAG,
    phase: PHASE_NUMBER,
    loop: 'harness',
    iteration: \${attempt},
    error_count: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').filter(e => e.classification !== 'permanent').length,
    error_delta: 0,
    error_fingerprints: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').map(e => e.fingerprint),
    convergence_status: 'unknown',  // F4-fix: pre-fix snapshot, actual status computed after classification
    stale_count: parseInt(process.env.CONSECUTIVE_STALE || '0', 10),
    permanent_errors: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').filter(e => e.classification === 'permanent').map(e => e.fingerprint),
    correctable_errors: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').filter(e => e.classification === 'correctable').map(e => e.fingerprint),
    transient_errors: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').filter(e => e.classification === 'transient').map(e => e.fingerprint),
    artifacts_delta: 0,
    commit_hash: process.env.COMMIT_HASH || 'unknown',
    agent_invoked: 'lu-executor',
    duration_ms: 0,
    timestamp: new Date().toISOString(),
  }))" 2>/dev/null || echo '{}')
  bun src/iteration/__helpers/checkpoint.ts create --record="$ITER_RECORD" 2>/dev/null || true
  PREV_CHECKPOINT_TAG="$CHECKPOINT_TAG"

  # --- Harness check ---
  # CTXT-02: Minimal tier (T0/cold isolation) for harness checker — no memory injection
  # HARNESS_CONTEXT=$(assembleAndSerialize("lu-verifier-fast", COMPLEXITY, AVAILABLE_DOCS, 2000).payload)
  Agent(name: "harness-{NN}", subagent_type: "lu-verifier-fast", model: FAST_PROMOTED_MODEL, prompt: HARNESS_CHECK_PROMPT({..., inlinedContext: HARNESS_CONTEXT}))
  IF PASSED: BREAK

  # F1-fix: Read harness output from the file the agent writes
  HARNESS_OUTPUT=$(cat .planning/harness-result.json 2>/dev/null || echo '{"checks":[]}')

  # --- STUCK-01: Classify errors after failed harness check ---
  CLASSIFY_RESULT=$(bun src/iteration/__helpers/classifier.ts \
    --harness-result="$HARNESS_OUTPUT" \
    --ledger="$FINGERPRINT_LEDGER" \
    --promotion-threshold=3 2>/dev/null || echo '{"classified":[],"updated_ledger":{}}')
  FINGERPRINT_LEDGER=$(echo "$CLASSIFY_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify(r.updated_ledger))" 2>/dev/null || echo '{}')
  CURRENT_CLASSIFIED=$(echo "$CLASSIFY_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify(r.classified))" 2>/dev/null || echo '[]')

  # --- STUCK-02: Compute convergence signals ---
  ARTIFACT_DELTA=$(bun src/iteration/__helpers/checkpoint.ts artifact-delta \
    --from-ref="$PREV_CHECKPOINT_TAG" 2>/dev/null | \
    bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.artifact_delta ?? 0)" 2>/dev/null || echo "0")

  CONVERGENCE_RESULT=$(bun src/iteration/__helpers/convergence.ts \
    --current="$CURRENT_CLASSIFIED" \
    --previous="$PREVIOUS_CLASSIFIED" \
    --artifact-delta="$ARTIFACT_DELTA" \
    --previous-stale-count="$CONSECUTIVE_STALE" \
    --stale-threshold=2 2>/dev/null || echo '{"signals":{},"status":"improved","consecutive_stale":0,"should_halt":false}')
  CONSECUTIVE_STALE=$(echo "$CONVERGENCE_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.consecutive_stale)" 2>/dev/null || echo "0")

  # --- STUCK-03: Stall-debate evaluator when convergence recommends halt ---
  SHOULD_HALT=$(echo "$CONVERGENCE_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.should_halt)" 2>/dev/null || echo "false")

  if [ "$SHOULD_HALT" = "true" ]; then
    BUDGET_REMAINING=$((HARNESS_FIX_ITERATIONS - attempt))

    STALL_RESULT=$(bun -e "
    import { evaluateStallDebate } from './src/iteration/__helpers/stall-debate';
    const input = {
      convergence_result: JSON.parse(process.env.CONVERGENCE_RESULT),
      current_errors: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]'),
      budget_remaining: parseInt(process.env.BUDGET_REMAINING || '0', 10),
      loop_type: 'harness',
      iteration_history: JSON.parse(process.env.HARNESS_ITER_HISTORY || '[]'),
      context_tier: process.env.CONTEXT_TIER || 'T1',
    };
    console.log(JSON.stringify(evaluateStallDebate(input)));
    " 2>/dev/null || echo '{"recommended_strategy":"halt","confidence":1.0,"reasoning":"stall-debate unavailable","strategy_params":{}}')

    STALL_STRATEGY=$(echo "$STALL_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.recommended_strategy)" 2>/dev/null || echo "halt")

    if [ "$STALL_STRATEGY" = "halt" ]; then
      echo "INFO: Harness fix loop halting — convergence failure (strategy: halt)"
      break
    elif [ "$STALL_STRATEGY" = "retry_with_context_promotion" ]; then
      CONTEXT_TIER=$(echo "$STALL_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.strategy_params?.target_tier ?? 'T2')" 2>/dev/null || echo "T2")
      echo "INFO: Promoting context tier to $CONTEXT_TIER and retrying"
    elif [ "$STALL_STRATEGY" = "retry_with_error_focus" ]; then
      FOCUS_SOURCES=$(echo "$STALL_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify(r.strategy_params?.focus_sources ?? []))" 2>/dev/null || echo "[]")
      echo "INFO: Retrying with error focus on sources: $FOCUS_SOURCES"
    elif [ "$STALL_STRATEGY" = "retry_with_rollback" ] && [ -n "$PREV_CHECKPOINT_TAG" ]; then
      echo "INFO: Rolling back to checkpoint $PREV_CHECKPOINT_TAG"
      ROLLBACK_RESULT=$(bun src/iteration/__helpers/checkpoint.ts rollback \
        --tag="$PREV_CHECKPOINT_TAG" 2>/dev/null || echo '{"success":false}')
      ROLLBACK_OK=$(echo "$ROLLBACK_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.success)" 2>/dev/null || echo "false")
      if [ "$ROLLBACK_OK" = "true" ]; then
        echo "INFO: Rollback succeeded — continuing with next iteration"
        FINGERPRINT_LEDGER='{}'
        CONSECUTIVE_STALE=0
      else
        echo "WARN: Rollback failed — halting loop"
        break
      fi
    fi
  fi

  # --- STUCK-04: Pass classified errors and convergence context to fix agent ---
  Agent(name: "fix-{NN}", subagent_type: "lu-executor", model: ORCHESTRATOR_MODEL, prompt: HARNESS_FIX_PROMPT(errors, {...}, CURRENT_CLASSIFIED, {consecutive_stale: CONSECUTIVE_STALE, strategy_hint: STALL_STRATEGY}))

  # --- STUCK-01/02: Rotate previous classified and append iteration history ---
  PREVIOUS_CLASSIFIED="$CURRENT_CLASSIFIED"

  HARNESS_ITER_HISTORY=$(bun -e "
  const hist = JSON.parse(process.env.HARNESS_ITER_HISTORY || '[]');
  const convResult = JSON.parse(process.env.CONVERGENCE_RESULT || '{}');
  hist.push({
    iteration: \${attempt},
    error_count: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').filter(e => e.classification !== 'permanent').length,
    convergence_status: convResult.status ?? 'improved',
    stale_count: convResult.consecutive_stale ?? 0,
  });
  console.log(JSON.stringify(hist));
  " 2>/dev/null || echo "$HARNESS_ITER_HISTORY")
\`\`\`

**After harness loop completes successfully (all checks passed), prune checkpoints:**
\`\`\`bash
# --- STUCK-06: Prune phase checkpoints after success ---
bun src/iteration/__helpers/checkpoint.ts prune --phase=PHASE_NUMBER 2>/dev/null || true
\`\`\`

**After harness loop, emit result:**
\`\`\`bash
# Parse PASSED and error count from last harness agent output
luca-bridge transition --event=HARNESS_COMPLETE --data='{"status":"passed_or_failed","total_errors":ERROR_COUNT}' 2>/dev/null || true
\`\`\`

#### 7j. Goal-backward verification — Convergence-Aware

\`\`\`bash
# Loop budget multiplier: apply token profile to VERIFY_FIX_ITERATIONS and PLAN_VERIFICATION_ITERATIONS
# budget:   Math.max(1, Math.floor(base * 0.5)) — halve (floor 1)
# balanced: identity (no change)
# quality:  base * 2 — double
# VERIFY_FIX_ITERATIONS = applyLoopBudgetMultiplier(VERIFY_FIX_ITERATIONS, TOKEN_PROFILE)
# PLAN_VERIFICATION_ITERATIONS = applyLoopBudgetMultiplier(PLAN_VERIFICATION_ITERATIONS, TOKEN_PROFILE)
\`\`\`

**Initialize outer loop convergence tracking state (STUCK-05):**
\`\`\`bash
# --- STUCK-05: Outer verification loop stall detection ---
VERIFY_PREV_FAILING_IDS='[]'      # string[]: criterion_ids that failed last iteration
VERIFY_CONSECUTIVE_STALE=0        # int: consecutive stale iterations
\`\`\`

\`\`\`bash
luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="verify" --phase-id=PHASE_NUMBER 2>/dev/null || true
\`\`\`

\`\`\`
FOR verify_attempt = 1 to VERIFY_FIX_ITERATIONS:
  Agent(name: "verify-{NN}", subagent_type: "lu-verifier", model: DEEP_MODEL, prompt: GOAL_VERIFY_PROMPT({phase: NN, ...}))
  IF VERDICT == PASSED: BREAK

  # --- STUCK-05: Read failing criteria and check for stall ---
  CURRENT_FAILING=$(bun -e "
  const glob = new Bun.Glob('.planning/phases/PHASE_NUMBER-*/verification-result.json');
  let failing = [];
  for await (const f of glob.scan('.')) {
    const data = await Bun.file(f).json().catch(() => null);
    if (data?.criteria) {
      failing = data.criteria.filter(c => !c.met).map(c => c.criterion_id);
    }
  }
  console.log(JSON.stringify(failing));
  " 2>/dev/null || echo '[]')

  # F2-fix: Export vars for child bun -e processes
  export CURRENT_FAILING VERIFY_PREV_FAILING_IDS
  # Compute Jaccard overlap between current and previous failing sets
  VERIFY_OVERLAP=$(bun -e "
  const current = new Set(JSON.parse(process.env.CURRENT_FAILING || '[]'));
  const previous = new Set(JSON.parse(process.env.VERIFY_PREV_FAILING_IDS || '[]'));
  if (current.size === 0 && previous.size === 0) { console.log('0'); process.exit(0); }
  let intersection = 0;
  for (const id of current) { if (previous.has(id)) intersection++; }
  const union = new Set([...current, ...previous]).size;
  console.log((union > 0 ? intersection / union : 0).toFixed(4));
  " 2>/dev/null || echo "0")

  # Determine if outer loop is stalled (overlap >= 0.80)
  if bun -e "process.exit(parseFloat(process.env.VERIFY_OVERLAP || '0') >= 0.8 ? 0 : 1)" 2>/dev/null; then
    VERIFY_CONSECUTIVE_STALE=$((VERIFY_CONSECUTIVE_STALE + 1))
    if [ "$VERIFY_CONSECUTIVE_STALE" -ge 2 ]; then
      echo "WARN: Outer verification loop stalled — same criteria failing for 2+ consecutive iterations (overlap: $VERIFY_OVERLAP)"
      echo "INFO: Halting verify fix loop to avoid budget waste"
      break
    fi
  else
    VERIFY_CONSECUTIVE_STALE=0
  fi
  VERIFY_PREV_FAILING_IDS="$CURRENT_FAILING"

  # Spawn fix agent for verification gaps
  Agent(name: "fix-verify-{NN}", subagent_type: "lu-executor", model: ORCHESTRATOR_MODEL, prompt: VERIFY_FIX_PROMPT(gaps, {...}))
\`\`\`

#### 7k. Code review


Spawn PARALLEL reviewers:
\`\`\`
Agent(name: "review-arch-{NN}", subagent_type: "code-architect", model: DEEP_MODEL, prompt: CODE_REVIEW_PROMPT("architecture", {...}))
Agent(name: "review-dx-{NN}", subagent_type: "dx-advocate", model: DEEP_MODEL, prompt: CODE_REVIEW_PROMPT("dx-advocate", {...}))
Agent(name: "review-security-{NN}", subagent_type: "security-auditor", model: DEEP_MODEL, prompt: CODE_REVIEW_PROMPT("security", {...}))
Agent(name: "review-simplify-{NN}", subagent_type: "code-simplifier", model: DEEP_MODEL, prompt: CODE_REVIEW_PROMPT("simplifier", {...}))
\`\`\`

After ALL reviewers return, emit REVIEW_COMPLETE to advance the executing sub-state:
\`\`\`bash
luca-bridge transition --event=REVIEW_COMPLETE 2>/dev/null || true
\`\`\`

#### 7l. Learning capture

\`\`\`bash
luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="learn" --phase-id=PHASE_NUMBER 2>/dev/null || true
\`\`\`
\`\`\`
Agent(name: "learn-{NN}", subagent_type: "lu-learner", model: FAST_PROMOTED_MODEL, prompt: LEARNING_CAPTURE_PROMPT({phase: NN, ...}))
\`\`\`

#### 7m. Process data (conditional: --run-process-data)

**Deterministic CLI invocation (zero LLM tokens):**
\`\`\`bash
# Replaced: Agent(name: "process-data-{NN}", subagent_type: "lu-process-data", model: FAST_PROMOTED_MODEL, prompt: PROCESS_DATA_PROMPT({phase: NN, ...}))
# Now uses deterministic CLI module — see src/process-data/compute.ts
PROCESS_DATA_OUTPUT=$(bun src/process-data/compute.ts --context=.planning/state.json 2>/dev/null || echo '{}')
echo "Process data: $PROCESS_DATA_OUTPUT"
luca-bridge transition --event=PROCESS_DATA_COMPLETE 2>/dev/null || true
\`\`\`

#### 7n. Commit (INLINE)


Commits land on the feature branch created in Step 4.5 (or main if --skip-branch).
\`\`\`bash
git add . && git commit -m "feat(#{ISSUE_NUMBER}): Phase {NN} — {phase description}"
# Push to remote after each phase commit:
git push
\`\`\`

#### 7o. Update state (INLINE)
Mark phase complete in ROADMAP.md. Write loop counter + remaining phases to context file.

**Emit PHASE_COMPLETE:**
\`\`\`bash
luca-bridge transition --event=PHASE_COMPLETE --data='{"phase_id":PHASE_NUMBER,"summary":"Phase PHASE_NUMBER completed"}' 2>/dev/null || true
\`\`\`

**Append routing history entry:**
\`\`\`bash
bun -e "
import { appendRoutingEntry } from './src/complexity/__helpers/routing-history';
await appendRoutingEntry({
  timestamp: new Date().toISOString(),
  phase: PHASE_NUMBER,
  initial_complexity: '$PHASE_COMPLEXITY',
  final_complexity: '$FINAL_COMPLEXITY',
  succeeded: $PHASE_SUCCEEDED,
  stalled: $PHASE_STALLED,
  iteration_counts: { harness_fix: $HF_COUNT, verify_fix: $VF_COUNT },
  task_count: $TASK_COUNT,
  file_count: $FILE_COUNT,
  keywords: $MATCHED_KEYWORDS_JSON
});
" 2>/dev/null || true
\`\`\`

#### 7o-drift. Per-phase drift detection (DRIFT-01..05)

After each phase completes, mechanically check whether changes invalidated remaining phases.
This is a zero-LLM check; the reassessment agent is only spawned when drift is found.

\`\`\`bash
# Step 1: Run mechanical drift checker (zero LLM)
DRIFT_RESULT=$(bun -e "
import { checkDrift } from './src/drift';
// remainingPhases is built from the execution queue (phases not yet executed)
const remaining = REMAINING_PHASES_JSON;
const result = checkDrift('.planning/phases/PHASE_DIR/', remaining);
console.log(JSON.stringify(result));
" 2>/dev/null || echo '{"drifted":false}')

DRIFT_DETECTED=$(echo "$DRIFT_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.drifted)" 2>/dev/null || echo "false")

if [ "$DRIFT_DETECTED" = "true" ]; then
  # Step 2: Record drift event in session-ledger.jsonl (DRIFT-04)
  bun -e "
  import { appendFile } from 'node:fs/promises';
  const event = {
    timestamp: new Date().toISOString(),
    event: 'DRIFT_DETECTED',
    completedPhase: PHASE_NUMBER,
    affectedPhaseCount: $(echo "$DRIFT_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.affectedPhases.length)" 2>/dev/null || echo 0),
    affectedPhaseIds: $(echo "$DRIFT_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify(r.affectedPhases.map(p=>p.phaseId)))" 2>/dev/null || echo '[]'),
    changedFileCount: $(echo "$DRIFT_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.changedFiles.length)" 2>/dev/null || echo 0)
  };
  await appendFile('.planning/session-ledger.jsonl', JSON.stringify(event) + '\\n');
  " 2>/dev/null || true

  # Step 3: Emit DRIFT_DETECTED bridge transition (DRIFT-04)
  luca-bridge transition --event=DRIFT_DETECTED --data="{\"phase_id\":PHASE_NUMBER,\"affected_phases\":$AFFECTED_IDS}" 2>/dev/null || true

  # Step 4: Spawn reassessment agent (DRIFT-02, ROUTER_MODEL)
  Agent(name: "reassess-{NN}", subagent_type: "lu-reassessor", model: ROUTER_MODEL, prompt: REASSESS_PROMPT({phase: NN, driftResultJson: DRIFT_RESULT, remainingPhasesJson: REMAINING_PHASES_JSON, ...}))

  # Step 5: Apply drift response (DRIFT-03)
  # Parse reassessment verdicts and apply actions:
  FOR verdict in REASSESSMENT_RESULT.verdicts:
    IF verdict.verdict == "REDUNDANT":
      Mark phase as complete (skip execution), log: "Phase {id} marked redundant by drift"
    IF verdict.verdict == "BLOCKED":
      Park phase (remove from queue), log: "Phase {id} blocked by drift"
    IF verdict.verdict == "NEEDS_UPDATE":
      IF OVERSIGHT_LEVEL == "autonomous":
        Queue phase for re-planning (insert before execution)
      ELSE:
        Flag for user review: "Phase {id} needs update: {rationale}"
    IF verdict.verdict == "VALID":
      No action (keep in queue as-is)
  Rebuild execution order from remaining valid phases
fi
\`\`\`

#### 7p. Gap closure retry (INLINE, if phase had failures)
\`\`\`
FOR retry = 1 to GAP_RETRIES:
  Agent(name: "plan-gaps-{NN}", subagent_type: "lu-planner", model: ORCHESTRATOR_MODEL, prompt: plan only for gaps)
  Agent(name: "execute-gaps-{NN}", subagent_type: "lu-executor", model: ORCHESTRATOR_MODEL, prompt: execute gap plan only)
  Re-run harness (7i pattern)
  IF gaps closed: BREAK
IF still failing: park phase, cascade to dependents
\`\`\`

### Step 8: Milestone Boundary Check

\`\`\`bash
luca-bridge write-status --step="milestone" --stage="EXECUTING" --detail="Checking milestone boundary" 2>/dev/null || true
\`\`\`

If all phases in current milestone complete:
\`\`\`
Agent(name: "milestone-learn", subagent_type: "lu-learner", model: FAST_PROMOTED_MODEL, prompt: MILESTONE_LEARN_PROMPT({...}))
Agent(name: "milestone-prune", subagent_type: "lu-shadow-scanner", model: FAST_PROMOTED_MODEL, prompt: MILESTONE_PRUNE_PROMPT({...}))
Agent(name: "milestone-shadow", subagent_type: "lu-shadow-scanner", model: FAST_PROMOTED_MODEL, prompt: MILESTONE_SHADOW_PROMPT({...}))  # conditional
Agent(name: "milestone-archive", subagent_type: "lu-learner", model: FAST_PROMOTED_MODEL, prompt: MILESTONE_ARCHIVE_PROMPT({...}))
Agent(name: "milestone-finalize", subagent_type: "lu-learner", model: FAST_PROMOTED_MODEL, prompt: MILESTONE_FINALIZE_PROMPT({...}))
\`\`\`

#### 8a. Create Pull Request (INLINE, conditional: not --skip-branch)

If a feature branch was created in Step 4.5, create a PR to merge it back to main:

\`\`\`bash
# Read git workflow context
ISSUE_NUMBER=$(bun src/skills/__schemas/context-cli.ts read lu 2>/dev/null | bun -e "..." || echo "")
BRANCH_NAME=$(git branch --show-current)

# Ensure all commits are pushed
git push

# Build PR body from phase results
# Include: summary of phases completed, key deliverables, file counts

gh pr create \\
  --title "feat(#$ISSUE_NUMBER): $MILESTONE_TITLE" \\
  --body "## Summary\\n\\n[Phase summaries]\\n\\n## Test plan\\n\\n- [ ] \`bunx --bun tsc --noEmit\` passes\\n- [ ] All todos moved to done/\\n\\nCloses #$ISSUE_NUMBER\\n\\nGenerated with [Claude Code](https://claude.com/claude-code)"
\`\`\`

Report the PR URL to the user.

### Step 9: Cross-Milestone Continuation (INLINE)

\`\`\`bash
# Check if cross-milestone continuation is enabled
CROSS_MILESTONE=$(luca-bridge read-field --field=lu_config.cross_milestone 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.value)" 2>/dev/null || echo "false")
\`\`\`

If CROSS_MILESTONE == "true":

1. **Read milestone count and phase results from state:**
\`\`\`bash
MILESTONE_COUNT=$(luca-bridge read-field --field=milestone_count 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.value)" 2>/dev/null || echo "0")
SESSION_ID=$(luca-bridge read-field --field=session_id 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.value)" 2>/dev/null || echo "")
\`\`\`

2. **Safety check: max 3 milestones per session:**
If MILESTONE_COUNT >= 3, log "Cross-milestone limit reached (3/3). Ending session." and skip to Step 10.

3. **Readiness check: no failed/blocked phases:**
\`\`\`bash
RESET_RESULT=$(luca-bridge milestone-reset --session-id=$SESSION_ID 2>/dev/null)
RESET_SUCCESS=$(echo "$RESET_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.reset)" 2>/dev/null || echo "false")
\`\`\`

If RESET_SUCCESS != "true":
- Read reason from RESET_RESULT
- Log: "Cross-milestone continuation blocked: {reason}"
- Skip to Step 10

4. **If reset succeeded:** Loop back to Step 6 (Phase Loop) with fresh state.
The milestone-reset bridge command has already:
- Released and re-acquired the pipeline lock
- Cleared routing history
- Reset all state context except session_id and git_workflow
- Incremented milestone_count

If CROSS_MILESTONE != "true": Skip to Step 10.

### Step 10: Gap Detection Audit (INLINE)

Verify all required context sections are populated. Advisory warning if gaps found.

### Step 11: Session Summary + Cleanup

\`\`\`bash
luca-bridge lock-release 2>/dev/null || true
\`\`\`
\`luca-bridge transition --event=COMMIT_COMPLETE\`
`,
      order: 1,
    },
  ],
};

export const luSkill = createSkill(luSkillConfig);
