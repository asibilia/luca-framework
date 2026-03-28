# verify-diagnose

Diagnose UAT failures via parallel debuggers and create verified fix plans for the verify sub-skill chain.

## main

<main>
# verify-diagnose — UAT Failure Diagnosis and Fix Planning

Diagnose UAT failures via parallel debuggers and create verified fix plans.

## Sub-agent Delegation Requirements

This sub-skill is an **orchestrator** for diagnosis. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents:**

- `lu-debugger` — Diagnoses root causes of UAT failures (parallel, one per issue)
- `lu-planner` — Creates fix plans from diagnosed gaps
- `lu-plan-checker` — Verifies fix plans before execution (max 3 iterations)

**DO NOT** attempt to diagnose, plan, or verify yourself. Spawn the appropriate agents.

**Reference:** See `.claude/luca/references/task-directive.md` for Task() syntax patterns.

## Context File Protocol

This sub-skill is part of the verify chain. It reads/writes the shared context file at `/tmp/verify-context.json`.

**Read:** Call `readVerifyContext()` from `src/skills/__schemas/verify-context.schemas.ts`. If `success: false`, ABORT immediately.

**Write:** Call `writeVerifyContext({ verify_diagnose: { ... } })` to populate the `verify_diagnose` section.

## Model Resolution

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| lu-debugger | opus | sonnet | sonnet |
| lu-planner | opus | opus | sonnet |
| lu-plan-checker | sonnet | sonnet | haiku |

## Process

### Step 8.1: Read Failed Tests from Context

```typescript
import { readVerifyContext } from "src/skills/__schemas/verify-context.schemas";

const result = await readVerifyContext();
if (!result.success) { /* ABORT */ }
const testOutput = result.data.verify_test;
// Read UAT.md to get specific failure details
```

### Step 8.2: Spawn Parallel Debuggers

For each failed UAT test, spawn a lu-debugger agent:

```python
# For each UAT issue — spawn in PARALLEL
Task(
  prompt="""
<debug_context>

**UAT Issue:** {issue_description}
**Phase:** {phase_number}
**Expected:** {expected_behavior}
**Actual:** {actual_behavior}

</debug_context>

Diagnose the root cause of this UAT failure.
Return diagnosis with affected files and suggested fix approach.
""",
  subagent_type="lu-debugger",
  description="Diagnose UAT issue: {issue_summary}"
)
```

### Step 8.3: Spawn Planner for Fix Plans

After all debuggers return, spawn lu-planner in gaps mode:

```python
Task(
  prompt="""
<planning_context>

**Phase:** {phase_number}
**Mode:** gap_closure
**Phase Directory:** {phase_dir}

**Diagnosed Issues:**
{diagnosed_issues}

</planning_context>

Create fix plans for these diagnosed UAT issues.
""",
  subagent_type="lu-planner",
  description="Plan UAT fixes"
)
```

### Step 8.4: Verify Fix Plans

Spawn lu-plan-checker to validate plans (iterate max 3 times):

```python
Task(
  prompt="""
<verification_context>

**Phase:** {phase_number}
**Fix Plans:** {plans_content}
**Original Issues:** {diagnosed_issues}

</verification_context>

Verify these fix plans will address the UAT issues.
""",
  subagent_type="lu-plan-checker",
  description="Verify fix plans"
)
```

### Step 8.5: Write to Context File

```typescript
import { writeVerifyContext } from "src/skills/__schemas/verify-context.schemas";

await writeVerifyContext({
  verify_diagnose: {
    debuggers_spawned: debuggerCount,
    fix_plans_created: planCount,
    plan_checker_ran: true,
  },
});
```

## Output

On success, the context file will contain:

```json
{
  "context_version": 1,
  "verify_extract": { "..." },
  "verify_test": { "...", "issues_found": true },
  "verify_diagnose": {
    "debuggers_spawned": 3,
    "fix_plans_created": 2,
    "plan_checker_ran": true
  }
}
```

## Error Handling

- **No test failures in context:** Should not happen (orchestrator only calls this on Path B). Log warning and write zero counts.
- **Debugger spawn failure:** Log warning, continue with remaining debuggers.
- **Planner spawn failure:** ABORT — cannot create fix plans.
- **Plan checker failure after 3 iterations:** Write results as-is, set `plan_checker_ran: false`.
- **Context file read failure:** ABORT immediately per PREMORTEM Constraint #1.

## Constraints

- Write results to context file via `writeVerifyContext()`
- Spawn agents in PARALLEL where possible (debuggers)
- Do NOT diagnose or plan yourself — delegate to agents
- Max 3 plan-checker iterations
</main>