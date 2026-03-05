# pr-address

Address PR review comments by swarming reviewer agents, validating concerns, and applying fixes.

## main

<main>
# Luca Address PR

Address pull request review comments through a coordinated agent swarm that validates concerns, plans fixes, executes changes, verifies updates, and responds to GitHub comments.

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- `security-auditor` - Validates security-related concerns
- `code-architect` - Validates architecture/design concerns
- `performance-auditor` - Validates performance concerns
- `dx-advocate` - Validates code quality concerns
- `ux` - Validates accessibility concerns
- `lu-pr-reviewer` - Validates general feedback
- `lu-planner` - Creates fix plans for valid concerns
- `lu-executor` - Implements fixes
- `lu-verifier` - Verifies fixes address concerns

**DO NOT** validate concerns, plan fixes, or execute fixes yourself. Spawn the appropriate agents.

**Reference:** See `.cursor/luca/references/task-directive.md` for Task() syntax patterns.

### Model Resolution

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

| Agent           | quality | balanced | budget |
| --------------- | ------- | -------- | ------ |
| reviewers (all) | opus    | sonnet   | haiku  |
| lu-planner   | opus    | opus     | sonnet |
| lu-executor  | opus    | sonnet   | sonnet |
| lu-verifier  | sonnet  | sonnet   | haiku  |

> **Current Limitation:** Cursor's Task tool only supports `model="fast"` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

```
# All PR review agents require reasoning → omit (inherit from parent)
reviewer_model = (omit)
planner_model = (omit)
executor_model = (omit)
verifier_model = (omit)
```

## Overview

This skill orchestrates a multi-agent workflow to systematically address PR feedback:

1. **Fetch** - Get PR comments from GitHub
2. **Triage** - Route comments to appropriate reviewer agents
3. **Validate** - Determine if concerns are legitimate
4. **Plan** - Create fix plan for valid concerns
5. **Execute** - Implement fixes with atomic commits
6. **Verify** - Confirm fixes address the concerns
7. **Respond** - Post responses to PR comments

## Process

### Step 0: Resolve PR Context

```bash
# If PR URL/number provided, use it
# Otherwise, detect from current branch
PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null)
PR_URL=$(gh pr view --json url -q '.url' 2>/dev/null)

if [ -z "$PR_NUMBER" ]; then
  echo "No PR found for current branch."
  echo "Either provide a PR URL/number or ensure you're on a branch with an open PR."
  exit 1
fi
```

If user provides PR URL or number, parse and use that instead.

### Step 1: Fetch PR Comments

Fetch all comment types from the PR:

```bash
# Get repository info
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')

# Fetch PR review comments (inline code comments)
gh api "/repos/${REPO}/pulls/${PR_NUMBER}/comments" > /tmp/pr_review_comments.json

# Fetch PR issue comments (general PR discussion)
gh api "/repos/${REPO}/issues/${PR_NUMBER}/comments" > /tmp/pr_issue_comments.json

# Fetch PR reviews with their comments
gh api "/repos/${REPO}/pulls/${PR_NUMBER}/reviews" > /tmp/pr_reviews.json
```

Parse and consolidate comments:

```bash
# Extract actionable comments (excluding bot comments, resolved threads)
# Filter for comments that need addressing:
# - Not from the PR author
# - Not marked as resolved
# - Contains actionable feedback (not just "LGTM")
```

### Step 2: Categorize Comments

For each comment, categorize by concern type:

| Category      | Signals                                                      | Route To             |
| ------------- | ------------------------------------------------------------ | -------------------- |
| Security      | "vulnerability", "injection", "auth", "XSS", "CSRF"          | security-auditor     |
| Architecture  | "design", "pattern", "structure", "coupling", "abstraction"  | architect            |
| Performance   | "performance", "slow", "optimize", "memory", "N+1"           | performance-auditor  |
| Code Quality  | "naming", "duplication", "readability", "convention"         | dx-advocate          |
| Accessibility | "a11y", "accessibility", "ARIA", "keyboard", "screen reader" | accessibility-expert |
| Testing       | "test", "coverage", "mock", "assertion"                      | test-engineer        |
| General       | (default)                                                    | lu-pr-reviewer    |

### Step 3: Spawn Reviewer Agents (Parallel)

**MANDATORY**: You MUST spawn reviewer agents in PARALLEL to validate concerns. Do NOT validate concerns yourself.

First, read the code context for each comment:

```bash
# Get PR diff for context
PR_DIFF=$(gh pr diff ${PR_NUMBER})
```

Then spawn ALL applicable reviewers in PARALLEL (same message, multiple Task calls):

````python
# Security Auditor - for security-tagged comments
Task(
  prompt="""
<validation_context>

**PR:** #{pr_number}
**Comment ID:** {comment_id}
**Comment Text:** {comment_text}
**File:** {file_path}
**Line:** {line_number}

**Code Context:**
{surrounding_code}

**PR Diff:**
{pr_diff_for_file}

</validation_context>

<validation_task>
Evaluate if this security concern is valid. Consider:
1. Is there actually a vulnerability?
2. How severe is it if real?
3. What's the fix if needed?
4. If invalid, why?
</validation_task>

<output_format>
Return YAML:
```yaml
comment_id: '{comment_id}'
valid: true | false
reasoning: "Explanation"
severity: critical | high | medium | low | info
fix_needed: true | false
suggested_fix: "How to address (if needed)"
disagree_response: "Response if we disagree (if valid: false)"
````

</output_format>

Validate this security concern.
""",
subagent_type="security-auditor",
model="{reviewer_model}",
description="Validate security concern"
)

# Code Architect - for architecture-tagged comments

Task(
prompt="""
<validation_context>

**PR:** #{pr_number}
**Comment ID:** {comment_id}
**Comment Text:** {comment_text}
**File:** {file_path}
**Line:** {line_number}

**Code Context:**
{surrounding_code}

**PR Diff:**
{pr_diff_for_file}

</validation_context>

<validation_task>
Evaluate if this architecture/design concern is valid. Consider:

1. Is this a real design issue?
2. What's the impact if not addressed?
3. What's the fix if needed?
4. If invalid, why?
   </validation_task>

<output_format>
Return YAML:

```yaml
comment_id: '{comment_id}'
valid: true | false
reasoning: 'Explanation'
severity: critical | high | medium | low | info
fix_needed: true | false
suggested_fix: 'How to address (if needed)'
disagree_response: 'Response if we disagree (if valid: false)'
```

</output_format>

Validate this architecture concern.
""",
subagent_type="code-architect",
model="{reviewer_model}",
description="Validate architecture concern"
)

# DX Advocate - for code quality comments

Task(
prompt="""
<validation_context>

**PR:** #{pr_number}
**Comment ID:** {comment_id}
**Comment Text:** {comment_text}
**File:** {file_path}
**Line:** {line_number}

**Code Context:**
{surrounding_code}

**PR Diff:**
{pr_diff_for_file}

</validation_context>

<validation_task>
Evaluate if this code quality concern is valid. Consider:

1. Does this violate conventions or standards?
2. What's the impact on maintainability?
3. What's the fix if needed?
4. If invalid, why?
   </validation_task>

<output_format>
Return YAML:

```yaml
comment_id: '{comment_id}'
valid: true | false
reasoning: 'Explanation'
severity: critical | high | medium | low | info
fix_needed: true | false
suggested_fix: 'How to address (if needed)'
disagree_response: 'Response if we disagree (if valid: false)'
```

</output_format>

Validate this code quality concern.
""",
subagent_type="dx-advocate",
model="{reviewer_model}",
description="Validate code quality concern"
)

# Add more reviewers for each category as needed (performance-auditor, ux, etc.)

````

**Do NOT proceed until ALL reviewer Tasks return.**

**Validation Output Schema (each agent returns):**

```yaml
comment_id: '123456'
valid: true | false
reasoning: "Explanation of why this is/isn't a valid concern"
severity: critical | high | medium | low | info
fix_needed: true | false
suggested_fix: 'Brief description of how to address'
disagree_response: 'Response if we disagree (only if valid: false)'
````

### Step 4: Aggregate Validation Results

Collect results from all reviewer agents:

```markdown
## Validation Summary

### Valid Concerns (Fix Needed)

| #   | Comment                 | Category     | Severity | Suggested Fix  |
| --- | ----------------------- | ------------ | -------- | -------------- |
| 1   | "Missing null check..." | Code Quality | high     | Add validation |

### Disputed Concerns (Will Respond)

| #   | Comment               | Category     | Reasoning                                  |
| --- | --------------------- | ------------ | ------------------------------------------ |
| 2   | "Should use Redux..." | Architecture | Current approach is appropriate because... |

### Informational (No Action)

| #   | Comment      | Category | Note                |
| --- | ------------ | -------- | ------------------- |
| 3   | "Nice work!" | General  | Acknowledgment only |
```

### Step 4.5: Split Verdict Debate (Conditional)

**Gate check:** Skip this step if no split verdicts are detected (all comments have a clear majority). This step adds ~30-40k tokens per split verdict.

After aggregating validator results from Step 4, check for split verdicts — comments where validators produced a tie (e.g., 3-3) or narrow majority (e.g., 3-2). Use the `detectVerdictSplits()` helper from `src/skills/__helpers/pr-verdict-debate.ts` to identify splits.

For each comment where validators produced a split verdict:

**Step 4.5.1: Dissenter Argument**

Spawn a sub-agent using the dissenting validator type to articulate the strongest dissent. Use the `buildDissenterPrompt()` helper to generate the prompt:

```python
Task(
  prompt="""{dissenter_prompt_from_buildDissenterPrompt}""",
  subagent_type="{dissenting_agent_type}",
  description="Dissent: comment #{comment_id}"
)
```

**Step 4.5.2: Majority Response**

After the dissenter returns, spawn a sub-agent using the majority validator type to respond. Use the `buildMajorityResponsePrompt()` helper:

```python
Task(
  prompt="""{majority_response_prompt_from_buildMajorityResponsePrompt}""",
  subagent_type="{majority_agent_type}",
  description="Respond: comment #{comment_id}"
)
```

**Step 4.5.3: Present Both Perspectives**

Use `buildSplitVerdictResult()` and `formatSplitVerdictForPR()` to build and display the result:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca >>> SPLIT VERDICT: Comment #{comment_id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Split: {split_ratio}
Majority: {position} ({count} validators)
Dissent: {position} ({count} validators)

Recommendation: {fix | disagree | defer_to_human}
Confidence: {confidence}

Both Perspectives: {both_perspectives_summary}
```

Update the "Disputed Concerns" table from Step 4 to include split verdict debate information when it ran. For split verdicts resolved as "defer_to_human", these will be surfaced in Step 9's summary.

### Step 5: Create Fix Plan

**MANDATORY**: You MUST spawn a lu-planner sub-agent to create fix plans. Do NOT plan fixes yourself.

First, gather the validated concerns:

```bash
# Collect valid concerns from Step 4 results
VALID_CONCERNS="[aggregated from reviewer agent results where fix_needed: true]"
```

Then spawn the planner:

```python
Task(
  prompt="""
<planning_context>

**PR:** #{pr_number}
**Mode:** pr_fixes

**Valid Concerns to Address:**
{valid_concerns}

**Files Affected:**
{affected_files_list}

**PR Context:**
{pr_diff}

</planning_context>

<constraints>
- Must not break existing functionality
- Each fix should be atomic and committable
- Reference comment IDs in tasks
</constraints>

<output_requirements>
Create inline plan with:
1. Task per concern (or grouped if related)
2. Verification criteria per task
3. Success criteria tied to original comment ID
4. Commit message format: fix(pr-#{pr_number}): address review comment #{comment_id}
</output_requirements>

Create fix plan for these PR review concerns.
""",
  subagent_type="lu-planner",
  model="{planner_model}",
  description="Plan PR fixes"
)
```

**Do NOT proceed until the Task returns.**

### Step 6: Execute Fixes

**MANDATORY**: You MUST spawn a lu-executor sub-agent to implement fixes. Do NOT execute fixes yourself.

First, read the plan from Step 5:

```bash
FIX_PLAN="[plan content from Step 5]"
```

Then spawn the executor:

```python
Task(
  prompt="""
<execution_context>

**PR:** #{pr_number}
**Mode:** pr_fixes

**Fix Plan:**
{fix_plan}

**PR Context:**
{pr_diff}

</execution_context>

<commit_format>
For each fix, commit with:
fix(pr-#{pr_number}): address review comment #{comment_id}

- [description of fix]
- Addresses: [link to comment]
</commit_format>

<tracking_requirements>
Track for each fix:
- Commit hash
- Files modified
- Comment ID addressed
Return this tracking info in result.
</tracking_requirements>

Execute all fixes in the plan. Commit each atomically.
""",
  subagent_type="lu-executor",
  model="{executor_model}",
  description="Execute PR fixes"
)
```

**Do NOT proceed until the Task returns.**

### Step 7: Verify Fixes

**MANDATORY**: You MUST spawn a lu-verifier sub-agent to verify fixes. Do NOT verify fixes yourself.

First, gather execution results:

```bash
EXECUTION_RESULT="[result from Step 6 with commit hashes and files]"
ORIGINAL_CONCERNS="[valid concerns from Step 4]"
```

Then spawn the verifier:

```python
Task(
  prompt="""
<verification_context>

**PR:** #{pr_number}
**Mode:** pr_fixes

**Execution Result:**
{execution_result}

**Original Concerns:**
{original_concerns}

</verification_context>

<verification_checklist>
For each fix:
1. Does the change address the original concern?
2. Are there any regressions introduced?
3. Do tests pass? (run if applicable)
4. Does lint pass? (run if applicable)
</verification_checklist>

<output_requirements>
For each fix, return:
- comment_id: which comment was addressed
- fix_verified: true | false
- issues: any problems found
- ready_to_respond: true | false
</output_requirements>

Verify all PR fixes address their original concerns.
""",
  subagent_type="lu-verifier",
  model="{verifier_model}",
  description="Verify PR fixes"
)
```

**Do NOT proceed until the Task returns.**

### Step 8: Respond to PR Comments

For each addressed comment:

```bash
# For fixes implemented
gh pr comment ${PR_NUMBER} --body "$(cat <<'EOF'
**Addressed in ${COMMIT_HASH}**

${FIX_DESCRIPTION}

Changes:
- ${CHANGE_1}
- ${CHANGE_2}
EOF
)"

# Reply to specific review comment
gh api -X POST "/repos/${REPO}/pulls/${PR_NUMBER}/comments/${COMMENT_ID}/replies"   -f body="Fixed in ${COMMIT_HASH}. ${EXPLANATION}"
```

For disputed concerns:

```bash
gh api -X POST "/repos/${REPO}/pulls/${PR_NUMBER}/comments/${COMMENT_ID}/replies"   -f body="${DISAGREE_RESPONSE}"
```

### Step 9: Push and Summary

```bash
# Push all fixes
git push

# Post summary comment on PR
gh pr comment ${PR_NUMBER} --body "$(cat <<'EOF'
## PR Feedback Addressed

### Fixes Implemented
| Concern | Fix | Commit |
|---------|-----|--------|
| ${CONCERN_1} | ${FIX_1} | ${HASH_1} |

### Responses Posted
| Comment | Response |
|---------|----------|
| ${COMMENT_2} | Respectfully disagree because... |

### Contested Comments (Human Review Requested)

If any split verdicts from Step 4.5 were resolved as "defer_to_human", include them here:

| Comment | Split | Majority | Dissent | Recommendation |
|---------|-------|----------|---------|----------------|
| #{id}   | 3-3   | Valid    | Invalid | Defer to human |

(Omit this section if no split verdicts were deferred to human.)

### No Action Needed
- ${INFO_COMMENT_1}

---
*Addressed via Luca `/pr-address`*
EOF
)"
```

## Input Modes

| Input     | Example                                             | Behavior                      |
| --------- | --------------------------------------------------- | ----------------------------- |
| No input  | `/pr-address`                                 | Detect PR from current branch |
| PR number | `/pr-address 123`                             | Use specified PR number       |
| PR URL    | `/pr-address https://github.com/.../pull/123` | Parse PR from URL             |

## Flags

- `--dry-run` - Validate and plan only, don't execute or respond
- `--skip-validation` - Skip agent validation, address all comments
- `--category=security` - Only address comments of specific category
- `--no-respond` - Execute fixes but don't post responses

## Agent Routing

| Agent                | Source            | Purpose                        |
| -------------------- | ----------------- | ------------------------------ |
| security-auditor     | `.github/agents/` | Security vulnerabilities       |
| architect            | `.github/agents/` | Design and architecture        |
| performance-engineer | `.github/agents/` | Performance concerns           |
| dx-advocate          | `.github/agents/` | Code quality, standards        |
| accessibility-expert | `.github/agents/` | Accessibility issues           |
| test-engineer        | `.github/agents/` | Testing concerns               |
| lu-pr-reviewer    | `.cursor/agents/` | Coordination, general feedback |

## Success Criteria

- [ ] PR identified (from branch or input)
- [ ] All comments fetched and categorized
- [ ] Reviewer agents spawned for each category
- [ ] Validation results collected
- [ ] Fix plan created for valid concerns
- [ ] Fixes executed with atomic commits
- [ ] All fixes verified
- [ ] Responses posted to all comments
- [ ] Summary posted to PR
- [ ] Changes pushed

## Error Handling

**No PR found:**

```
No open PR found for current branch.
Create a PR first: gh pr create
```

**API rate limit:**

```
GitHub API rate limit reached.
Wait or provide GITHUB_TOKEN with higher limits.
```

**Validation disagreement:**
When reviewer agents disagree (split verdict), Step 4.5 triggers an automated debate round where the dissenting side articulates their argument and the majority responds. Both perspectives are presented with agent attribution. If the debate cannot resolve the disagreement, it escalates to the user as "defer_to_human" in the PR summary.

## Integration with /lu

This skill can be invoked:

1. **Directly:** `/pr-address [PR]`
2. **Via unified entry:** `/lu address PR comments` (routes here)
3. **After PR creation:** Suggested as follow-up when comments arrive

## Related Skills

- `/quick` - For simple fixes
- `/verify` - For verification
- `/progress` - Check overall status

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| All comments addressed | Push and check | Run `git push` |
| More work needed | Continue execution | `/phase-execute {phase}` |
| Ready for re-review | Check PR status | Run `gh pr view` |

**Primary:** `git push` — Push fixes and trigger re-review

**Also available:**

- `/progress` — Check overall project status
- `/help` — Review available commands
</main>