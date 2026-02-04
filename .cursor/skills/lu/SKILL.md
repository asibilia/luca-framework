---
name: lu
description: Unified entry point for Luca framework. Handles cognitive pre-flight, complexity routing, and workflow orchestration. Use for any development task.
disable-model-invocation: true
---

# Luca - Unified Entry Point

The single entry point for all Luca workflows. Handles git context setup, cognitive pre-flight, complexity classification, and intelligent routing to the appropriate handler.

**Arguments:** `<task-description | Jira-URL | PT-####> [--force-complex] [--skip-memory] [--skip-branch]`

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- `lu-verifier` - Verifies goals achieved after execution
- `lu-learner` - Extracts and stores learnings after verification

**DO NOT** attempt to do verification or learning capture yourself. Spawn the appropriate agent.

**Reference:** See `.cursor/luca/references/task-directive.md` for Task() syntax patterns.

### Model Resolution

Resolve models before spawning agents:

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

| Agent          | quality | balanced | budget |
| -------------- | ------- | -------- | ------ |
| lu-verifier | sonnet  | sonnet   | haiku  |
| lu-learner  | sonnet  | haiku    | haiku  |
| lu-planner  | opus    | opus     | sonnet |
| lu-executor | opus    | sonnet   | sonnet |

> **Current Limitation:** Cursor's Task tool only supports `model="fast"` or inheriting from parent. The table above is preserved for future compatibility.

**Current model variable values:**

```
# Lightweight agents → use "fast"
learner_model = "fast"

# Reasoning-intensive agents → omit (inherit from parent)
verifier_model = (omit)
planner_model = (omit)
executor_model = (omit)
```

## Workflow

```
User Request
    │
    ▼
┌──────────────────────┐
│  0. Git Context      │
│     Setup            │
│  (Jira → Issue →     │
│   Branch)            │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  1. Cognitive        │
│     Pre-Flight       │
│  (lu-cognition)   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  2. Complexity       │
│     Classification   │
│  (lu-router)      │
└──────────┬───────────┘
           │
    ┌──────┴──────┬──────────┐
    │             │          │
    ▼             ▼          ▼
┌────────┐  ┌────────┐  ┌────────────┐
│TRIVIAL │  │MODERATE│  │  COMPLEX   │
│Direct  │  │Quick   │  │Full        │
│Execute │  │Plan    │  │Pipeline    │
└───┬────┘  └───┬────┘  └─────┬──────┘
    │           │             │
    └─────┬─────┴─────────────┘
          │
          ▼
┌──────────────────────┐
│  3. Always Verify    │
│  (lu-verifier)    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  4. Learning         │
│     Capture          │
│  (lu-learner)     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  5. Commit & PR      │
│     (if on feature   │
│      branch)         │
└──────────────────────┘
```

## Step 0: Git Context Setup

Before cognitive pre-flight, establish git context for proper branch/commit tracking.

### 0.1 Detect Input Type

Parse the input to determine if it's a Jira ticket or PR reference:

```bash
# Check if input matches various patterns
INPUT="$1"
PR_MODE=false
PR_NUMBER=""
JIRA_TICKET=""

# Pattern 1: Full Jira URL
if [[ "$INPUT" =~ atlassian.net/browse/([A-Z]+-[0-9]+) ]]; then
  JIRA_TICKET="${BASH_REMATCH[1]}"

# Pattern 2: Ticket ID only (e.g., PT-1234)
elif [[ "$INPUT" =~ ^[A-Z]+-[0-9]+$ ]]; then
  JIRA_TICKET="$INPUT"

# Pattern 3: GitHub PR URL
elif [[ "$INPUT" =~ github.com/.*/pull/([0-9]+) ]]; then
  PR_NUMBER="${BASH_REMATCH[1]}"
  PR_MODE=true

# Pattern 4: PR number reference (e.g., "PR #123", "#123", "PR 123")
elif [[ "$INPUT" =~ ^[Pp][Rr][[:space:]]*#?([0-9]+)$ ]] || [[ "$INPUT" =~ ^#([0-9]+)$ ]]; then
  PR_NUMBER="${BASH_REMATCH[1]}"
  PR_MODE=true

# Pattern 5: PR-related keywords (e.g., "address PR comments", "review feedback")
elif [[ "$INPUT" =~ [Aa]ddress.*([Pp][Rr]|[Cc]omment|[Ff]eedback) ]] || \
     [[ "$INPUT" =~ [Rr]eview.*([Cc]omment|[Ff]eedback) ]] || \
     [[ "$INPUT" =~ [Pp][Rr].*[Cc]omment ]]; then
  # Check if current branch has an open PR
  PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null)
  if [ -n "$PR_NUMBER" ]; then
    PR_MODE=true
  fi

# Pattern 6: Plain task description
else
  JIRA_TICKET=""
fi
```

### 0.1.1 PR Mode Early Exit

If PR mode is detected, skip normal workflow and route to PR review:

```bash
if [ "$PR_MODE" = true ]; then
  # Fetch PR details
  if [ -z "$PR_NUMBER" ]; then
    PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null)
  fi

  if [ -z "$PR_NUMBER" ]; then
    echo "No PR found for current branch. Create a PR first: gh pr create"
    exit 1
  fi

  # Get PR info for display
  PR_TITLE=$(gh pr view "$PR_NUMBER" --json title -q '.title')
  PR_BRANCH=$(gh pr view "$PR_NUMBER" --json headRefName -q '.headRefName')

  # Count comments
  REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
  REVIEW_COMMENTS=$(gh api "/repos/${REPO}/pulls/${PR_NUMBER}/comments" --jq 'length' 2>/dev/null || echo "0")
  ISSUE_COMMENTS=$(gh api "/repos/${REPO}/issues/${PR_NUMBER}/comments" --jq '[.[] | select(.user.type != "Bot")] | length' 2>/dev/null || echo "0")

  # Display PR context and route to /lu-address-pr
  # See "Route: PR Review Mode" section below
fi
```

**PR Mode Display:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PR REVIEW MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PR: #[PR_NUMBER] - [PR_TITLE]
Comments: [REVIEW_COMMENTS] review, [ISSUE_COMMENTS] general
Branch: [PR_BRANCH]

Routing to /lu-address-pr...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Then invoke `/lu-address-pr` with the PR number and exit.**

The PR review workflow is handled entirely by `/lu-address-pr`:

1. Fetches all PR comments
2. Spawns reviewer agents to validate concerns
3. Plans fixes for valid concerns
4. Executes fixes with atomic commits
5. Responds to GitHub comments
6. Posts summary

**Note:** PR mode skips:

- Cognitive pre-flight (PR context is sufficient)
- Complexity classification (PR review has fixed workflow)
- Normal git context setup (PR already has branch context)

### 0.2 If Jira Ticket Detected

**Fetch ticket details using MCP tool:**

Use the Atlassian MCP server's `jira_get_issue` tool to fetch ticket details:

- Summary (becomes task description)
- Description (additional context)
- Issue type (Bug → fix, Story/Task → feat)
- Priority

**Check current branch:**

```bash
CURRENT_BRANCH=$(git branch --show-current)
BASE_BRANCH=""

# If on an ENG branch, use it as base
if [[ "$CURRENT_BRANCH" =~ ^ENG-[0-9]+ ]]; then
  BASE_BRANCH="$CURRENT_BRANCH"
# If on a PT branch, find its base
elif [[ "$CURRENT_BRANCH" =~ ^PT-[0-9]+ ]]; then
  # Already on a feature branch - extract context from STATE.md
  echo "Already on feature branch: $CURRENT_BRANCH"
# Otherwise, find the ENG branch
else
  # Look for ENG branches
  BASE_BRANCH=$(git branch -r | grep -oE 'origin/ENG-[0-9]+--[^ ]+' | head -1 | sed 's|origin/||')
fi
```

**Create GitHub issue (unless exists):**

```bash
# Check if issue already exists for this ticket
EXISTING_ISSUE=$(gh issue list --search "[$JIRA_TICKET]" --json number --jq '.[0].number' 2>/dev/null)

if [ -z "$EXISTING_ISSUE" ]; then
  # Map Jira type to GitHub label
  case "$JIRA_TYPE" in
    Bug) LABEL="bug" ;;
    Story|Task) LABEL="enhancement" ;;
    *) LABEL="task" ;;
  esac

  # Create issue
  ISSUE_NUMBER=$(gh issue create \
    --title "[$JIRA_TICKET] $SUMMARY" \
    --body "**Jira:** $JIRA_URL\n\n$DESCRIPTION" \
    --label "from-jira" \
    --label "$LABEL" \
    --json number --jq '.number')
else
  ISSUE_NUMBER="$EXISTING_ISSUE"
fi
```

**Create feature branch (unless --skip-branch or already on one):**

```bash
if [ -z "$SKIP_BRANCH" ] && [[ ! "$CURRENT_BRANCH" =~ ^PT- ]]; then
  # Generate branch name
  SLUG=$(echo "$SUMMARY" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | cut -c1-40)
  BRANCH_NAME="${JIRA_TICKET}--${SLUG}"

  # Ensure clean working directory
  if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Working directory not clean. Stash or commit changes first."
    exit 1
  fi

  # Create branch off base
  git checkout "$BASE_BRANCH"
  git pull origin "$BASE_BRANCH"
  git checkout -b "$BRANCH_NAME"
  git push -u origin "$BRANCH_NAME"
fi
```

**Update STATE.md with git context:**

```bash
# Update Git Context section in STATE.md
sed -i '' "s|Jira Ticket:.*|Jira Ticket: $JIRA_TICKET|" .planning/STATE.md
sed -i '' "s|GitHub Issue:.*|GitHub Issue: #$ISSUE_NUMBER|" .planning/STATE.md
sed -i '' "s|Branch:.*|Branch: $BRANCH_NAME|" .planning/STATE.md
sed -i '' "s|Base Branch:.*|Base Branch: $BASE_BRANCH|" .planning/STATE.md
```

### 0.3 If No Jira Ticket (Plain Task)

**Check current branch context:**

```bash
CURRENT_BRANCH=$(git branch --show-current)

# If on a PT branch, load context from STATE.md
if [[ "$CURRENT_BRANCH" =~ ^PT-[0-9]+ ]]; then
  # Context already set - continue
  echo "On feature branch: $CURRENT_BRANCH"
  # Skip to Step 1

# Otherwise, prompt for Jira ticket or placeholder
else
  # Trigger user prompt (see 0.3.1)
fi
```

### 0.3.1 Prompt for Jira Ticket

**ALWAYS prompt the user before proceeding without a Jira ticket:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► JIRA TICKET REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No Jira ticket was provided for this task.

1. **Provide Jira ticket** — Enter ticket ID (e.g., PT-1234)
2. **Use placeholder (PT-0000)** — For ad-hoc work without a Jira ticket

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**If user provides ticket:**

- Continue to 0.2 (fetch Jira details, create issue/branch)

**If user chooses placeholder (PT-0000):**

- Use `PT-0000` as the Jira ticket
- Skip GitHub issue creation (no Jira to link)
- Create branch as `PT-0000--[task-slug]` if not already on feature branch
- Update STATE.md with `Jira Ticket: PT-0000 (placeholder)`

### When to Use PT-0000

**PT-0000** is the standard placeholder for work without a Jira ticket:

- Quick fixes, typos, or minor improvements
- Tech debt identified during development
- GitHub Issues not originating from Jira
- Exploratory or experimental work
- Documentation updates
- Dependency updates

**Key principle:** If you don't have a Jira ticket number, use PT-0000. Don't create Jira tickets just to have a number.

### 0.4 Display Git Context

After setup, display the context:

**With Jira ticket:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► GIT CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Jira:   PT-1234 - Fix performance issue in questionnaires
Issue:  #456
Branch: PT-1234--fix-performance-issue
Base:   ENG-1353--release

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**With placeholder (PT-0000):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► GIT CONTEXT (Ad-hoc)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Jira:   PT-0000 (placeholder - no Jira ticket)
Issue:  None
Branch: PT-0000--fix-typo-in-readme
Base:   ENG-1353--release

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Step 1: Cognitive Pre-Flight

Before any work begins, run cognitive pre-flight:

### 1.1 Load Project Identity

```bash
# Check for BRAIN.md
cat .planning/BRAIN.md 2>/dev/null
```

If exists, extract:

- Project conventions
- Stack preferences
- Development philosophy

### 1.2 Selective Memory Recall

```bash
# Check for MEMORY.md
cat .planning/MEMORY.md 2>/dev/null
```

From the task description, extract keywords and search MEMORY.md for:

- **Relevant patterns**: Approaches that worked for similar tasks
- **Relevant decisions**: Past choices that may constrain this work
- **Relevant pitfalls**: Known issues to watch for

Limit recall to 3-5 most relevant entries to avoid context bloat.

### 1.3 Initialize Working Memory

Create or reset `.planning/WORKING.md`:

```markdown
# Working Memory

## Session Info

- **Started**: [timestamp]
- **Workflow**: /lu
- **Task**: [extracted from input]

## Memory Recall

- **Patterns**: [loaded patterns]
- **Decisions**: [recalled decisions]
- **Pitfalls**: [flagged pitfalls]

## Findings

<!-- Log discoveries here -->

## Candidates

<!-- Log learning candidates here -->
```

### 1.4 Generate Intuition Flags

Based on memory recall:

- **RISK**: If pitfalls or past failures match this task area
- **CAUTION**: If similar work had complications
- **OPPORTUNITY**: If strong patterns exist
- **UNKNOWN**: If no prior experience

## Step 2: Complexity Classification

Analyze the task and classify complexity:

### Classification Criteria

**TRIVIAL** (Direct execution):

- Single file modification
- Clear, unambiguous requirement
- No dependencies on other changes
- Low risk of side effects
- No RISK or UNKNOWN intuition flags

**MODERATE** (Quick plan + execute):

- 2-5 files modified
- Clear requirement with some choices
- Internal dependencies only
- Medium risk, reversible
- May have CAUTION flags

**COMPLEX** (Full pipeline):

- 5+ files OR architectural change
- Needs research or clarification
- External dependencies or integrations
- High risk or hard to reverse
- Has RISK or UNKNOWN flags

### Force Override

If `--force-complex` is passed, always route to COMPLEX regardless of analysis.

### Persist Classification

After classification, update STATE.md with the complexity:

```bash
# Update Task Complexity in STATE.md
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M")
# Replace the Task Complexity line with new classification
sed -i '' "s/Task Complexity:.*/Task Complexity: ${COMPLEXITY} (classified ${TIMESTAMP})/" .planning/STATE.md
```

This persists the classification for:

- Session continuity when resuming
- Learning validation (was classification accurate?)
- Pattern recognition over time

## Complexity Benefits Matrix

Every `/lu` task receives graduated benefits based on complexity:

| Benefit                  | TRIVIAL | MODERATE | COMPLEX |
| ------------------------ | :-----: | :------: | :-----: |
| STATE.md tracking        |    ✓    |    ✓     |    ✓    |
| EXISTS verification      |    ✓    |    ✓     |    ✓    |
| Learning capture         |    ✓    |    ✓     |    ✓    |
| Inline planning          |    —    |    ✓     |    —    |
| Plan approval gate       |    —    |    ✓     |    ✓    |
| Full PLAN.md files       |    —    |    —     |    ✓    |
| Research phase           |    —    |    —     |    ✓    |
| SUBSTANTIVE verification |    —    |    ✓     |    ✓    |
| WIRED verification       |    —    |    —     |    ✓    |
| Multiple plans/waves     |    —    |    —     |    ✓    |

**TRIVIAL:** Fast path for obvious changes. Track in STATE.md, execute directly, verify existence, capture learnings.

**MODERATE:** Balance of speed and safety. Plan inline, get user approval, execute, verify functionality.

**COMPLEX:** Full pipeline for architectural or high-risk changes. Research, plan in files, verify plans, execute with full verification.

## Step 3: Route to Handler

Based on classification (or PR mode), route appropriately:

### PR Review Mode Route (Special)

**Note:** This route is triggered in Step 0.1.1 when PR input is detected. It bypasses Steps 1-2 entirely.

```markdown
## Route: PR Review Mode

PR input detected. Routing to dedicated PR review workflow.

1. Skip cognitive pre-flight (PR context sufficient)
2. Skip complexity classification (PR review has fixed workflow)
3. Display PR context (number, title, comment counts)
4. Invoke /lu-address-pr with PR_NUMBER
5. Exit (workflow handled by lu-address-pr)
```

**When triggered:**

- User provides PR URL: `/lu https://github.com/.../pull/123`
- User provides PR number: `/lu PR #123` or `/lu #123`
- User mentions PR comments: `/lu address PR comments`

**Workflow handoff:**

The `/lu-address-pr` skill handles the full PR review workflow:

1. Fetch and categorize PR comments
2. Spawn reviewer agents (security, architecture, dx, etc.)
3. Validate each concern
4. Plan fixes for valid concerns
5. Execute fixes with atomic commits
6. Verify each fix
7. Post responses to GitHub

### TRIVIAL Route

````markdown
## Route: Direct Execution

**STATE.md Tracking:** Before execution, log to STATE.md "Trivial Tasks Completed" section.

```bash
# Get next trivial task number
TRIVIAL_NUM=$(grep -c '^|' .planning/STATE.md 2>/dev/null | awk 'NR==1{print $1}')
TRIVIAL_NUM=$((TRIVIAL_NUM > 0 ? TRIVIAL_NUM : 1))
TIMESTAMP=$(date +%Y-%m-%d)
```
````

Execute the task directly:

1. Log task start to STATE.md (Trivial Tasks section)
2. Make the change
3. Log to WORKING.md
4. Commit atomically
5. Update STATE.md with commit hash
6. Proceed to verification (EXISTS mode)

**After commit, update STATE.md:**

```bash
# Add row to Trivial Tasks Completed table
COMMIT_HASH=$(git rev-parse --short HEAD)
# Insert row after table header in STATE.md
```

```markdown
| ${TRIVIAL_NUM} | ${TASK_DESCRIPTION} | ${TIMESTAMP} | ${COMMIT_HASH} | TRIVIAL |
```

### MODERATE Route

For moderate tasks, use quick planning with approval gate before execution.

**MANDATORY**: You MUST spawn sub-agents for execution. Do NOT attempt to execute complex changes yourself.

**Approval Gate:** After planner returns, present plan for user approval (unless yolo mode).

```bash
# Check mode setting
MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"mode"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "interactive")
```

**Step 1: Spawn planner**

```python
# Spawn planner in quick mode
Task(
  prompt="""
<planning_request>

**Task:** {task_description}
**Complexity:** MODERATE
**Mode:** quick

**Project State:**
{state_content}

</planning_request>

Create a quick inline plan with 2-3 focused tasks.
Each task should have: action, files, verification.
Target ~30% context usage (simple, focused).
""",
  subagent_type="lu-planner",
  model="{planner_model}",
  description="Quick plan for moderate task"
)
```

**Step 2: Present plan for approval (skip in yolo mode)**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► MODERATE TASK PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Task: {task_description}
Complexity: MODERATE

## Proposed Plan

{plan_content formatted as table}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

```python
if MODE != "yolo":
  AskQuestion(
    title="Moderate Task Plan Approval",
    questions=[{
      id: "approval",
      prompt: "Review the proposed plan. How would you like to proceed?",
      options: [
        {id: "approve", label: "Approve — Execute this plan"},
        {id: "modify", label: "Modify — Provide feedback for revision"},
        {id: "escalate", label: "Escalate — Route to COMPLEX workflow"}
      ]
    }]
  )

  # Handle response
  if response.approval == "modify":
    # Re-spawn planner with user feedback
    # Return to Step 1
  elif response.approval == "escalate":
    # Route to COMPLEX workflow instead
    # Jump to COMPLEX Route section
  # else: proceed to Step 3
```

**Step 3: Spawn executor (after approval or in yolo mode)**

```python
# After planning and approval, spawn executor
Task(
  prompt="""
<execution_request>

**Quick Plan:**
{plan_content}

**Project State:**
{state_content}

</execution_request>

Execute all tasks in the quick plan.
Commit each task atomically.
Log progress to WORKING.md.
""",
  subagent_type="lu-executor",
  model="{executor_model}",
  description="Execute moderate task"
)
```

**After execution, proceed to verification (Step 4).**

### COMPLEX Route

For complex tasks, delegate to the full planning pipeline commands.

**MANDATORY**: Route to `/lu-plan-phase` and `/lu-execute-phase`. Do NOT spawn inline planner/executor.

**Step 1: Inform user and prepare context**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► COMPLEX TASK DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Task: {task_description}
Complexity: COMPLEX
Reason: {complexity_rationale}

This task requires the full planning pipeline.

Benefits you'll receive:
- Research phase (if enabled)
- PLAN.md files with wave assignments
- Plan-checker verification (approval gate)
- VERIFICATION.md artifacts
- Multiple plans/waves support

▶ Routing to /lu-plan-phase...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Step 2: Invoke /lu-plan-phase**

Read the lu-plan-phase skill and execute it with the task context:

```bash
# Pass task description and context to plan-phase
@.cursor/skills/lu-plan-phase/SKILL.md

# Plan-phase creates PLAN.md files in .planning/phases/
# Plan-checker provides the approval gate
```

**Step 3: After planning complete, invoke /lu-execute-phase**

```bash
# Execute the plans created by plan-phase
@.cursor/skills/lu-execute-phase/SKILL.md

# Execute-phase handles:
# - Wave-based execution
# - SUMMARY.md creation
# - Verification with VERIFICATION.md
```

**Benefits of delegation:**

- Full research phase (if enabled in config)
- Plan-checker verification (built-in approval gate)
- VERIFICATION.md artifacts for audit trail
- Multiple plans/waves support for complex work
- Consistent artifacts in .planning/phases/

**Do NOT spawn inline planner/executor for COMPLEX tasks.**

## Step 4: Always Verify

**Verification runs regardless of complexity level.**

| Complexity | Verification Mode                      |
| ---------- | -------------------------------------- |
| TRIVIAL    | Quick (existence + basic check)        |
| MODERATE   | Standard (functionality + integration) |
| COMPLEX    | Full (goal-backward + key links)       |

After execution completes:

### 4.1 Spawn lu-verifier

**MANDATORY**: You MUST spawn a sub-agent using the Task tool. Do NOT attempt to verify yourself.

First, read the required context:

```bash
WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "No working memory")
STATE_CONTENT=$(cat .planning/STATE.md 2>/dev/null || echo "No state file")
TASK_DESCRIPTION="[extracted from user input]"
```

Then spawn the verifier:

```python
Task(
  prompt="""
<verification_context>

**Task:** {task_description}
**Complexity:** {COMPLEXITY}
**Mode:** {quick | standard | full}

**Working Memory:**
{working_content}

**Project State:**
{state_content}

**Changes Made:**
{summary of execution - files modified, commits made}

</verification_context>

<verification_levels>
- EXISTS: Do the expected files/changes exist?
- SUBSTANTIVE: Is the implementation correct and complete?
- WIRED: Is everything properly integrated?
</verification_levels>

Verify the task goal was achieved. Return verification status and any issues found.
""",
  subagent_type="lu-verifier",
  model="{verifier_model}",
  description="Verify task completion"
)
```

**Do NOT proceed until the Task returns.**

### 4.2 Handle Verification Result

Based on verifier return:

- **PASSED**: Continue to learning capture
- **FAILED**: Report issues, offer to fix or abort
- **PARTIAL**: Present gaps, offer to address

## Step 5: Learning Capture

After verification (pass or fail):

### 5.1 Spawn lu-learner

**MANDATORY**: You MUST spawn a sub-agent using the Task tool. Do NOT attempt to capture learnings yourself.

First, read the required context:

```bash
WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "No working memory")
MEMORY_CONTENT=$(cat .planning/MEMORY.md 2>/dev/null || echo "No memory file")
VERIFICATION_RESULT="[from Step 4 verifier return]"
```

Then spawn the learner:

```python
Task(
  prompt="""
<learning_context>

**Verification Result:** {verification_result}

**Working Memory (session findings):**
{working_content}

**Current Long-Term Memory:**
{memory_content}

</learning_context>

<extraction_targets>
1. **Patterns**: What approaches worked well? (code patterns, testing strategies)
2. **Decisions**: What architectural choices were made? What trade-offs?
3. **Pitfalls**: What issues were encountered? What should be avoided?
4. **Preferences**: What conventions emerged? What feedback was given?
</extraction_targets>

<output_requirements>
- Extract ONLY validated learnings (not hypotheses)
- Write curated insights to MEMORY.md
- Clear WORKING.md after extraction
- Return summary of learnings captured
</output_requirements>

Extract learnings from this session and update MEMORY.md.
""",
  subagent_type="lu-learner",
  model="{learner_model}",
  description="Capture session learnings"
)
```

**Do NOT proceed until the Task returns.**

### 5.2 Confirm Learning Capture

After learner returns:

- Verify MEMORY.md was updated (if learnings found)
- Verify WORKING.md was cleared
- Log learning summary to output

## Step 6: Commit & PR

After verification passes, if on a feature branch:

### 5.1 Commit Changes

```bash
# Get git context from STATE.md
JIRA_TICKET=$(grep "Jira Ticket:" .planning/STATE.md | sed 's/.*: //')
ISSUE_NUMBER=$(grep "GitHub Issue:" .planning/STATE.md | sed 's/.*#//')

# Stage all files and commit
git add .
bun run commit --message="$TASK_SUMMARY" --type=$COMMIT_TYPE --scope=apps --no-push --skip-checks
```

### 5.2 Offer PR Creation

If work is complete and branch has commits ahead of base:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► READY FOR PR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Branch: PT-1234--fix-performance-issue
Base:   ENG-1353--release
Commits: 3 ahead

Create PR now?
1. Yes - create PR and post QA plan
2. No - I have more work to do
```

**If yes:**

```bash
BASE_BRANCH=$(grep "Base Branch:" .planning/STATE.md | sed 's/.*: //')
JIRA_TICKET=$(grep "Jira Ticket:" .planning/STATE.md | sed 's/.*: //')

gh pr create \
  --base "$BASE_BRANCH" \
  --title "$COMMIT_TYPE(apps): $JIRA_TICKET $TASK_SUMMARY" \
  --body "## Summary
- [description of changes]

## Test Plan
- [ ] Test case 1
- [ ] Test case 2

---
Part of $JIRA_TICKET
Generated with Claude Code"
```

## Flags

### `--force-complex`

Force routing to full pipeline regardless of classification analysis. Use when:

- Task seems simple but has hidden complexity
- User wants full planning documentation
- High-stakes change that needs thorough review

### `--skip-memory`

Skip memory recall and operate without cognitive context. Use when:

- MEMORY.md is corrupted
- Testing framework without memory influence
- Fresh-start scenario

### `--skip-branch`

Skip feature branch creation even if Jira ticket is provided. Use when:

- Already on the correct feature branch
- Want to work directly on current branch
- Testing or exploratory work

## Output Format

After completing the full workflow:

```markdown
## /lu COMPLETE

### Git Context

- **Jira:** {PT-#### or None}
- **Issue:** {#123 or None}
- **Branch:** {branch-name}
- **PR:** {#456 or "Ready to create" or "N/A"}

### Task

{Original task description}

### Classification

{TRIVIAL|MODERATE|COMPLEX} - {rationale}

### Execution

{Summary of what was done}

### Verification

{Verification result}

### Learnings Captured

- Patterns: {N} new
- Decisions: {N} documented
- Pitfalls: {N} recorded

### Next

{Suggested follow-up if any}
```

## Related Commands

- `/lu-new-project` - Initialize a new Luca project
- `/lu-plan-phase` - Full phase planning (called for COMPLEX tasks)
- `/lu-execute-phase` - Full phase execution (called for COMPLEX tasks)
- `/lu-address-pr` - Address PR review comments with agent swarm (called for PR mode)
- `/lu-debug` - Debugging workflow with memory-aided investigation
- `/lu-help` - List all available commands

## Next Steps

| Condition                 | Action             | Command                        |
| ------------------------- | ------------------ | ------------------------------ |
| Task was TRIVIAL          | Check status       | `/lu-progress`              |
| Task was MODERATE/COMPLEX | Continue execution | `/lu-execute-phase {phase}` |
| Need to pause work        | Create handoff     | `/lu-pause-work`            |
| PR ready for review       | Create PR          | Run `gh pr create`             |

**Primary:** `/lu-progress` — See current state and smart routing

**Also available:**

- `/lu-execute-phase {phase}` — Continue executing current phase
- `/lu-help` — See all available commands
