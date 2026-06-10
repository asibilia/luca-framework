/**
 * quick skill — Execute a quick ad-hoc task with Luca quality guarantees but minimal ceremony.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/quick/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Quick

Execute small, ad-hoc tasks with Luca guarantees (atomic commits, workflow-state tracking) while skipping optional agents (research, plan-reviewer, verifier).

Quick mode is the same system with a shorter path:

- Invokes the architect mode-agent (planning) + the \`executor\` subagent
- Skips researcher, plan-reviewer, verifier
- Quick tasks live in a phase directory like any other phase (per LUCA_DIR_CONTRACT)
- Tracked via the canonical workflow state machine

**Use when:** You know exactly what to do and the task is small enough to not need research or verification.

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to subagents using the Task tool.

**Required subagents for this skill:**

- The \`architect\` mode-agent performs the planning work in v13 (the v12-era \`lu-planner\` subagent was dropped per plan §5.6)
- \`executor\` - Executes the plan

**DO NOT** attempt to plan or execute yourself. Spawn the appropriate subagents via the \`Task\` tool, or invoke the architect mode-agent.

## Process

> Model tiers come from each agent's own definition (and the harness default); this orchestrator never picks model strings.

### Step 1: Pre-flight Validation

Check that an active Luca project exists:

\`\`\`bash
# Auto-initialize the canonical .luca/ skeleton if missing (quick mode works without a full roadmap)
if [ ! -d .luca ]; then
  luca init 2>/dev/null || true
fi
\`\`\`

Quick tasks work independently — no \`roadmap.md\` required. The \`luca init\` command writes the canonical \`.luca/\` skeleton per LUCA_DIR_CONTRACT.

### Step 2: Get Task Description

Use AskQuestion tool:

- header: "Quick Task"
- question: "What do you want to do?"

Store response as \`$DESCRIPTION\`.

Generate slug from description:

\`\`\`bash
slug=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)
\`\`\`

### Step 3: Calculate Next Quick Task Number

\`\`\`bash
mkdir -p .luca/quick
last=$(ls -1d .luca/quick/[0-9][0-9][0-9]-* 2>/dev/null | sort -r | head -1 | xargs -I{} basename {} | grep -oE '^[0-9]+')

if [ -z "$last" ]; then
  next_num="001"
else
  next_num=$(printf "%03d" $((10#$last + 1)))
fi
\`\`\`

### Step 4: Create Quick Task Directory

\`\`\`bash
QUICK_DIR=".luca/quick/\${next_num}-\${slug}"
mkdir -p "$QUICK_DIR"
\`\`\`

### Step 5: Spawn Planner (Quick Mode)

**MANDATORY**: Invoke the architect mode-agent (which performs planning in v13 — the v12-era \`lu-planner\` subagent was dropped per plan §5.6). Do NOT attempt to plan yourself.

First, read context:

\`\`\`bash
# Read workflow state from .luca/state.json via the luca CLI
STATE_JSON=$(luca state read 2>/dev/null || echo '{"initialized":false}')
# Recall session context from MuninnDB:
# mcp__muninn__muninn_recall(vault: "default", context: "current session context for quick task")
WORKING_CONTENT="[recalled from MuninnDB session context]"
\`\`\`

Then spawn the architect mode-agent:

\`\`\`python
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
- Create plan.md in {quick_dir} (canonical filename per LUCA_DIR_CONTRACT)
- Plan should have clear tasks with verification criteria
- Return summary of plan created
</output_requirements>

Create a quick plan for this task.
""",
  subagent_type="luca: Architect",
  description="Quick plan: {description}"
)
\`\`\`

**Do NOT proceed until the Task returns.**

### Step 6: Spawn Executor

**MANDATORY**: You MUST spawn an executor sub-agent. Do NOT attempt to execute yourself.

First, read the plan:

\`\`\`bash
PLAN_CONTENT=$(cat "\${QUICK_DIR}/plan.md")
# Read workflow state from .luca/state.json via the luca CLI
STATE_JSON=$(luca state read 2>/dev/null || echo '{"initialized":false}')
\`\`\`

Then spawn the executor:

\`\`\`python
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
- Do NOT update \`.luca/roadmap.md\` (quick tasks are separate phases per the contract)
- Write the execution summary to the canonical \`execute/summary.md\`
</execution_rules>

<output_requirements>
- Create \`execute/summary.md\` in \`{quick_dir}\` (canonical per LUCA_DIR_CONTRACT)
- Return commit hash and summary of what was done
</output_requirements>

Execute this quick task plan.
""",
  subagent_type="executor",
  description="Execute quick: {description}"
)
\`\`\`

**Do NOT proceed until the Task returns.**

### Step 7: Advance Workflow State

Advance the pipeline through learn → finalize → idle via the standard transitions:

\`\`\`bash
luca state advance --to-step learn
luca state advance --to-step finalize
luca state advance --to-step idle
\`\`\`

### Step 8: Final Commit and Completion

\`\`\`bash
git add .
git commit -m "docs(quick-\${next_num}): \${DESCRIPTION}"
\`\`\`

Display completion:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► QUICK TASK COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Quick Task \${next_num}: \${DESCRIPTION}

Summary: \${QUICK_DIR}/execute/summary.md
Commit: \${commit_hash}

Ready for next task: /quick
\`\`\`

## Success Criteria

- [ ] \`.luca/\` directory exists (auto-created via \`luca init\` if needed)
- [ ] \`.luca/state.json\` exists (auto-created via \`luca init\` if needed)
- [ ] User provides task description
- [ ] Slug generated (lowercase, hyphens, max 40 chars)
- [ ] Next phase number calculated (zero-padded NN per LUCA_DIR_CONTRACT)
- [ ] Phase directory created at \`.luca/phases/NN-slug/\`
- [ ] \`plan.md\` written by the architect mode-agent
- [ ] \`execute/summary.md\` written by the \`executor\` subagent
- [ ] Workflow state advanced through learn → finalize → idle
- [ ] Artifacts committed

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Task complete | Check project status | \`/progress\` |
| More quick tasks | Run another | \`/quick\` |
| Want to commit | Commit changes | \`git commit\` with a conventional message |
| Want PR | Create pull request | Run \`gh pr create\` |

**Primary:** \`/progress\` — See project status after quick task

**Also available:**

- \`/quick\` — Run another quick task
- \`/help\` — See all available commands
</main>
`

export const quickSkill = defineSkill({
    name: "quick",
    description: "Execute a quick ad-hoc task with Luca quality guarantees but minimal ceremony.",
    body: BODY,
})
