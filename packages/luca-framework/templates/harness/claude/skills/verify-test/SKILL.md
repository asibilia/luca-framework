# verify-test

Present UAT tests interactively and collect pass/fail results for the verify sub-skill chain.

## main

<main>
# verify-test — Interactive UAT Test Execution

Present test items to the user one at a time and collect pass/fail results.

## Context File Protocol

This sub-skill is part of the verify chain. It reads/writes the shared context file at `/tmp/verify-context.json`.

**Read:** Call `readVerifyContext()` from `src/skills/__schemas/verify-context.schemas.ts`. If `success: false`, ABORT immediately — do not proceed with stale or missing context.

**Write:** Call `writeVerifyContext({ verify_test: { ... } })` to populate the `verify_test` section.

## Process

### Step 5: Read UAT Template

Read the verify_extract context to find the UAT template path:

```typescript
import { readVerifyContext } from "src/skills/__schemas/verify-context.schemas";

const result = await readVerifyContext();
if (!result.success) { /* ABORT */ }
const uatPath = result.data.verify_extract?.uat_template_path;
```

Read the UAT.md file and parse the test items table.

### Step 6: Present Tests One at a Time

For each test item:

1. Present the test description and expected behavior
2. Wait for the user's plain text response
3. Interpret the response:
   - "yes", "y", "pass", "next", "ok" = PASS
   - Anything else = ISSUE (infer severity from description)
4. Update UAT.md after each response (batched: on issue, every 5 passes, or completion)
5. Track pass/fail counts

**CRITICAL:** Do NOT use AskQuestion. Use plain text conversation.
**CRITICAL:** Do NOT ask severity — infer from the user's description.
**CRITICAL:** Present one test at a time, not the full checklist.

### Step 7: Finalize and Commit Results

After all tests are complete:

1. Update UAT.md with final summary
2. Commit the UAT.md: `git add {uat_path} && git commit -m "test(phase-{N}): UAT results"`
3. Determine issues_found flag: true if any test failed
4. Write results to context file

### Step 7.5: Write to Context File

```typescript
import { writeVerifyContext } from "src/skills/__schemas/verify-context.schemas";

await writeVerifyContext({
  verify_test: {
    tests_presented: totalTests,
    tests_passed: passedCount,
    tests_failed: failedCount,
    issues_found: failedCount > 0,
  },
});
```

## Output

On success, the context file will contain:

```json
{
  "context_version": 1,
  "verify_extract": { "..." },
  "verify_test": {
    "tests_presented": 12,
    "tests_passed": 10,
    "tests_failed": 2,
    "issues_found": true
  }
}
```

## Error Handling

- **UAT template not found:** ABORT with message indicating verify-extract must run first.
- **Empty test list:** Log warning, write zero counts, set `issues_found: false`.
- **Context file read failure:** ABORT immediately per PREMORTEM Constraint #1.

## Anti-Patterns

- Don't use AskQuestion for test responses — plain text conversation
- Don't ask severity — infer from description
- Don't present full checklist upfront — one test at a time
- Don't run automated tests — this is manual user validation
- Don't fix issues during testing — log as gaps, diagnose after all tests complete

## Constraints

- Write results to context file via `writeVerifyContext()`
- The `issues_found` flag is CRITICAL — the orchestrator reads it to choose Path A vs Path B
- Commit UAT.md after completion
</main>