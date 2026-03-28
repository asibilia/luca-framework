# pr-fix

Plan, execute, and verify fixes for validated PR review concerns.

## main

<main>
# pr-fix — Plan, Execute, and Verify PR Fixes

Plan fixes for valid PR concerns, execute them with atomic commits, and verify the fixes address the original concerns.

## Context File Protocol

This sub-skill is part of the pr-address chain. It reads/writes the shared context file at `/tmp/pr-address-context.json`.

**Read:** Call `readPrContext()` from `src/skills/__schemas/pr-address-context.schemas.ts`. If `success: false`, ABORT immediately. Requires `pr_validate.valid_concerns` to be populated.

**Write:** Call `writePrContext({ pr_fix: { ... } })` to populate the `pr_fix` section.

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents:

- `lu-planner` — Creates fix plan for valid concerns
- `lu-executor` — Implements fixes with atomic commits
- `lu-verifier` — Verifies fixes address original concerns

**DO NOT** plan, execute, or verify fixes yourself. Spawn the appropriate agents.

## Process

### Step 5: Create Fix Plan

Spawn lu-planner to create a fix plan for all valid concerns:

```python
Task(
  prompt="""
<planning_context>
**Recipient:** pr-fix orchestrator (report findings back)

**PR:** #{pr_number}
**Mode:** pr_fixes

**Valid Concerns to Address:**
{valid_concerns_from_context_file}

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
  description="Plan PR fixes"
)
```

**Do NOT proceed until the Task returns.**

### Step 6: Execute Fixes

Spawn lu-executor to implement all planned fixes:

```python
Task(
  prompt="""
<execution_context>
**Recipient:** pr-fix orchestrator (report findings back)

**PR:** #{pr_number}
**Mode:** pr_fixes

**Fix Plan:**
{fix_plan_from_step_5}

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
  description="Execute PR fixes"
)
```

**Do NOT proceed until the Task returns.**

### Step 7: Verify Fixes

Spawn lu-verifier to confirm fixes address original concerns:

```python
Task(
  prompt="""
<verification_context>
**Recipient:** pr-fix orchestrator (report findings back)

**PR:** #{pr_number}
**Mode:** pr_fixes

**Execution Result:**
{execution_result_from_step_6}

**Original Concerns:**
{valid_concerns_from_context_file}
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
  description="Verify PR fixes"
)
```

**Do NOT proceed until the Task returns.**

### Step 7.9: Write to Context File

Write fix tracking results to the shared context file:

```typescript
import { writePrContext } from "src/skills/__schemas/pr-address-context.schemas";

await writePrContext({
  pr_fix: {
    fix_tracking: fixResults.map(r => ({
      comment_id: r.comment_id,
      commit_hash: r.commit_hash,
      files_modified: r.files_modified,
      verified: r.fix_verified,
      fix_description: r.fix_description,
    })),
  },
});
```

## Output

On success, the context file will include:

```json
{
  "pr_fix": {
    "fix_tracking": [
      {
        "comment_id": "123",
        "commit_hash": "abc1234",
        "files_modified": ["src/foo.ts", "src/bar.ts"],
        "verified": true,
        "fix_description": "Added null check for user input"
      }
    ]
  }
}
```

## Error Handling

- **Context file missing or invalid:** ABORT — pr-validate must run first
- **No valid concerns:** Write empty fix_tracking array (valid result, no fixes needed)
- **Planner failure:** ABORT — cannot execute without a plan
- **Executor failure:** ABORT — fixes are the core deliverable
- **Verifier failure:** Log warning but still write partial results

## Constraints

- This skill MUST spawn lu-planner, lu-executor, lu-verifier via Task()
- Do NOT plan, execute, or verify fixes inline
- Do NOT respond to PR comments — that is pr-respond's responsibility
- Do NOT capture learnings — that is pr-learn's responsibility
- Each fix should be an atomic commit with proper format
</main>