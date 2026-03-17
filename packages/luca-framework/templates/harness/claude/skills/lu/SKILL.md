# lu

Unified entry point and autonomous orchestrator for all Luca workflows with cognitive pre-flight, complexity routing, and configurable oversight.

## main

The single entry point for all Luca workflows. For quick/debug/PR tasks, this is a **routing skill** that classifies and delegates. For phase and milestone work, this is an **autonomous orchestrator** that drives backlog scan, WSJF prioritization, roadmap revision, phase planning, execution, and milestone completion — with configurable human oversight levels.

**Arguments:** `<task-description | Jira-URL | [TICKET-ID]> [--complexity=TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL] [--force-complex] [--skip-memory] [--skip-branch] [--oversight=flagged|milestone|phase|full-auto] [--skip-backlog] [--max-phases=N] [--no-swarm] [--dry-run] [--ask]`

> **Note:** Replace `[TICKET-ID]` with your project's configured ticket pattern (e.g., `PROJ-123`, `PT-123`, or your custom `ticketPattern` from `.planning/config.json`). Default pattern: `[A-Z]+-\d+`

**CRITICAL — WORKFLOW COMPLIANCE IS MANDATORY:**

1. You are an **orchestrator**. Do NOT execute plans, verify code, or review code yourself. Invoke the appropriate sub-skills and sub-agents as described below.
2. **Every step in this skill spec is a binding instruction, not a suggestion.** You MUST NOT skip, simplify, or substitute workflow steps — even if you believe an alternative approach would produce equivalent results. The workflow exists because specific tool usage (TeamCreate, SendMessage, Skill, Task) was intentionally designed and validated.
3. **If a step says to use TeamCreate, you MUST use TeamCreate.** If a step says to use Skill, you MUST use Skill. Do not replace TeamCreate with parallel Task calls. Do not replace sub-agent delegation with self-performed analysis. Do not rationalize deviations with "functionally equivalent" reasoning.
4. **The only valid way to skip a step is when the spec explicitly provides a skip condition** (e.g., complexity gating, `--no-swarm` flag, oversight level). If no skip condition is documented, the step is mandatory.
5. **NEVER write code directly.** You are forbidden from using Write, Edit, or any file-modification tool. All code changes happen through `Skill(skill: "phase-execute")`, which delegates to lu-executor sub-agents. If you find yourself about to write or edit a file, STOP — you are violating the orchestrator boundary.
6. **The phase pipeline is inviolable: classify → discuss → plan → execute.** Every phase MUST pass through these steps in order. You MUST NOT jump from complexity classification to writing code. You MUST NOT skip planning because "the task is simple." TRIVIAL and SIMPLE phases still require PLAN.md files — the complexity level only affects model tier and iteration counts, never which steps run.


## sub-agent_delegation_requirements

This skill uses TWO delegation mechanisms and serves as both a **router** (for quick/debug/PR tasks) and a **meta-orchestrator** (for phase/milestone work).

**Skill tool** — for workflow sub-skills:

- Invoke: `Skill(skill: "skill-name", args: "...")`
- Each invoked skill loads its own SKILL.md with full instructions
- Users see visual skill headers for each step

**Sub-skills invoked (via Skill tool):**

- `phase-discuss` — Context gathering for all phases (depth scales with complexity)
- `phase-plan` — Auto-generate PLAN.md files for phases
- `phase-execute` — Full execution pipeline (waves, harness, verification, code review)
- `milestone-complete` — Archive and complete milestones
- `milestone-new` — Start new milestones (if cross_milestone enabled)
- `git-commit` — Commit orchestrator-level changes
- `quick` — Ad-hoc tasks (TRIVIAL/SIMPLE only)
- `pr-address` — PR review work
- `debug` — Debug workflow
- `session-plan` — Session planning
- `progress` — Progress check
- `project-new` — New project initialization
- `jira-issue` — Jira issue mirroring
- `git-feature` — Feature branch setup

**Task tool** — for specialized agents:

- Invoke: `Task(agent: "agent-name", prompt: "...")`
- Agents run as sub-agents within the current context

**Sub-agents spawned (via Task tool):**

- `lu-cognition` — Cognitive pre-flight at session start
- `lu-router` — Classify complexity for each phase
- `lu-verifier` — Verify completed work
- `lu-learner` — Extract learnings from completed tasks
- `lu-pm-planner` — WSJF scoring and backlog prioritization (fallback for `--no-swarm` roadmap revision)
- `lu-roadmap-architect` — Architectural impact analysis for roadmap revision (swarm specialist)
- `lu-roadmap-prioritizer` — WSJF scoring and milestone scoping for roadmap revision (swarm specialist)
- `lu-roadmap-qa` — Testing gap analysis and QA impact for roadmap revision (swarm specialist)
- `lu-roadmap-synthesizer` — Merges specialist analyses into unified roadmap proposal (swarm synthesizer)

### Model Resolution

Resolve models before spawning agents:

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

| Agent       | quality | balanced | budget |
| ----------- | ------- | -------- | ------ |
| lu-verifier | sonnet  | sonnet   | haiku  |
| lu-learner  | sonnet  | haiku    | haiku  |
| lu-planner  | opus    | opus     | sonnet |
| lu-executor | opus    | sonnet   | sonnet |

**Current model values:**

- Lightweight agents (lu-learner): `model="fast"`
- Reasoning-intensive agents (lu-verifier, lu-planner, lu-executor): omit model (inherit from parent)


## workflow

## Vault Resolution

Read `.planning/config.json` and extract `muninn.vault` as REPO_VAULT. Set DEFAULT_VAULT = "default".

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

Use REPO_VAULT for project-scoped operations (session, metric, brain:project) and DEFAULT_VAULT for cross-cutting operations (pattern, pitfall, preference, brain:user). Pass the resolved vault names to sub-agents (lu-cognition, lu-learner) in their prompts.

Execute these steps in order. Each step is either a Task tool call (for agents) or a Skill tool call (for sub-skills).

### Step 0: Parse Request

Determine:

- **Task type**: New project, phase work, PR review, debug, quick task, or session planning
- **Complexity override**: Check for `--complexity=<level>` or `--force-complex` flags
- **Git context**: Check for Jira URL, ticket ID, or plain task description
- **Skip flags**: `--skip-memory`, `--skip-branch`
- **Autonomous pipeline flags**: `--oversight`, `--skip-backlog`, `--max-phases`, `--no-swarm`, `--dry-run`
- **`--ask`**: Shorthand for `--oversight=phase` (human-in-the-loop control). If `--ask` is passed, set OVERSIGHT to "phase".

### Step 1: Git Context Setup (if applicable)

If the request includes a Jira ticket or URL and `--skip-branch` is NOT set:

1. Check if a GitHub issue exists for this ticket
2. If not, invoke: `Skill(skill: "jira-issue", args: "<ticket-id>")`
3. Create or switch to the feature branch: `Skill(skill: "git-feature", args: "<ticket-id>")`

If already on a feature branch or `--skip-branch` is set, skip this step.

### Step 2: Cognitive Pre-Flight (if applicable)

**Skip for autonomous pipeline.** This step applies only to non-autonomous routing paths (quick, pr-address, debug, session-plan). Autonomous pipeline cognitive pre-flight is handled in Step 0c of the configuration section.

Unless `--skip-memory` is set, spawn the lu-cognition agent:

```
Task(agent: "lu-cognition", prompt: "Run cognitive pre-flight for task: <task-description>. Load project identity via mcp__muninn__muninn_recall_tree(vault: REPO_VAULT, id: 'brain:project-identity'). Recall relevant patterns via mcp__muninn__muninn_recall(vault: REPO_VAULT, context: 'relevant patterns for <task-description>'). Clear previous session context via mcp__muninn__muninn_forget(vault: REPO_VAULT, id: 'session:*'). REPO_VAULT=<resolved value from .planning/config.json muninn.vault>.")
```

### Step 3: Complexity Classification

If `--complexity=<level>` was passed, use that level directly. Write it via the bridge:

```bash
# Primary: Set complexity via bridge (updates state machine + STATE.md)
luca-bridge set-field --field=complexity --value="<LEVEL>" 2>/dev/null || true
luca-bridge snapshot 2>/dev/null || true
# Fallback: Update STATE.md directly if bridge unavailable
```

If `--force-complex` was passed, use COMPLEX.

Otherwise, spawn lu-router to classify:

```
Task(agent: "lu-router", prompt: "Classify complexity for task: <task-description>. Output: TRIVIAL, SIMPLE, MODERATE, COMPLEX, or CRITICAL.")
```

**Note:** For the autonomous pipeline (phase/milestone work), complexity is classified per-phase inside the phase loop (see the phase_loop section, Step 4c), not just once upfront.

### Step 4: Route to Handler (via Skill tool)

Based on the classified complexity and task type, invoke the appropriate handler:

**New project initialization:**
```
Skill(skill: "project-new", args: "<project description>")
```

**New milestone:**
```
Skill(skill: "milestone-new", args: "<milestone description>")
```

**Phase/milestone work (autonomous pipeline — DEFAULT for phase work):**

For phase and milestone work, lu runs the autonomous pipeline directly. This is the default behavior. The pipeline proceeds through the sections defined below:

1. **Configuration** (see configuration section): Read config, apply CLI flag overrides, cognitive pre-flight, session start
2. **Backlog scan** (see backlog_scan section): Scan pending todos, detect unplanned work
3. **Roadmap revision** (see roadmap_revision section): WSJF scoring, roadmap updates via specialist swarm
4. **Execution order** (see execution_order section): Build dependency graph, topological sort, group parallel levels
5. **Phase loop** (see phase_loop section): For each phase: classify → discuss → plan → execute
6. **Milestone gate** (see milestone_gate section): Milestone completion decision
7. **Cross-milestone** (see cross_milestone section): Optional continuation to next milestone
8. **Summary** (see summary section): Final session summary

**Ad-hoc / Quick task (narrow scope):**
Route to `quick` ONLY if ALL of these conditions are true:
- Task is TRIVIAL or SIMPLE complexity
- Task does NOT appear in `.planning/ROADMAP.md` or `.planning/todos/pending/`
- Task does NOT require creating new files (only modifications to 1-2 existing files)
- Task is a one-off fix, rename, or config change — NOT a feature

If ANY of these conditions is false, route to the full autonomous pipeline. When in doubt, use the full pipeline — quick is for genuinely trivial ad-hoc work only.
```
Skill(skill: "quick", args: "<task-description>")
```

**PR review work:**
```
Skill(skill: "pr-address", args: "<pr-url>")
```

**Debug workflow:**
```
Skill(skill: "debug", args: "<bug-description>")
```

**Session planning:**
```
Skill(skill: "session-plan")
```

**Progress check:**
```
Skill(skill: "progress")
```

### Step 5: Verification (always runs)

**Skip for autonomous pipeline.** Verification for autonomous pipeline phases is embedded inside phase-execute. This step applies only to non-autonomous routing paths (quick, pr-address, debug).

After the handler skill completes, spawn lu-verifier:

```
Task(agent: "lu-verifier", prompt: "Verify the work completed for task: <task-description>. Check against acceptance criteria and requirements.")
```

### Step 6: Learning Capture (always runs)

**Skip for autonomous pipeline.** Learning capture for autonomous pipeline phases is handled internally by phase-execute. This step applies only to non-autonomous routing paths.

Always spawn lu-learner (model tier resolved from routing table per complexity):

```
Task(agent: "lu-learner", model: "fast", prompt: "Extract learnings from completed task: <task-description>. Recall session findings via mcp__muninn__muninn_recall(vault: REPO_VAULT, context: 'current session context and findings'). Capture patterns, decisions, and pitfalls to MuninnDB via mcp__muninn__muninn_remember(vault: DEFAULT_VAULT, concept: '<category>', content: '<learning>'). Clear session context via mcp__muninn__muninn_forget(vault: REPO_VAULT, id: 'session:*') after extraction. REPO_VAULT=<resolved value from .planning/config.json muninn.vault>. DEFAULT_VAULT='default'.")
```

The lu-learner model tier is resolved via `resolveModelForAgent("lu-learner", complexity)`. At TRIVIAL/SIMPLE, the learner uses a "fast" model tier, keeping cost minimal while still capturing learnings.

### Step 7: Commit (if on feature branch)

If on a feature branch with uncommitted changes:
```
Skill(skill: "git-commit", args: "--no-push")
```


## configuration

## Step 0: Configuration & Pre-Flight

### 0a. Read Config

```bash
CONFIG=$(cat .planning/config.json 2>/dev/null || echo '{}')
# Primary: Read state from state machine (typed, validated)
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE=$(cat .planning/STATE.md 2>/dev/null || echo "")
ROADMAP=$(cat .planning/ROADMAP.md 2>/dev/null || echo "")
```

Extract settings (with defaults):

```bash
OVERSIGHT=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.oversight ?? 'milestone');
")
MAX_PHASES=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.max_phases_per_session ?? 10);
")
AUTO_PLAN=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.auto_plan_phases ?? true);
")
SKIP_UAT=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const lu = c.lu ?? c.autopilot;
  console.log(lu?.skip_uat ?? lu?.skip_uat_in_autopilot ?? true);
")
GAP_RETRIES=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.gap_closure_retries ?? 1);
")
CROSS_MILESTONE=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.cross_milestone ?? false);
")
BACKLOG_SCAN=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.backlog_scan ?? true);
")
SWARM_ENABLED=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.swarm_enabled ?? true);
")
MAX_PARALLEL=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.max_parallel_phases ?? 3);
")
```

### 0b. Apply CLI Flag Overrides

- If `--oversight=<level>` passed: override OVERSIGHT
- If `--ask` passed: set OVERSIGHT to "phase"
- If `--max-phases=N` passed: override MAX_PHASES
- If `--skip-backlog` passed: set BACKLOG_SCAN=false
- If `--no-swarm` passed: set SWARM_ENABLED=false (force serial execution)
- If `--dry-run` passed: set DRY_RUN=true (display plan, don't execute)

### 0c. Cognitive Pre-Flight

Unless the session already has cognitive context loaded:

```
Task(
  agent: "lu-cognition",
  prompt: "Run cognitive pre-flight for lu session. Load project identity via mcp__muninn__muninn_recall_tree(vault: REPO_VAULT, id: 'brain:project-identity'). Recall relevant patterns via mcp__muninn__muninn_recall(vault: REPO_VAULT, context: 'relevant patterns and decisions for planning and workflow'). Clear previous session context via mcp__muninn__muninn_forget(vault: REPO_VAULT, id: 'session:*')."
)
```

### 0d. Display Session Start & Initialize State Machine

Transition state machine from idle to preflight:

```bash
luca-bridge transition --event=START 2>/dev/null || true
```

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► SESSION START
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oversight:     {OVERSIGHT}
Max phases:    {MAX_PHASES}
Auto-plan:     {AUTO_PLAN}
Backlog scan:  {BACKLOG_SCAN}
Cross-milestone: {CROSS_MILESTONE}
Swarm:         {SWARM_ENABLED} (max {MAX_PARALLEL} parallel)
```

After cognitive pre-flight completes, transition to routing:

```bash
luca-bridge transition --event=PREFLIGHT_COMPLETE 2>/dev/null || true
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
 Luca ► BACKLOG SCAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ {TODO_COUNT} pending todos found
◆ {UNPLANNED_COUNT} not yet in roadmap
◆ {PLANNED_INCOMPLETE} in roadmap, incomplete
```

If UNPLANNED_COUNT == 0: Skip to Step 3.

## roadmap_revision

## Step 2: Roadmap Revision

**Only runs when unplanned todos exist (Step 1c found UNPLANNED_COUNT > 0).**

### 2a. Analyze Pending Todos

Read all todo contents for the prompt:

```bash
TODO_CONTENTS=""
for f in .planning/todos/pending/*.md; do
  TODO_CONTENTS="$TODO_CONTENTS\n---FILE: $f---\n$(cat "$f")"
done
```

**Branch based on SWARM_ENABLED:**

> **MANDATORY ROUTING — DO NOT SKIP OR SUBSTITUTE:**
> The path below is determined by the SWARM_ENABLED flag. If SWARM_ENABLED == true (the default), you MUST follow Path B and use TeamCreate to create a formal agent team. You MUST NOT substitute parallel Task calls for TeamCreate — they are not equivalent. The team infrastructure (TeamCreate, SendMessage, shared task lists) exists for coordination, auditability, and architectural consistency. Path A is ONLY valid when `--no-swarm` is explicitly passed or `swarm_enabled: false` is set in config.json.

---

#### Path A: Single-Agent (--no-swarm fallback)

**If SWARM_ENABLED == false:** Use the original single lu-pm-planner agent path.

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

Skip to Step 2b with the lu-pm-planner's ResultEnvelope.

---

#### Path B: Team-Based Swarm (default)

**If SWARM_ENABLED == true (default):** Use a 3-specialist + 1-synthesizer swarm for richer analysis.

##### 2a-swarm-i. Create Roadmap Revision Team

```
TeamCreate(
  team_name: "roadmap-revision-{timestamp}",
  description: "Specialist swarm for roadmap revision analysis"
)
```

Create 3 tasks for the specialist agents:

```
TaskCreate(
  subject: "Architectural impact analysis",
  description: "Analyze pending todos for architectural risk, dependency ordering, and domain boundary impact",
  activeForm: "Analyzing architecture impact"
)

TaskCreate(
  subject: "WSJF scoring and prioritization",
  description: "Score pending todos by WSJF and recommend phase absorption, new phases, or milestones",
  activeForm: "Scoring todos by WSJF"
)

TaskCreate(
  subject: "QA and testing gap analysis",
  description: "Assess QA impact, testing gaps, tech debt severity, and verification requirements",
  activeForm: "Analyzing QA impact"
)
```

##### 2a-swarm-ii. Spawn 3 Specialists in Parallel

```
Task(
  team_name: "roadmap-revision-{timestamp}",
  name: "architect",
  subagent_type: "lu-roadmap-architect",
  prompt: """
  You are a roadmap architect specialist (lu-roadmap-architect role).

  **All Pending Todos:**
  {TODO_CONTENTS}

  **Current ROADMAP.md:**
  {ROADMAP_CONTENT}

  **Current STATE.md:**
  {STATE_CONTENT}

  **Instructions:**
  1. Read all pending todos and the current roadmap
  2. Explore the src/ directory structure to understand domain layout and dependency tiers (T0-T3)
  3. For each todo, assess: domain boundary impact, dependency tier implications, cross-cutting concerns, circular dependency risk
  4. Rate each todo: LOW / MEDIUM / HIGH architectural risk
  5. Recommend phase placement and ordering constraints
  6. Send your complete ResultEnvelope to the lead via SendMessage

  **READ-ONLY:** Do NOT create, modify, or delete files. Output analysis only.
  **Output:** ResultEnvelope JSON with status, summary, artifacts (per-todo risk + placement), issues (warnings)
  """
)

Task(
  team_name: "roadmap-revision-{timestamp}",
  name: "prioritizer",
  subagent_type: "lu-roadmap-prioritizer",
  prompt: """
  You are a roadmap prioritizer specialist (lu-roadmap-prioritizer role).

  **All Pending Todos:**
  {TODO_CONTENTS}

  **Current ROADMAP.md:**
  {ROADMAP_CONTENT}

  **Current STATE.md:**
  {STATE_CONTENT}

  **Instructions:**
  1. Read all pending todos and the current roadmap
  2. Score each todo using WSJF: (Business Value + Time Criticality + Risk Reduction) / Effort
  3. Effort mapping: TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8
  4. For each todo, recommend: absorb (into which phase), new-phase (with goal), or new-milestone
  5. Rank all todos by WSJF descending
  6. Send your complete ResultEnvelope to the lead via SendMessage

  **READ-ONLY:** Do NOT create, modify, or delete files. Output analysis only.
  **Output:** ResultEnvelope JSON with status, summary, artifacts (per-todo WSJF + action), issues (warnings)
  """
)

Task(
  team_name: "roadmap-revision-{timestamp}",
  name: "qa-analyst",
  subagent_type: "lu-roadmap-qa",
  prompt: """
  You are a roadmap QA specialist (lu-roadmap-qa role).

  **All Pending Todos:**
  {TODO_CONTENTS}

  **Current ROADMAP.md:**
  {ROADMAP_CONTENT}

  **Current STATE.md:**
  {STATE_CONTENT}

  **Instructions:**
  1. Read all pending todos and the current roadmap
  2. Survey test infrastructure: Glob for __tests__/**/*.test.ts, read bunfig.toml
  3. For each todo, assess: affected test suites, testing gaps, tech debt severity, CI/CD impact, verification requirements
  4. Rate each todo: LOW / MEDIUM / HIGH QA impact
  5. Recommend verification mode per todo: Quick / Standard / Full / Full+Human
  6. Send your complete ResultEnvelope to the lead via SendMessage

  **READ-ONLY:** Do NOT create, modify, or delete files. Output analysis only.
  **Output:** ResultEnvelope JSON with status, summary, artifacts (per-todo QA impact + verification), issues (warnings)
  """
)
```

##### 2a-swarm-iii. Collect Specialist Results

Wait for all 3 specialists to send their ResultEnvelopes (10-minute timeout per specialist).

**Graceful degradation:**
- If 1 specialist times out or errors: proceed with 2 specialist outputs, note the gap
- If 2 specialists time out: proceed with 1 output, set confidence to LOW
- If all 3 fail: fall back to Path A (single lu-pm-planner)

##### 2a-swarm-iv. Spawn Synthesizer

After collecting specialist outputs, spawn the synthesizer with all results:

```
Task(
  team_name: "roadmap-revision-{timestamp}",
  name: "synthesizer",
  subagent_type: "lu-roadmap-synthesizer",
  prompt: """
  You are a roadmap synthesizer (lu-roadmap-synthesizer role).

  **Architect Analysis:**
  {ARCHITECT_RESULT}

  **Prioritizer Analysis:**
  {PRIORITIZER_RESULT}

  **QA Analysis:**
  {QA_RESULT}

  **Current ROADMAP.md:**
  {ROADMAP_CONTENT}

  **Instructions:**
  1. Cross-reference all 3 specialist analyses per todo
  2. Resolve conflicts (priority vs architecture, priority vs QA)
  3. Build unified phase ordering: architectural prerequisites first, then high-WSJF items
  4. Group related todos into phases based on domain affinity, effort similarity, shared test requirements
  5. Assign verification modes per phase based on QA analysis
  6. Flag milestone-worthy items
  7. Produce a unified ResultEnvelope matching the format the lu Step 2b expects

  **Conflict resolution rules:**
  - Architecture safety > WSJF priority (isolate HIGH-risk items even if prioritizer says absorb)
  - QA prerequisites > priority ordering (test infrastructure before consumers)
  - When architect + QA both flag HIGH: strongly recommend isolation + Full verification

  **READ-ONLY:** Do NOT create, modify, or delete files. Output analysis only.
  **Output:** ResultEnvelope JSON with:
  - status: "success"
  - summary: Human-readable revision proposal with change table
  - artifacts: Each proposed change (new phases, reordered phases, todos absorbed)
  - issues: All specialist warnings + synthesis-level concerns
  """
)
```

##### 2a-swarm-v. Cleanup and Continue

1. Shutdown all teammates:
   ```
   SendMessage(type: "shutdown_request", recipient: "architect")
   SendMessage(type: "shutdown_request", recipient: "prioritizer")
   SendMessage(type: "shutdown_request", recipient: "qa-analyst")
   SendMessage(type: "shutdown_request", recipient: "synthesizer")
   TeamDelete()
   ```

2. Feed the synthesizer's ResultEnvelope into Step 2b (unchanged).

---

### 2b. Present Proposed Changes

Display the proposal ResultEnvelope:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► ROADMAP REVISION PROPOSAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{summary from proposal ResultEnvelope}

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
bun run commit --message="revise roadmap with unplanned backlog items" --type=docs --scope=lu --no-push --skip-checks
```

### 2e. GitHub Issue & Branch

**After applying roadmap changes, ensure a GitHub issue and feature branch exist for the milestone.**

Read state from bridge (with STATE.md fallback) and check for existing GitHub issue/ticket:

\`\`\`bash
# Primary: Read state from bridge
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
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
   luca-bridge set-field --field=github_issue --value={issue_number} 2>/dev/null || true
   luca-bridge set-field --field=branch --value="{branch_name}" 2>/dev/null || true
   luca-bridge snapshot 2>/dev/null || true
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

### 3d. Group Independent Phases (Swarm Detection)

If SWARM_ENABLED == true:

Group phases into "levels" based on the dependency DAG:
- **Level 0**: phases with no dependencies (or all deps already complete)
- **Level 1**: phases whose only dependencies are Level 0 phases
- **Level N**: phases whose dependencies are all in levels 0..N-1

For each level with 2+ phases:
- Mark as **PARALLEL** — will use agent team
- Cap group size at MAX_PARALLEL (excess phases overflow to a new group at the same level)

For each level with 1 phase:
- Mark as **SERIAL** — will execute normally via existing Steps 4a-4i

If SWARM_ENABLED == false:
- Every level contains exactly 1 phase — all execution is serial

### 3e. Apply Max Phases Limit

If MAX_PHASES is set and total phase count across all levels exceeds it:
- Truncate levels to fit within MAX_PHASES
- Note deferred phases in log

### 3f. Display Execution Plan

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► EXECUTION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Level | Phases | Mode | Depends On |
|-------|--------|------|------------|
| 0 | Phase 87, 88, 89 | PARALLEL (team) | None |
| 1 | Phase 90 | SERIAL | Level 0 |
| 2 | Phase 91, 92 | PARALLEL (team) | Level 1 |

Total: {N} phases across {L} levels
Parallel levels: {P} (will use agent teams)
```

If `--dry-run`: Display this plan and EXIT. Do not proceed to execution.

## phase_loop

## Step 4: Level-Based Execution Loop

**Initialize tracking state:**

```
COMPLETED_PHASES=[]
PARKED_PHASES=[]
LEVEL_INDEX=0
```

**For each level in execution_levels (from Step 3d):**

Check the level's mode:
- If **SERIAL** (1 phase): execute via Steps 4a-4i (existing serial path)
- If **PARALLEL** (2+ phases, SWARM_ENABLED): execute via Steps 4-swarm-a through 4-swarm-h

> **MANDATORY:** When the level mode is PARALLEL, you MUST use TeamCreate to create an agent team and spawn teammates via Task with `team_name`. Do NOT substitute with individual Task calls or attempt to execute parallel phases yourself. The team infrastructure ensures proper coordination, worktree isolation, and merge sequencing.

---

### Serial Execution Path (Steps 4a-4i)

Used for single-phase levels OR when SWARM_ENABLED == false.

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
 Luca ► PHASE {NN}: {Name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Goal: {phase goal}
Depends on: {dependencies}
Plans: {plan count or "needs planning"}

Options:
  1. Continue — Plan and execute this phase
  2. Skip — Park this phase and move to next
  3. Stop — End session
```

Wait for user input. Route by choice.

- If OVERSIGHT == "milestone", "flagged", or "full-auto": auto-continue.

### 4c. Complexity Classification (MANDATORY)

**STOP-CHECK: Before this step, you should have completed 4a (dependency check) and 4b (oversight gate). If you have not, go back.**

Spawn lu-router to classify:

```
Task(
  agent: "lu-router",
  prompt: "Classify complexity for Phase {NN}: {phase_goal}. Consider file count, scope, and risk. Output: TRIVIAL, SIMPLE, MODERATE, COMPLEX, or CRITICAL."
)
```

Write complexity via bridge (transitions state machine from routing to planning/discussing):

```bash
luca-bridge transition --event=ROUTE_COMPLETE --data='{"complexity":"{COMPLEXITY}"}' 2>/dev/null || true
```

**IMPORTANT: The complexity result (TRIVIAL through CRITICAL) determines model tiers and iteration counts only. It does NOT allow skipping any subsequent steps. ALL phases proceed through 4d → 4e → 4f regardless of complexity.**

### 4d. Discussion (MANDATORY — No Exceptions)

**You MUST call this Skill tool invocation. This step has no skip condition.**

Discussion runs at every complexity level. The discussion depth and model tier scale with complexity via the routing table, but the step itself is never skipped.

**Resolve premortem gate before invoking phase-discuss:**

```bash
# Orchestrator resolves the premortem gate — sub-skill does NOT decide
PREMORTEM_FLAG=""
PREMORTEM_ENABLED=$(luca-bridge gate-check --gate=premortem 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.enabled)" 2>/dev/null || echo "false")
if [ "$PREMORTEM_ENABLED" = "true" ]; then
  PREMORTEM_FLAG="--run-premortem"
else
  PREMORTEM_FLAG="--skip-premortem"
fi
```

```
Skill(skill: "phase-discuss", args: "{phase_number} $PREMORTEM_FLAG")
```

Transition state machine after discussion:

```bash
luca-bridge transition --event=DISCUSS_COMPLETE 2>/dev/null || true
```

### 4e. Planning (MANDATORY — No Exceptions)

**You MUST ensure PLAN.md files exist before proceeding to execution. phase-execute WILL FAIL without them.**

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

**STOP-CHECK: Verify PLAN.md files now exist. If they do not, do NOT proceed to 4f.**

```bash
PLAN_COUNT=$(ls .planning/phases/{phase_dir}/*-PLAN.md 2>/dev/null | grep -c '.' || echo "0")
if [ "$PLAN_COUNT" = "0" ]; then
  echo "ERROR: No PLAN.md files after planning step. Cannot proceed to execution."
  # Park this phase
fi
```

Transition state machine to executing:

```bash
luca-bridge transition --event=PLAN_COMPLETE 2>/dev/null || true
```

### 4f. Execution (MANDATORY — Via Sub-Skill Only)

**You MUST invoke phase-execute via Skill tool. Do NOT write, edit, or modify any project files yourself. You are an orchestrator, not an executor.**

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

**Resolve process_data gate before invoking phase-execute:**

```bash
# Orchestrator resolves the process_data gate — sub-skill does NOT decide
PROCESS_DATA_FLAG=""
PROCESS_DATA_ENABLED=$(luca-bridge gate-check --gate=process_data 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.enabled)" 2>/dev/null || echo "false")
if [ "$PROCESS_DATA_ENABLED" = "true" ]; then
  PROCESS_DATA_FLAG="--run-process-data"
else
  PROCESS_DATA_FLAG="--skip-process-data"
fi
EXEC_FLAGS="$EXEC_FLAGS $PROCESS_DATA_FLAG"
```

Invoke the full execution pipeline:

```
Skill(skill: "phase-execute", args: "{EXEC_FLAGS}")
```

**NEVER substitute this Skill call with direct file writes. phase-execute spawns lu-executor sub-agents that handle all code changes, verification, and code review.**

### 4g. Result Handling

Parse the phase-execute outcome from STATE.md and phase VERIFICATION.md:

```bash
VERIFICATION=$(cat .planning/phases/{phase_dir}/*-VERIFICATION.md 2>/dev/null || echo "")
```

**Route by outcome:**

**If phase passed (verification status: "passed"):**
1. Add to COMPLETED_PHASES
2. Update ROADMAP.md plans to `[x]`
3. Log to MuninnDB: `mcp__muninn__muninn_remember(vault: REPO_VAULT, concept: "session:findings", content: "{timestamp} [PHASE-COMPLETE] Phase {NN} passed")`
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

Learning capture always runs (model tier scales with complexity via routing table):
- TRIVIAL/SIMPLE: standard (fast model tier)
- MODERATE: standard (fast model tier)
- COMPLEX: full (fast model tier)
- CRITICAL: full + debrief (balanced model tier)

Learning is already handled by phase-execute internally. No additional action needed here.

### 4i. Progress Display

After each phase:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PROGRESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Completed: {COMPLETED_PHASES count}/{total}
Parked:    {PARKED_PHASES count}
Remaining: {remaining count}
```

---

### Parallel Execution Path (Swarm Mode)

Used for levels with 2+ independent phases when SWARM_ENABLED == true.

### 4-swarm-a. Oversight Gate (Parallel Level)

- If OVERSIGHT == "phase":

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PARALLEL LEVEL {N}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phases: {phase list with goals}
Mode: PARALLEL (agent team, max {MAX_PARALLEL} concurrent)

Options:
  1. Continue — Plan and execute all phases in parallel
  2. Serial — Demote to serial execution for this level
  3. Skip — Park all phases in this level
  4. Stop — End session
```

- If OVERSIGHT == "milestone", "flagged", or "full-auto": auto-continue.

### Phase A: Parallel Planning with Lead Review Gate

### 4-swarm-b. Create Planning Team

```
TeamCreate(
  team_name: "lu-plan-L{N}-{timestamp}",
  description: "Parallel planning for {count} independent phases"
)
```

Create a task for each phase to plan:

```
For each phase in this level:
  TaskCreate(
    subject: "Plan Phase {NN}: {goal}",
    description: "Generate PLAN.md for phase {NN}",
    activeForm: "Planning Phase {NN}"
  )
```

### 4-swarm-c. Spawn Planning Teammates (in parallel)

Each planner explores the codebase and generates a PLAN.md. They do NOT write code.

```
For each phase (in parallel, using Task tool):
  Task(
    team_name: "lu-plan-L{N}-{timestamp}",
    name: "planner-{NN}",
    subagent_type: "general-purpose",
    prompt: """
    You are a Luca phase planner. Create a PLAN.md for this phase.

    **Phase:** {NN} - {goal}
    **Phase directory:** .planning/phases/{phase_dir}/
    **Project state:** {STATE.md content}
    **Working memory:** {session context from MuninnDB}
    **CLAUDE.md conventions:** Read CLAUDE.md for project conventions.

    **Instructions:**
    1. Read the phase goal and any existing context in the phase directory
    2. Explore the codebase to understand the scope of changes needed
    3. Create {NN}-PLAN.md in the phase directory with:
       - Goal-backward analysis
       - Atomic tasks with verification criteria
       - Wave grouping for any internal parallelism
       - Target ~50% context budget
    4. Mark your task completed via TaskUpdate
    5. Send the plan summary to the lead via SendMessage

    **Do NOT write implementation code.** Only produce the PLAN.md.
    """
  )
```

### 4-swarm-d. Lead Reviews All Plans Together

After all planners complete and send their summaries, shutdown the planning team:

```
For each planner:
  SendMessage(type: "shutdown_request", recipient: "planner-{NN}")
# After all acknowledge:
TeamDelete()
```

Then the lead reads all generated PLAN.md files and performs **cross-plan review**:

1. **Conflicting file modifications**: Check if two plans modify the same file
   - If conflict found: either merge the plans into a single executor or demote the conflicting phase to serial (defer to next level)
2. **Shared utility opportunities**: Check if both plans need similar helpers
   - If found: note in the execution instructions so the first executor creates it
3. **API contract alignment**: Check if one plan changes a schema another depends on
   - If found: order the plans (schema change first) or demote to serial

**If all plans are clean**: approve all and proceed to Phase B.
**If conflicts cannot be resolved**: demote conflicting phases to serial, execute clean phases in parallel.

### Phase B: Parallel Execution

### 4-swarm-e. Create Execution Team

```
TeamCreate(
  team_name: "lu-exec-L{N}-{timestamp}",
  description: "Parallel execution of {count} reviewed plans"
)
```

### 4-swarm-f. Create Tasks and Spawn Execution Teammates (in parallel)

```
For each phase with an approved plan:
  TaskCreate(
    subject: "Execute Phase {NN}: {goal}",
    description: "{PLAN.md content + execution instructions}",
    activeForm: "Executing Phase {NN}"
  )

  Task(
    team_name: "lu-exec-L{N}-{timestamp}",
    name: "executor-{NN}",
    subagent_type: "general-purpose",
    isolation: "worktree",
    prompt: """
    You are a lu executor. Implement the approved plan for Phase {NN}.

    **Your Phase:** {NN} - {goal}
    **Approved Plan:** {PLAN.md content}

    **Instructions:**
    1. You are in an isolated git worktree — work freely
    2. Read and follow CLAUDE.md conventions (use Bun, not Node)
    3. Execute all plan tasks with atomic commits
    4. Run `bunx --bun tsc --noEmit` before each commit
    5. When done, mark your task completed: TaskUpdate(taskId: "{id}", status: "completed")
    6. Send a summary to the lead: SendMessage(type: "message", recipient: "team-lead", content: "...", summary: "Phase {NN} execution complete")

    **Do NOT modify:** ROADMAP.md, STATE.md, .planning/ metadata (lead handles these)
    **Do NOT deviate from the approved plan** without messaging the lead first.
    """
  )
```

### 4-swarm-g. Monitor Execution

- Teammate messages are auto-delivered (no polling needed)
- On each completion: log progress, update display
- On teammate error: log the error, mark phase as FAILED, continue monitoring others
- Timeout: if no progress from a teammate after 30 minutes, send a follow-up message:
  `SendMessage(type: "message", recipient: "executor-{NN}", content: "Status check — are you blocked?", summary: "Checking executor progress")`
- If no response after another 10 minutes: mark phase as TIMED_OUT, continue with others

### 4-swarm-h. Merge and Verify

After all executors in this level complete (or are marked failed/timed out):

1. **Merge each worktree branch** sequentially into the feature branch:
   ```bash
   git merge --no-ff {worktree-branch} -m "merge: Phase {NN} from parallel execution"
   ```

2. **Run post-merge harness** after each merge:
   ```bash
   bunx --bun tsc --noEmit
   ```

3. **If harness fails** after a merge:
   - Identify which merge caused the failure
   - Attempt fix (max 2 iterations)
   - If still failing: revert that merge and park the phase

4. **After all successful merges**: run full harness one final time to confirm clean state

### 4-swarm-i. Cleanup Level

1. Shutdown execution teammates:
   ```
   For each executor:
     SendMessage(type: "shutdown_request", recipient: "executor-{NN}")
   # After all acknowledge:
   TeamDelete()
   ```

2. Update ROADMAP.md: mark completed phase plans as `[x]`
3. Add completed phases to COMPLETED_PHASES
4. Add failed/timed-out phases to PARKED_PHASES with reasons
5. Update state via bridge:
   ```bash
   luca-bridge transition --event=PHASE_COMPLETE --data='{"phase_id":{NN},"summary":"Phase {NN} completed (parallel)"}' 2>/dev/null || true
   ```
6. Log to MuninnDB session memory via muninn_remember

### 4-swarm-j. Level Progress Display

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► LEVEL {N} COMPLETE (PARALLEL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Phase | Status | Notes |
|-------|--------|-------|
| {NN}  | Passed ✓ | merged successfully |
| {NN}  | Passed ✓ | merged successfully |
| {NN}  | Parked ⏸ | {reason} |

Completed: {COMPLETED_PHASES count}/{total}
Parked:    {PARKED_PHASES count}
Remaining: {remaining levels}
```

Continue to next level.

## milestone_gate

## Step 5: Milestone Boundary

After all phases in the execution order have been attempted (completed or parked):

### 5a. Milestone Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► MILESTONE SUMMARY
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
- Display: "3 milestones completed. Continue?"
- This prevents runaway execution.

## oversight_gates

## Oversight Gate Reference

### Gate Behavior Matrix

| Decision Point | full-auto | flagged | milestone | phase |
|----------------|-----------|---------|-----------|-------|
| Before each phase | continue | continue | continue | PAUSE: Continue/Skip/Stop |
| Before parallel level | continue | continue | continue | PAUSE: show parallel plan |
| Phase failure/gaps | park, continue | PAUSE: Retry/Skip/Stop | park, continue | PAUSE: Retry/Skip/Stop |
| Teammate failure | skip phase, continue | PAUSE | skip phase | PAUSE |
| Merge conflict | auto-resolve or skip | PAUSE | skip phase | PAUSE |
| CRITICAL code review | PAUSE (safety) | PAUSE | PAUSE | PAUSE |
| Milestone boundary | auto-complete | PAUSE if parked | PAUSE: summary + confirm | PAUSE: summary + confirm |
| Roadmap revision | auto-approve | auto-approve | PAUSE: approve changes | PAUSE: approve changes |

### Oversight Descriptions

| Level | Description |
|-------|-------------|
| `full-auto` | No pauses except CRITICAL safety. Auto-plan, auto-execute, auto-complete. For overnight runs or trusted codebases. |
| `flagged` | Runs autonomously but pauses when issues are detected (gaps, failures, critical reviews). Smart auto mode. |
| `milestone` | Pauses between milestones. Autonomous within a milestone. Default and recommended starting point. |
| `phase` | Pauses after each phase. Most cautious. Phase-by-phase approval. Use `--ask` as shorthand. |

### Relationship to Existing Gates

The lu skill overlays its oversight logic on top of the existing `gates` config in `.planning/config.json`. The existing gates act as a floor:

- If a gate is explicitly `false` in config.json: it stays false regardless of oversight
- If a gate is `true` in config.json: the lu skill may suppress the pause based on oversight level

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
| Teammate timeout | Executor unresponsive for 40+ minutes | Park phase, merge others |
| Teammate error | Executor encountered unrecoverable error | Park phase, continue others |
| Merge conflict | Worktree branch conflicts with feature branch | Park phase, merge others |
| Post-merge harness failure | Tests/types fail after merge (2 fix attempts) | Park all phases from this level |

### Swarm-Specific Failure Modes

| Failure Mode | Response |
|-------------|----------|
| Teammate timeout (40 min) | Mark phase TIMED_OUT, park it, merge other completed phases |
| Teammate error | Mark phase FAILED, park it, continue monitoring other teammates |
| Merge conflict | Log conflict, park that phase, merge remaining clean phases |
| Post-merge harness failure | Attempt fix (2 iterations), then revert merge and park the phase |
| All teammates fail | Fallback: re-attempt all phases serially on next `/lu` run |

### Recovery

Parked phases can be retried by:
1. Running `/lu` again — parked phases will be re-attempted (serially if previously failed in swarm)
2. Running `/phase-plan {N} --gaps` manually for specific phases
3. Running `/phase-execute {N}` manually after fixing issues

### Cascade Prevention

The dependency check in Step 4a prevents attempting phases whose prerequisites are parked. This avoids wasting execution time on phases that cannot succeed.

For parallel levels, cascade prevention also applies: if a phase in a parallel group is parked due to a dependency, it is excluded from the team before spawning.

## summary

## Step 7: Final Summary

After all phases attempted and milestone boundary handled:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► SESSION COMPLETE
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
| Phases run in parallel | {N} |
| Phases run serially | {N} |
| Commits made | {N} |

## Completed Phases
{list of completed phases with one-line summaries}

## Parked Phases
{list of parked phases with reasons}

## Remaining Backlog
{count of remaining pending todos}

## Recommended Next Steps
{context-dependent recommendations:
  - If parked phases: "Review parked phases and fix issues, then run /lu again"
  - If milestone complete: "Run /milestone-audit to review"
  - If backlog remains: "Run /lu to continue with next milestone"
  - If all done: "All work complete. Consider adding new todos or starting a new milestone."}
```

### Update State

1. Update state via bridge (falls back to STATE.md):

```bash
luca-bridge transition --event=COMMIT_COMPLETE 2>/dev/null || true
```

2. Regenerate STATE.md via bridge snapshot:

```bash
luca-bridge snapshot 2>/dev/null || true
# Fallback: Update STATE.md manually with session results
```

3. Log final status to MuninnDB: `mcp__muninn__muninn_remember(vault: REPO_VAULT, concept: "session:findings", content: "Lu session complete")`
4. Commit session metadata:

```bash
git add .planning/STATE.md .planning/state.json
bun run commit --message="lu session complete" --type=docs --scope=lu --no-push --skip-checks
```