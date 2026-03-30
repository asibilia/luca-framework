# <%= branding.commandSlash %>

Unified entry point and autonomous orchestrator for all <%= branding.frameworkName %> workflows with cognitive pre-flight, complexity routing, and configurable oversight.

## main

**Branding:** Read `.planning/config.json` branding section. Use `/{commandPrefix}` and `{frameworkName}` in user-facing output. Defaults: `<%= branding.commandSlash %>`, `<%= branding.frameworkName %>`.

The single entry point for all <%= branding.frameworkName %> workflows. This is a **flat Agent() orchestrator** — it spawns leaf-worker agents via Agent(), manages state, and controls the pipeline.

**Arguments:** `<task-description | Jira-URL | [TICKET-ID]> [--complexity=LEVEL] [--force-complex] [--skip-memory] [--skip-branch] [--oversight=MODE] [--skip-backlog] [--max-phases=N] [--no-swarm] [--dry-run] [--ask]`

## Constraints

1. **ALL Agent() calls originate from this orchestrator** — sub-agents are leaf workers that CANNOT call Agent(), Task(), or Skill()
2. **Every step is binding** — you MUST NOT skip, simplify, or substitute workflow steps
3. **NEVER write code directly** — delegate to Agent() sub-agents for all code work
4. **Write `current_state` after EVERY transition** — enforcement hooks depend on it
5. **Prompt templates** are in `src/skills/__helpers/agent-prompts.ts` — read that file with the Read tool when you need a template, then pass its content as the Agent() prompt

## Context File: `/tmp/lu-context.json`

```bash
bun src/skills/__schemas/context-cli.ts init lu          # Initialize
bun src/skills/__schemas/context-cli.ts write lu '{"current_state":"routed"}'  # Write state
bun src/skills/__schemas/context-cli.ts read lu           # Read context
bun src/skills/__schemas/context-cli.ts state lu          # Read just state
```

## Vault Resolution

```bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then REPO_VAULT=${LUCA_MUNINN_VAULT:-default}; fi
```

## Pipeline

### Step 1: Parse Args, Crash Recovery, Initialize

Parse user request and all CLI flags.

**Crash recovery:**
```bash
EXISTING_STATE=$(bun src/skills/__schemas/context-cli.ts state lu 2>/dev/null || echo "")
if [ -n "$EXISTING_STATE" ] && [ "$EXISTING_STATE" != "idle" ]; then
  echo "Resuming from state: $EXISTING_STATE"
  # Skip completed steps based on current_state
else
  bun src/skills/__schemas/context-cli.ts init lu
fi
```

### Step 2: Cognitive Pre-Flight + Classify + Route (idle -> routed)

Read `agent-prompts.ts`, spawn:
```
Agent(name: "cognition", prompt: COGNITION_PROMPT({phase, complexity, vault, currentState}))
Agent(name: "classify", prompt: CLASSIFY_PROMPT({...}))
```

Parse COMPLEXITY and ROUTE from classify agent's output.

```bash
bun src/skills/__schemas/context-cli.ts write lu '{"current_state":"routed"}'
```

### Step 3: Route Branch

**If ROUTE != "phase-execute":** Handle non-phase-execute routes:
```
Agent(name: "{route}-handler", prompt: ROUTE_HANDLER_PROMPT(route, {...}))
```
Then: Agent("verify-route") + Agent("learn-route") (conditional), commit, write "complete", RETURN.

**If ROUTE == "phase-execute":** Continue to Step 4.

### Step 4: Configure Session (routed -> configured)

```
Agent(name: "configure", prompt: CONFIGURE_PROMPT({...}))
```

After agent returns: `luca-bridge transition --event=START` and `--event=PREFLIGHT_COMPLETE`.

```bash
bun src/skills/__schemas/context-cli.ts write lu '{"current_state":"configured"}'
```

### Step 5: Backlog Scan (configured -> scanned) — CONDITIONAL

If --skip-backlog or config backlog_scan==false: skip, write state "scanned".

Otherwise:
```
Agent(name: "backlog", prompt: BACKLOG_PROMPT({...}))
```

```bash
bun src/skills/__schemas/context-cli.ts write lu '{"current_state":"scanned"}'
```

### Step 6: Build Phase Execution Order (INLINE)

Read .planning/ROADMAP.md. Parse incomplete phases. Build dependency graph. Topological sort. Apply MAX_PHASES limit. If --dry-run: display plan and RETURN.

```bash
bun src/skills/__schemas/context-cli.ts write lu '{"current_state":"executing"}'
```

### Step 7: Phase Execution Loop

**FOR each phase in execution order (serial):**

Write loop counter to context file for recovery: `{"loop_index": N, "remaining_phases": [...]}`

#### 7a. Phase dependency check (INLINE)
Verify all dependencies complete. If not: park phase, continue.

#### 7b. Oversight gate (INLINE, interactive)
If oversight != "full-auto": prompt user for phase confirmation.

#### 7c. Per-phase complexity re-classify
```
Agent(name: "classify-{NN}", prompt: CLASSIFY_PROMPT({phase: NN, ...}))
```

#### 7d. Gate resolution (INLINE)
```bash
PREMORTEM=$(luca-bridge gate-check --gate=premortem 2>/dev/null | ...)
PROCESS_DATA=$(luca-bridge gate-check --gate=process_data 2>/dev/null | ...)
```

#### 7e. Discussion (conditional: skip if --skip-discuss)
```
Agent(name: "discuss-{NN}", prompt: phase discussion with premortem if --run-premortem)
```

#### 7f. Plan existence check (INLINE)
If .planning/phases/{NN}-*/PLAN.md exists: skip planning.

#### 7g. Planning
```
Agent(name: "plan-{NN}", prompt: create PLAN.md with tasks and wave grouping)
```

#### 7h. Execution
```
Agent(name: "execute-{NN}", prompt: EXECUTE_WAVES_PROMPT({phase: NN, ...}))
```

#### 7i. Harness Fix Loop (INLINE, hoisted)
```
FOR attempt = 1 to HARNESS_FIX_ITERATIONS:
  Agent(name: "harness-{NN}", prompt: HARNESS_CHECK_PROMPT({...}))
  IF PASSED: BREAK
  Agent(name: "fix-{NN}", prompt: HARNESS_FIX_PROMPT(errors, {...}))
```
Then: `luca-bridge transition --event=VERIFY_PASSED`

#### 7j. Goal-backward verification
```
Agent(name: "verify-{NN}", prompt: GOAL_VERIFY_PROMPT({phase: NN, ...}))
```

#### 7k. Code review (conditional: complexity >= MODERATE, not --skip-review)
Spawn PARALLEL reviewers:
```
Agent(name: "review-arch-{NN}", prompt: CODE_REVIEW_PROMPT("architecture", {...}))
Agent(name: "review-dx-{NN}", prompt: CODE_REVIEW_PROMPT("dx-advocate", {...}))
Agent(name: "review-security-{NN}", prompt: CODE_REVIEW_PROMPT("security", {...}))
Agent(name: "review-simplify-{NN}", prompt: CODE_REVIEW_PROMPT("simplifier", {...}))
```

#### 7l. Learning capture
```
Agent(name: "learn-{NN}", prompt: LEARNING_CAPTURE_PROMPT({phase: NN, ...}))
```
`luca-bridge transition --event=LEARN_COMPLETE`

#### 7m. Process data (conditional: --run-process-data)
```
Agent(name: "process-data-{NN}", prompt: PROCESS_DATA_PROMPT({phase: NN, ...}))
```

#### 7n. Commit (INLINE)
```bash
git add . && git commit -m "feat({NN}): complete phase {NN}"
```

#### 7o. Update state (INLINE)
Mark phase complete in ROADMAP.md. Write loop counter + remaining phases to context file.

#### 7p. Gap closure retry (INLINE, if phase had failures)
```
FOR retry = 1 to GAP_RETRIES:
  Agent(name: "plan-gaps-{NN}", prompt: plan only for gaps)
  Agent(name: "execute-gaps-{NN}", prompt: execute gap plan only)
  Re-run harness (7i pattern)
  IF gaps closed: BREAK
IF still failing: park phase, cascade to dependents
```

### Step 8: Milestone Boundary Check

If all phases in current milestone complete:
```
Agent(name: "milestone-learn", prompt: MILESTONE_LEARN_PROMPT({...}))
Agent(name: "milestone-prune", prompt: MILESTONE_PRUNE_PROMPT({...}))
Agent(name: "milestone-shadow", prompt: MILESTONE_SHADOW_PROMPT({...}))  # conditional
Agent(name: "milestone-archive", prompt: MILESTONE_ARCHIVE_PROMPT({...}))
Agent(name: "milestone-finalize", prompt: MILESTONE_FINALIZE_PROMPT({...}))
```

### Step 9: Cross-Milestone Continuation (INLINE)

If CROSS_MILESTONE config == true and next milestone exists: loop back to Step 6.

### Step 10: Gap Detection Audit (INLINE)

Verify all required context sections are populated. Advisory warning if gaps found.

### Step 11: Session Summary + Cleanup

`luca-bridge transition --event=COMMIT_COMPLETE`

```bash
bun src/skills/__schemas/context-cli.ts write lu '{"current_state":"complete"}'
```