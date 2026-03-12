# quick

Execute a quick ad-hoc task with Luca quality guarantees but minimal ceremony.

## main

<main>
# Luca Quick

Execute small, ad-hoc tasks with Luca guarantees (atomic commits, STATE.md tracking) while skipping optional agents (research, plan-checker, verifier).

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

Quick mode is the same system with a shorter path:

- Spawns lu-planner (quick mode) + lu-executor(s)
- Skips lu-phase-researcher, lu-plan-checker, lu-verifier
- Quick tasks live in `.planning/quick/` separate from planned phases
- Updates STATE.md "Quick Tasks Completed" table (NOT ROADMAP.md)

**Use when:** You know exactly what to do and the task is small enough to not need research or verification.

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- `lu-planner` - Creates quick plan with 1-3 tasks
- `lu-executor` - Executes the plan

**DO NOT** attempt to plan or execute yourself. Spawn the appropriate agents.

**Reference:** See `.cursor/luca/references/task-directive.md` for Task() syntax patterns.

## Process

### Step 0: Resolve Model Profile

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

**Model lookup table:**

| Agent          | quality | balanced | budget |
| -------------- | ------- | -------- | ------ |
| lu-planner  | opus    | opus     | sonnet |
| lu-executor | opus    | sonnet   | sonnet |

> **Current Limitation:** Cursor's Task tool only supports `model="fast"` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

```
# Planning and execution require reasoning → omit (inherit from parent)
planner_model = (omit)
executor_model = (omit)
```

### Step 1: Pre-flight Validation

Check that an active Luca project exists:

```bash
# Auto-initialize minimal .planning/ if needed (quick mode works without full project)
if [ ! -d .planning ]; then
  mkdir -p .planning/quick
  # Primary: Initialize state via bridge
  luca-bridge ensure-init 2>/dev/null || true
  # Fallback: Create STATE.md directly
  cat > .planning/STATE.md << 'EOF'
# Project State

## Quick Mode

This project uses quick mode only. No roadmap or phases.

## Quick Tasks Completed

| # | Description | Date | Commit | Files |
|---|-------------|------|--------|-------|

## Session Continuity

Last session: [date]
Mode: Quick tasks only
EOF
  echo "Initialized minimal .planning/ for quick tasks"
fi

# Ensure STATE.md exists (might have .planning/ but no STATE.md)
if [ ! -f .planning/STATE.md ]; then
  # Primary: Initialize state via bridge
  luca-bridge ensure-init 2>/dev/null || true
  # Fallback: Create STATE.md directly
  cat > .planning/STATE.md << 'EOF'
# Project State

## Quick Mode

This project uses quick mode only. No roadmap or phases.

## Quick Tasks Completed

| # | Description | Date | Commit | Files |
|---|-------------|------|--------|-------|

## Session Continuity

Last session: [date]
Mode: Quick tasks only
EOF
  echo "Created minimal STATE.md for quick tasks"
fi
```

Quick tasks work independently - no ROADMAP.md required. Auto-initializes minimal .planning/ if needed.

### Step 2: Get Task Description

Use AskQuestion tool:

- header: "Quick Task"
- question: "What do you want to do?"

Store response as `$DESCRIPTION`.

Generate slug from description:

```bash
slug=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)
```

### Step 3: Calculate Next Quick Task Number

```bash
mkdir -p .planning/quick
last=$(ls -1d .planning/quick/[0-9][0-9][0-9]-* 2>/dev/null | sort -r | head -1 | xargs -I{} basename {} | grep -oE '^[0-9]+')

if [ -z "$last" ]; then
  next_num="001"
else
  next_num=$(printf "%03d" $((10#$last + 1)))
fi
```

### Step 4: Create Quick Task Directory

```bash
QUICK_DIR=".planning/quick/${next_num}-${slug}"
mkdir -p "$QUICK_DIR"
```

### Step 5: Spawn Planner (Quick Mode)

**MANDATORY**: You MUST spawn a lu-planner sub-agent. Do NOT attempt to plan yourself.

First, read context:

```bash
# Primary: Read state from state machine bridge
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE_CONTENT=$(cat .planning/STATE.md 2>/dev/null || echo "")
# Recall session context from MuninnDB:
# mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "current session context for quick task")
WORKING_CONTENT="[recalled from MuninnDB session context]"
```

Then spawn the planner:

```python
Task(
  prompt="""
<planning_context>

**Mode:** quick
**Task:** {description}
**Quick Task Number:** {next_num}
**Quick Task Directory:** {quick_dir}

**Project State:**
{state_content}

**Working Memory:**
{working_content}

</planning_context>

<quick_mode_constraints>
- Create a SINGLE plan with 1-3 focused tasks
- Target ~30% context usage (simple, focused)
- No research or verification needed
- Tasks should be directly actionable
</quick_mode_constraints>

<output_requirements>
- Create {next_num}-PLAN.md in {quick_dir}
- Plan should have clear tasks with verification criteria
- Return summary of plan created
</output_requirements>

Create a quick plan for this task.
""",
  subagent_type="lu-planner",
  model="{planner_model}",
  description="Quick plan: {description}"
)
```

**Do NOT proceed until the Task returns.**

### Step 6: Spawn Executor

**MANDATORY**: You MUST spawn a lu-executor sub-agent. Do NOT attempt to execute yourself.

First, read the plan:

```bash
PLAN_CONTENT=$(cat "${QUICK_DIR}/${next_num}-PLAN.md")
# Primary: Read state from state machine bridge
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE_CONTENT=$(cat .planning/STATE.md 2>/dev/null || echo "")
```

Then spawn the executor:

```python
Task(
  prompt="""
<execution_context>

**Mode:** quick
**Quick Task Number:** {next_num}
**Quick Task Directory:** {quick_dir}

**Plan:**
{plan_content}

**Project State:**
{state_content}

</execution_context>

<execution_rules>
- Execute all tasks in the plan
- Commit each task atomically
- Do NOT update ROADMAP.md (quick tasks are separate)
- Create summary at end
</execution_rules>

<output_requirements>
- Create {next_num}-SUMMARY.md in {quick_dir}
- Return commit hash and summary of what was done
</output_requirements>

Execute this quick task plan.
""",
  subagent_type="lu-executor",
  model="{executor_model}",
  description="Execute quick: {description}"
)
```

**Do NOT proceed until the Task returns.**

### Step 7: Update STATE.md

Add row to "Quick Tasks Completed" table:

```markdown
| ${next_num} | ${DESCRIPTION} | $(date +%Y-%m-%d) | ${commit_hash} | [${next_num}-${slug}](./quick/${next_num}-${slug}/) |
```

### Step 8: Final Commit and Completion

```bash
git add .
bun run commit --message="${DESCRIPTION}" --type=docs --scope=quick-${next_num} --no-push --skip-checks
```

Display completion:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► QUICK TASK COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Quick Task ${next_num}: ${DESCRIPTION}

Summary: ${QUICK_DIR}/${next_num}-SUMMARY.md
Commit: ${commit_hash}

Ready for next task: /quick
```

## Success Criteria

- [ ] .planning/ directory exists (auto-created if needed)
- [ ] STATE.md exists (auto-created if needed)
- [ ] User provides task description
- [ ] Slug generated (lowercase, hyphens, max 40 chars)
- [ ] Next number calculated (001, 002, 003...)
- [ ] Directory created at `.planning/quick/NNN-slug/`
- [ ] `${next_num}-PLAN.md` created by planner
- [ ] `${next_num}-SUMMARY.md` created by executor
- [ ] STATE.md updated with quick task row
- [ ] Artifacts committed

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Task complete | Check project status | `/progress` |
| More quick tasks | Run another | `/quick` |
| Want to commit | Commit changes | Run `bun run commit` |
| Want PR | Create pull request | Run `gh pr create` |

**Primary:** `/progress` — See project status after quick task

**Also available:**

- `/quick` — Run another quick task
- `/help` — See all available commands
</main>