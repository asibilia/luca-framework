# phase-execute-verify

Run harness and verification fix loops for the phase-execute sub-skill chain.

## main

<main>
# phase-execute-verify — Harness and Verification Fix Loops

Run the two-phase verification pipeline: Loop A (harness mechanical fix) and Loop B (verify semantic fix). Both loops have configurable max iterations from the complexity gating matrix.

## Context File Protocol

This sub-skill is part of the phase-execute chain. It reads/writes the shared context file at `/tmp/phase-execute-context.json`.

**Read:** Call `readPhaseExecuteContext()` from `src/skills/__schemas/phase-execute-context.schemas.ts`. If `success: false`, ABORT immediately — do not proceed with stale or missing context.

**Write:** Call `writePhaseExecuteContext({ phase_execute_verify: { ... } })` to populate the `phase_execute_verify` section.

## Complexity-Driven Iteration Limits

Read the complexity level from the orchestrator args or STATE.md. Map to iteration budgets:

| Parameter | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
|-----------|---------|--------|----------|---------|----------|
| Harness fix iterations (Loop A) | 1 | 2 | 2 | 2 | 3 |
| Verify fix iterations (Loop B) | 1 | 1 | 1 | 1 | 2 |

These limits cap how many times each loop retries before accepting the result.

## Process

### Step 5: Loop A — Harness Mechanical Fix

Run the verification harness (`bun test`, `bunx --bun tsc --noEmit`, lint, build) and fix any mechanical failures:

1. Run the harness:
   ```bash
   bunx --bun tsc --noEmit 2>&1
   ```

2. If harness passes: Log success, set `harness_passed = true`, proceed to Loop B.

3. If harness fails and iterations remaining:
   - Parse the harness output for specific errors
   - Spawn <%= branding.commandPrefix %>-executor to fix the identified issues:
     ```
     Task(
       prompt: """
     <fix_context>
     The verification harness failed. Fix these specific issues:
     {parsed_errors}

     Fix ONLY the identified issues. Do not refactor or change unrelated code.
     </fix_context>
     """,
       subagent_type: "<%= branding.commandPrefix %>-executor",
       description: "Fix harness failures (iteration {N})"
     )
     ```
   - Re-run harness
   - Repeat until pass or iterations exhausted

4. If iterations exhausted and still failing: Log the remaining failures, set `harness_passed = false`, proceed to Loop B anyway.

### Step 6: Loop B — Verify Semantic Fix

Spawn <%= branding.commandPrefix %>-verifier for semantic verification of the phase goal:

1. Spawn <%= branding.commandPrefix %>-verifier:
   ```
   Task(
     prompt: """
   <verify_context>
   Verify that Phase {phase_number} achieved its stated goal.
   Check all success criteria from the phase plans.
   {verification_mode_context}
   </verify_context>
   """,
     subagent_type: "<%= branding.commandPrefix %>-verifier",
     description: "Verify phase {phase_number} goal achieved"
   )
   ```

2. If verification passes: Log success, set `verify_passed = true`.

3. If verification finds issues and iterations remaining:
   - Spawn <%= branding.commandPrefix %>-planner + <%= branding.commandPrefix %>-plan-checker to create fix plans
   - Spawn <%= branding.commandPrefix %>-executor to execute fix plans
   - Re-run <%= branding.commandPrefix %>-verifier
   - Repeat until pass or iterations exhausted

4. If iterations exhausted and still failing: Log remaining issues, set `verify_passed = false`.

### Step 7: Aggregate Results

Combine harness and verify results. The orchestrator uses `harness_passed` to decide whether to run code review (SKIP_REVIEW if harness failed).

### Step 8: Write to Context File

```typescript
import { writePhaseExecuteContext } from "src/skills/__schemas/phase-execute-context.schemas";

await writePhaseExecuteContext({
  phase_execute_verify: {
    harness_ran: true,
    harness_passed: harnessResult,
    verify_ran: true,
    verify_passed: verifyResult,
    fix_iterations: totalIterations,
  },
});
```

## Output

On success, the context file will contain:

```json
{
  "context_version": 1,
  "phase_execute_verify": {
    "harness_ran": true,
    "harness_passed": true,
    "verify_ran": true,
    "verify_passed": true,
    "fix_iterations": 1
  }
}
```

## Bridge Event Alignment

After both loops complete, the orchestrator emits the existing bridge transition:

```bash
luca-bridge transition --event=VERIFY_PASSED --data='{"phase_id":{phase_number}}'
```

This bridge event is emitted by the ORCHESTRATOR, not by this sub-skill. This sub-skill only writes to the context file.

## Error Handling

- **Harness execution failure (not test failure):** Log error and treat as harness_passed = false. Do not ABORT.
- **<%= branding.commandPrefix %>-verifier spawn failure:** Log error and treat as verify_passed = false. Do not ABORT.
- **<%= branding.commandPrefix %>-executor fix spawn failure:** Log error, decrement remaining iterations, continue loop.
- **Context file read failure:** ABORT immediately per PREMORTEM Constraint #1.

## Constraints

- Write results to context file via `writePhaseExecuteContext()`
- Spawn <%= branding.commandPrefix %>-executor for fixes — do NOT fix code inline
- Spawn <%= branding.commandPrefix %>-verifier for semantic verification — do NOT verify inline
- Respect iteration limits from complexity gating matrix
- Do NOT emit bridge transitions — the orchestrator handles those
</main>