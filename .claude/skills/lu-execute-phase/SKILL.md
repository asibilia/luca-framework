# lu-execute-phase

Execute all plans in a Luca phase with wave-based parallelization. Use when user wants to execute a phase, run plans, or asks about /lu-execute-phase.

## main

# Luca Execute Phase

Execute all plans in a phase using wave-based parallel execution, then verify with code review and UAT.

Orchestrator stays lean: discover plans, analyze dependencies, group into waves, spawn subagents, collect results. Each subagent loads the full execute-plan context and handles its own plan.

**Arguments:** `<phase-number> [--gaps-only] [--quality-fixes] [--skip-review] [--skip-uat] [--skip-memory]`

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- `lu-executor` - Executes individual plans (PARALLEL per wave)
- `lu-verifier` - Verifies phase goal achieved
- `lu-learner` - Extracts learnings after verification
- `dx-advocate` - Code quality review
- `code-simplifier` - DRY and complexity review
- `code-architect` - Architecture review
- `tailwind-auditor` - Tailwind/styling review
- `security-auditor` - Security review (conditional)
- `lu-planner` - Plans fixes for issues (if needed)
- `lu-plan-checker` - Validates fix plans (if needed)

**DO NOT** attempt to execute plans, verify, or review code yourself. Spawn the appropriate agents.

**Reference:** See `.cursor/luca/references/task-directive.md` for Task() syntax patterns.

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

```bash
WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "No working memory")
MEMORY_CONTENT=$(cat .planning/MEMORY.md 2>/dev/null || echo "No memory file")
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
```

**Do NOT proceed until the Task returns.**

### WORKING.md During Execution

Throughout execution, log to WORKING.md:

```bash
# Log execution progress
echo "- $(date -u +%H:%M) [Plan X complete - finding Y]" >> .planning/WORKING.md
```

Track:

- Execution findings and observations
- Issues encountered and how resolved
- Patterns that worked well (learning candidates)
- Decisions made during implementation

## Process

### 0. Resolve Model Profile

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

**Model lookup table:**

| Agent              | quality | balanced | budget |
| ------------------ | ------- | -------- | ------ |
| lu-executor     | opus    | sonnet   | sonnet |
| lu-verifier     | sonnet  | sonnet   | haiku  |
| dx-advocate        | opus    | sonnet   | haiku  |
| code-simplifier    | opus    | sonnet   | haiku  |
| code-architect     | opus    | sonnet   | haiku  |
| tailwind-auditor   | opus    | sonnet   | haiku  |
| security-auditor   | opus    | sonnet   | haiku  |
| lu-planner      | opus    | opus     | sonnet |
| lu-plan-checker | sonnet  | sonnet   | haiku  |

> **Current Limitation:** Cursor's Task tool only supports `model="fast"` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

```
# Lightweight agents → use "fast"
learner_model = "fast"

# Reasoning-intensive agents → omit (inherit from parent)
executor_model = (omit)
verifier_model = (omit)
planner_model = (omit)
checker_model = (omit)
reviewer_model = (omit)  # dx-advocate, code-simplifier, etc.
```

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
3. **Abort** — Stop and run /lu-new-milestone to set up properly
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

1. Exit with message to run `/lu-new-milestone` or manually create issue

### 1. Validate Phase Exists

- Find phase directory matching argument
- Count PLAN.md files
- Error if no plans found

### 2. Discover Plans

- List all *-PLAN.md files in phase directory
- Check which have *-SUMMARY.md (already complete)
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
- Proceed to next wave

**MANDATORY**: You MUST spawn lu-executor sub-agents for each plan. Do NOT attempt to execute plans yourself.

First, read plan contents (required because @ syntax doesn't work across Task boundaries):

```bash
PLAN_01_CONTENT=$(cat "{plan_01_path}")
PLAN_02_CONTENT=$(cat "{plan_02_path}")
PLAN_03_CONTENT=$(cat "{plan_03_path}")
STATE_CONTENT=$(cat .planning/STATE.md)
WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "")
```

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

<execution_rules>
- Execute each task in the plan sequentially
- Commit atomically after each task (git add . && bun run commit)
- Create SUMMARY.md when complete
- Log findings to WORKING.md
- Handle deviations per deviation rules
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

<execution_rules>
- Execute each task in the plan sequentially
- Commit atomically after each task (git add . && bun run commit)
- Create SUMMARY.md when complete
- Log findings to WORKING.md
- Handle deviations per deviation rules
</execution_rules>

Execute this plan. Return SUMMARY when complete.
""",
  subagent_type="lu-executor",
  model="{executor_model}",
  description="Execute {plan_02_name}"
)
```

**Do NOT proceed to next wave until all Task calls return.**

### 5. Aggregate Results

- Collect summaries from all plans
- Report phase completion status

### 6. Commit Orchestrator Corrections

```bash
git status --porcelain
```

If changes exist:

```bash
git add .
bun run commit --message="orchestrator corrections" --type=fix --scope={phase} --no-push --skip-checks
```

### 7. Verify Phase Goal

**MANDATORY**: You MUST spawn a lu-verifier sub-agent. Do NOT attempt to verify yourself.

First, read the required context:

```bash
PHASE_DIR=".planning/phases/{phase_number}-*"
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
STATE_CONTENT=$(cat .planning/STATE.md)
WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "")
SUMMARIES=$(find $PHASE_DIR -name "*-SUMMARY.md" -exec cat {} ;)
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

**Project State:**
{state_content}

**Working Memory:**
{working_content}

</verification_context>

<verification_levels>
1. EXISTS: Do deliverables exist in codebase?
2. SUBSTANTIVE: Do they work correctly?
3. WIRED: Are they properly integrated?
</verification_levels>

<output_requirements>
- Create VERIFICATION.md in phase directory
- Return status: passed | human_needed | gaps_found
- List any gaps or issues found
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

- `passed` → continue to code review
- `human_needed` → present items, get approval, then continue
- `gaps_found` → offer `/lu-plan-phase {X} --gaps` (skip remaining steps)

### 7.5. Code Quality Review

**Skip if:** `--skip-review` flag passed OR `workflow.code_review: false` in config.

Get changed files for this phase:

```bash
# Get TypeScript/TSX files changed in this branch vs main
CHANGED_FILES=$(git diff --name-only main...HEAD -- '*.ts' '*.tsx' 2>/dev/null | head -50)
FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c '.' || echo "0")
```

**If no changed files:** Skip to step 8.

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► CODE QUALITY REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Reviewing {FILE_COUNT} changed files...
```

**Determine which reviewers to spawn:**

Always spawn:

- `dx-advocate` — conventions, coding standards, Lodash vs native, snake_case keys
- `code-simplifier` — DRY violations, duplicated code, complexity
- `code-architect` — architecture, structure, patterns, module boundaries
- `tailwind-auditor` — dynamic color system, Tailwind patterns, shadcn anti-patterns

Conditionally spawn `security-auditor` if files match patterns:

```bash
echo "$CHANGED_FILES" | grep -E '(auth|api|convex|mutation|query|middleware|proxy)' && NEEDS_SECURITY=true
```

**MANDATORY**: Spawn ALL applicable reviewers in a SINGLE message with multiple Task calls (PARALLEL).

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

### 7.6. Handle Code Review Results

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
- Present ready status for `/lu-execute-phase {phase} --quality-fixes`
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

**If clean (or LOW only):** Continue to step 8.

### 8. Update Roadmap and State

Update ROADMAP.md, STATE.md

### 9. Update Requirements

Mark phase requirements as Complete in REQUIREMENTS.md traceability table.

### 10. Commit Phase Completion

```bash
git add .
bun run commit --message="complete {phase-name} phase" --type=docs --scope={phase} --no-push --skip-checks
````

### 11. User Acceptance Testing (UAT)

**Skip if:** `--skip-uat` flag passed OR `workflow.uat_required: false` in config.

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

### 12. Handle UAT Results

**Route A: All tests pass, more phases remain**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} VERIFIED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N}/{N} UAT tests passed ✓
Code review passed ✓

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

/lu-discuss-phase {Z+1} — gather context and clarify approach
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

/lu-audit-milestone
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
- Spawn lu-planner in --gaps mode to create fix plans
- Spawn lu-plan-checker to verify fix plans
- Present ready status:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► FIXES READY ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} gap(s) diagnosed, {M} fix plan(s) created

## ▶ Next Up

/clear then /lu-execute-phase {Z} --gaps-only
```

**Route D: Verifier gaps found (before UAT)**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} GAPS FOUND ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Score: {N}/{M} must-haves verified

## ▶ Next Up

/lu-plan-phase {Z} --gaps
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

| Condition                      | Action                | Command                                    |
| ------------------------------ | --------------------- | ------------------------------------------ |
| UAT passed, more phases        | Discuss next phase    | `/lu-discuss-phase {N+1}`               |
| UAT passed, milestone complete | Audit milestone       | `/lu-audit-milestone`                   |
| UAT gaps found                 | Execute gap fixes     | `/lu-execute-phase {N} --gaps-only`     |
| Code review critical issues    | Execute quality fixes | `/lu-execute-phase {N} --quality-fixes` |
| Verifier gaps found            | Plan gap closure      | `/lu-plan-phase {N} --gaps`             |

**Primary:** `/lu-progress` — Check status and get smart routing

**Also available:**

- `/lu-verify-work {phase}` — Run UAT separately
- `/lu-pause-work` — Create handoff if stopping mid-work