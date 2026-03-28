# pr-address

Address PR review comments by orchestrating sub-skills: pr-fetch, pr-validate, pr-debate, pr-fix, pr-learn, pr-respond.

## main

<main>
# pr-address — Thin Orchestrator

Address pull request review comments through a coordinated sub-skill chain. This skill is a **thin orchestrator** — it delegates ALL work to sub-skills via Skill() calls, reads context between steps, and transitions state.

## Zero-Inline-Logic Constraint

This orchestrator MUST contain ONLY:
- **Skill() calls** to the 6 sub-skills
- **Context file reads** via `readPrContext()` to check conditions between steps
- **State machine transitions** (described as events to send after each step)
- **Arg parsing** and flag handling
- **Vault routing** and model resolution (passthrough config)

This orchestrator MUST NOT contain:
- `gh api` calls (those belong in pr-fetch and pr-respond)
- `Task()` spawns (those belong in pr-validate, pr-debate, pr-fix, pr-learn)
- YAML parsing or template interpolation
- Comment categorization logic
- Any business logic beyond reading context and choosing the next Skill() call

## Vault Resolution

```bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
```

**Write routing for this skill:**
- `pitfall:pr-review-*` engrams -> write to DEFAULT_VAULT (cross-cutting learnings)
- `session:*` context -> write to REPO_VAULT (project-scoped session)

## Model Resolution

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

| Agent           | quality | balanced | budget |
| --------------- | ------- | -------- | ------ |
| reviewers (all) | opus    | sonnet   | haiku  |
| lu-planner      | opus    | opus     | sonnet |
| lu-executor     | opus    | sonnet   | sonnet |
| lu-verifier     | sonnet  | sonnet   | haiku  |

> **Note:** Model routing is passed through to sub-skills. The orchestrator does not resolve models itself.

## Input Modes

| Input     | Example                                             | Behavior                      |
| --------- | --------------------------------------------------- | ----------------------------- |
| No input  | `/pr-address`                                     | Detect PR from current branch |
| PR number | `/pr-address 123`                                 | Use specified PR number       |
| PR URL    | `/pr-address https://github.com/.../pull/123`     | Parse PR from URL             |

## Flags

- `--dry-run` — Validate and plan only, don't execute or respond
- `--skip-validation` — Skip agent validation, address all comments
- `--category=security` — Only address comments of specific category
- `--no-respond` — Execute fixes but don't post responses

## State Machine

This orchestrator drives the `prAddressStateMachine` defined in
`src/skills/__schemas/states/pr-address.states.ts`. States flow:

```
idle -> fetched -> categorized -> validated -> [debated] -> planned ->
fixed -> verified -> [learned] -> responded -> pushed
```

Terminal states: `pushed` (success) or `failed` (error).

Conditional paths use explicit SKIP events (fail-closed):
- `SKIP_DEBATE`: No split verdicts found (orchestrator decides, not the machine)
- `SKIP_LEARN`: No learnable comments found (orchestrator decides, not the machine)

## Orchestrator Flow

### Step 0: Parse Args and Initialize Context

Parse the PR number/URL from Skill() args. Extract any flags.

Initialize the context file at `/tmp/pr-address-context.json`:

```typescript
import { writePrContext } from "src/skills/__schemas/pr-address-context.schemas";

await writePrContext({});
// This creates the file with context_version: 1
```

State: `idle`

### Step 1: Fetch PR Data

```
Skill("pr-fetch", "{pr_number}")
```

On success: send `FETCH_COMPLETE` -> state becomes `fetched`
On failure: send `ABORT` -> state becomes `failed` (required sub-skill)

### Step 2: Validate and Categorize Comments

```
Skill("pr-validate", "{pr_number}")
```

This sub-skill handles Steps 2-3-4 from the original monolith:
categorization, reviewer agent spawning, and aggregation.

On success: send `CATEGORIZE_COMPLETE` -> state becomes `categorized`, then send `VALIDATE_COMPLETE` -> state becomes `validated`
On failure: send `ABORT` -> state becomes `failed` (required sub-skill)

### Step 3: Conditional Debate (Split Verdicts)

Read context to check for split verdicts:

```typescript
import { readPrContext } from "src/skills/__schemas/pr-address-context.schemas";

const result = await readPrContext();
if (!result.success) {
  // ABORT: context file missing or malformed
  // send ABORT -> state becomes failed
  return;
}
const context = result.data;
const hasSplitVerdicts = (context.pr_validate?.split_verdicts?.length ?? 0) > 0;
```

**If split verdicts present:**

```
Skill("pr-debate", "{pr_number}")
```

On success: send `DEBATE_COMPLETE` -> state becomes `debated`, then send `PLAN_COMPLETE` -> state becomes `planned`
On failure (optional sub-skill): record guard-exception skip entry, log warning, send `SKIP_DEBATE` -> state becomes `planned`

**If NO split verdicts:**

Send `SKIP_DEBATE` explicitly -> state becomes `planned` (fail-closed: always send a transition event)

### Step 4: Plan and Execute Fixes

```
Skill("pr-fix", "{pr_number}")
```

This sub-skill handles Steps 5-6-7 from the original monolith:
planning fixes, executing them, and verifying them.

On success: send `FIX_COMPLETE` -> state becomes `fixed`, then send `VERIFY_COMPLETE` -> state becomes `verified`
On failure: send `ABORT` -> state becomes `failed` (required sub-skill)

### Step 5: Conditional Learning

Read context to check for learnable comments:

```typescript
const result = await readPrContext();
if (!result.success) {
  // ABORT: context file missing or malformed
  return;
}
const context = result.data;
const hasLearnableConcerns = (context.pr_validate?.valid_concerns?.length ?? 0) > 0;
```

**If valid concerns exist:**

```
Skill("pr-learn", "{pr_number}")
```

On success: send `LEARN_COMPLETE` -> state becomes `learned`
On failure (optional sub-skill): record guard-exception skip entry, log warning, send `SKIP_LEARN` -> state becomes `responded`

**If NO valid concerns:**

Send `SKIP_LEARN` explicitly -> state becomes `responded` (fail-closed)

### Step 6: Respond and Push

```
Skill("pr-respond", "{pr_number}")
```

On success: send `RESPOND_COMPLETE` -> state becomes `responded` (if not already), then send `PUSH_COMPLETE` -> state becomes `pushed` (final)
On failure: send `ABORT` -> state becomes `failed` (required sub-skill)

### Step 7: Gap Detection Audit

After all Skill() calls complete (state machine in `pushed` or `failed`), run the gap detector against the pr-address DAG to verify execution coverage.

1. Build a `DAGCheckpoint` from the orchestrator's execution trace:
   - `completedSteps`: Map each completed Skill() call to a step ID from the pr-address DAG
   - `skippedSteps`: For each SKIP_DEBATE or SKIP_LEARN event, create a `SkippedStepEntry` with `reason: "guard-false"` and `optional: true`
   - `failedSteps`: For any failed sub-skill, record the error

2. Call `detectGaps(prAddressDAG, checkpoint)` from `src/workflow/__helpers/gap-detector.ts` using the pr-address DAG from `src/workflow/__helpers/pr-address-dag.ts`

3. Report the gap audit result:
   - If `status === "clean"`: Log success, all steps accounted for
   - If `status === "gaps_found"` with only `warning` severity: Log warnings, proceed (optional steps missing is acceptable)
   - If `status === "gaps_found"` with any `fail` severity: Log error — required steps were silently skipped

## Error Handling

**Required sub-skills** (pr-fetch, pr-validate, pr-fix, pr-respond):
- On failure -> send `ABORT` -> terminal `failed` state
- The workflow halts; no further Skill() calls

**Optional sub-skills** (pr-debate, pr-learn):
- On failure -> record a `SkippedStepEntry` with `reason: "guard-exception"` and `optional: true`
- Log a warning describing the failure
- Continue to next state via the appropriate SKIP event

This pattern ensures anti-skip enforcement: every step transition is either an explicit completion event, an explicit skip event, or an abort. No silent omission.

## Success Criteria

- [ ] PR identified (from branch or input)
- [ ] All comments fetched and categorized (pr-fetch + pr-validate)
- [ ] Split verdicts debated OR explicitly skipped (pr-debate or SKIP_DEBATE)
- [ ] Fixes planned, executed, and verified (pr-fix)
- [ ] Learnings captured OR explicitly skipped (pr-learn or SKIP_LEARN)
- [ ] Responses posted and changes pushed (pr-respond)
- [ ] Gap detection audit passes with `clean` or `warning`-only status
- [ ] State machine reaches `pushed` (success) or `failed` (error) terminal state

## Related Skills

- `/quick` — For simple fixes
- `/verify` — For verification
- `/progress` — Check overall status
</main>