# phase-execute

Execute all plans in a phase with Agent() sub-agents, hoisted fix loops, and parallel code review.

## main

<main>
# phase-execute — Flat Agent() Orchestrator

Execute all plans in a phase through coordinated Agent() sub-agents.

## Constraints

- **ALL Agent() calls originate from this orchestrator** — sub-agents are leaf workers
- **Sub-agents CANNOT call Agent(), Task(), or Skill()**
- **Fix loops are HOISTED** — the orchestrator runs harness check + fix as a loop, not delegated
- **UAT stays INLINE** — requires interactive user input
- **Prompt templates** in `src/skills/__helpers/agent-prompts.ts`

## Arguments

`<phase-number> [--gaps-only] [--quality-fixes] [--skip-review] [--skip-uat] [--skip-memory] [--skip-replay] [--run-process-data | --skip-process-data]`

## State Machine

```
idle -> setup -> executed -> verified -> reviewed -> learned -> committed
```

Terminal: `committed` (success) or `failed` (error).
Conditional: `SKIP_REVIEW` when --skip-review, code_review: false, or harness failed.

## Vault Resolution

```bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then REPO_VAULT=${LUCA_MUNINN_VAULT:-default}; fi
```

## Process

### Step 0: Setup (INLINE)

**Crash recovery:**
```bash
EXISTING_STATE=$(bun src/skills/__schemas/context-cli.ts state phase-execute 2>/dev/null || echo "")
if [ -n "$EXISTING_STATE" ] && [ "$EXISTING_STATE" != "idle" ]; then
  echo "Resuming from state: $EXISTING_STATE"
else
  bun src/skills/__schemas/context-cli.ts init phase-execute
fi
```

Then: resolve model routing, capture `PHASE_START_COMMIT=$(git rev-parse HEAD)`, verify GitHub tracking, procedure replay check (unless --skip-replay).

**Write state:**
```bash
bun src/skills/__schemas/context-cli.ts write phase-execute '{"current_state":"setup"}'
```

### Step 1: Wave Execution (setup -> executed)

Read `src/skills/__helpers/agent-prompts.ts` for the EXECUTE_WAVES_PROMPT template, then:

```
Agent(name: "execute-waves", description: "Execute phase plans",
  prompt: EXECUTE_WAVES_PROMPT with phase={phase_number}, vault=REPO_VAULT, complexity=current)
```

The execute-waves agent reads all PLAN.md files, groups by wave, executes tasks in order, commits atomically per task. It does ALL execution work as a leaf agent.

On failure: write state "failed", HALT.

**Write state:**
```bash
bun src/skills/__schemas/context-cli.ts write phase-execute '{"current_state":"executed"}'
```

### Step 2: Harness Fix Loop (executed -> verified) — HOISTED

This loop was previously inside phase-execute-verify. It is now INLINE because sub-agents cannot spawn fix agents.

```
FOR attempt = 1 to HARNESS_FIX_ITERATIONS (default 2):

  Agent(name: "harness", description: "Run harness checks",
    prompt: HARNESS_CHECK_PROMPT)

  Parse Agent output for PASSED field.
  IF PASSED == true: BREAK (harness passed)

  Agent(name: "fix", description: "Fix harness errors",
    prompt: HARNESS_FIX_PROMPT with errors from harness agent output)
```

After loop completes (passed or iterations exhausted):

```
Agent(name: "verify", description: "Goal-backward verification",
  prompt: GOAL_VERIFY_PROMPT with phase={phase_number})
```

Bridge transition:
```bash
luca-bridge transition --event=VERIFY_PASSED 2>/dev/null || true
```

**Write state:**
```bash
bun src/skills/__schemas/context-cli.ts write phase-execute '{"current_state":"verified"}'
```

### Step 3: Code Review (verified -> reviewed) — PARALLEL agents

Skip if: --skip-review, workflow.code_review: false, or harness failed.

**If review runs:** Spawn ALL reviewers in PARALLEL from this orchestrator:

```
Agent(name: "review-arch", description: "Architecture review",
  prompt: CODE_REVIEW_PROMPT("architecture", {...}))
Agent(name: "review-dx", description: "DX review",
  prompt: CODE_REVIEW_PROMPT("dx-advocate", {...}))
Agent(name: "review-security", description: "Security review",
  prompt: CODE_REVIEW_PROMPT("security", {...}))
Agent(name: "review-simplify", description: "Simplification review",
  prompt: CODE_REVIEW_PROMPT("simplifier", {...}))
```

Aggregate findings from all reviewers by severity.

**Write state:**
```bash
bun src/skills/__schemas/context-cli.ts write phase-execute '{"current_state":"reviewed"}'
```

### Step 4: Learning Capture (reviewed -> learned)

```
Agent(name: "learn", description: "Capture phase learnings",
  prompt: LEARNING_CAPTURE_PROMPT with phase={phase_number})
```

Bridge transition:
```bash
luca-bridge transition --event=LEARN_COMPLETE 2>/dev/null || true
```

### Step 4.5: Process Data (conditional)

If --run-process-data:
```
Agent(name: "process-data", description: "Compute process metrics",
  prompt: PROCESS_DATA_PROMPT with phase={phase_number})
```

Bridge: `luca-bridge transition --event=PROCESS_DATA_COMPLETE 2>/dev/null || true`

**Write state:**
```bash
bun src/skills/__schemas/context-cli.ts write phase-execute '{"current_state":"learned"}'
```

### Step 5: UAT (INLINE, interactive)

**Skip if:** --skip-uat or workflow.uat_required: false.

Run UAT inline (same as verify-test — present tests one at a time, collect user responses):
1. Find SUMMARY.md files for the phase
2. Extract testable deliverables
3. Create {phase}-UAT.md
4. Present tests one at a time, collect pass/fail
5. Route based on results: A (pass, next phase), B (pass, milestone), C (issues, gaps-only), D (verifier gaps)

### Step 6: Final Commit (INLINE)

```bash
git add . && bun run commit --message="complete {phase-name} phase" --type=docs --scope={phase} --no-push --skip-checks
luca-bridge transition --event=COMMIT_COMPLETE 2>/dev/null || true
```

**Write state:**
```bash
bun src/skills/__schemas/context-cli.ts write phase-execute '{"current_state":"committed"}'
```

### Step 7: Gap Detection Audit

Verify execution coverage:
- `execute-waves`: required
- `harness` + `verify`: required
- `review-*`: optional (may be skipped)
- `learn`: required

If any required step missing: log warning (advisory).

## Success Criteria

- [ ] All plans executed (execute-waves agent)
- [ ] Harness fix loop ran (hoisted, up to N iterations)
- [ ] Phase goal verified (verify agent)
- [ ] VERIFICATION.md created
- [ ] Code review completed (parallel reviewer agents, unless skipped)
- [ ] Learnings captured (learn agent)
- [ ] Bridge transitions emitted (VERIFY_PASSED, LEARN_COMPLETE, COMMIT_COMPLETE)
- [ ] current_state written after every transition
- [ ] STATE.md and ROADMAP.md updated
</main>