# Research: Crash Recovery From Disk State (Learning 10)

> **Learning:** GSD2's crash recovery works because the lock file tracks the current unit and all state is on disk. On crash, next launch synthesizes a recovery briefing from surviving session data. Recovery is deterministic.
>
> **Cross-references:** Learning 9 (structured state -- prerequisite), Learning 5 (structured verification), Learning 8 (token profiles)

## Current Crash Recovery: LLM Interpretation

From `lu.skill.ts` Step 1:

```bash
EXISTING_STATE=$(bun src/skills/__schemas/context-cli.ts state lu 2>/dev/null || echo "")
PIPELINE_POS=$(luca-bridge read-field --field=pipeline_position 2>/dev/null | \
  bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.value || 'idle')" 2>/dev/null || echo "idle")
if [ "$PIPELINE_POS" != "idle" ] || ([ -n "$EXISTING_STATE" ] && [ "$EXISTING_STATE" != "idle" ]); then
  echo "Resuming from pipeline position: $PIPELINE_POS (context state: $EXISTING_STATE)"
  # Skip completed steps based on PIPELINE_POS
```

### What happens today on crash

1. `/lu` starts, reads context file (`/tmp/lu-context.json`) and state.json
2. The LLM (the orchestrator is an LLM executing `lu.skill.ts` prompt) interprets the state
3. The LLM decides which steps to skip based on what it infers was completed
4. Execution resumes from the LLM's best guess

### Failure modes

| Failure                   | What goes wrong                                                                                                                                        | How often                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| **Context file lost**     | `/tmp/lu-context.json` is in /tmp -- OS may clean it. Loop index, git context, accumulated agent output gone.                                          | Common after system restart            |
| **Ambiguous state**       | state.json says `"value": "executing"` but doesn't record which sub-step was active. Was it planning? Executing? Reviewing?                            | Every crash during phase execution     |
| **LLM misinterpretation** | The LLM guesses wrong about what completed. Re-runs steps that already succeeded (wasted work) or skips steps that didn't complete (gaps).             | Frequent -- LLMs are not deterministic |
| **Partial writes**        | Agent was mid-execution. Files partially modified. Git has uncommitted changes. State.json was last updated at phase start, not at the sub-step level. | Every crash during execution           |
| **Stale STATE.md**        | STATE.md hasn't been regenerated since last transition. LLM reads stale prose.                                                                         | Always (dual-write lag)                |

### Root cause

Crash recovery fails because:

1. Pipeline position is not tracked at sub-step granularity in structured state
2. The context file is volatile (/tmp)
3. Recovery logic requires LLM judgment instead of deterministic branching

## Proposed: Deterministic Recovery From state.json

### The key insight from GSD2

GSD2's recovery algorithm is:

1. Read lock file (contains current unit ID)
2. Read unit state file (contains status: pending/in-progress/complete)
3. If in-progress: synthesize recovery briefing from disk artifacts, restart unit
4. If complete: advance to next unit

This is **zero LLM interpretation**. The orchestrator code (TypeScript, not LLM) reads structured data and makes a deterministic decision.

### Luca's equivalent

With structured state from Learning 9, recovery becomes:

```typescript
function recoverFromCrash(state: StateJson): RecoveryAction {
  const pipeline = state.context.pipeline_position;
  if (!pipeline) return { action: "fresh-start" };

  const currentStep = pipeline.current_step;
  const phaseStep = pipeline.current_phase_step;

  // Determine what was completed vs. in-progress
  if (currentStep === "phase-loop" && phaseStep) {
    return recoverPhaseExecution(state, pipeline);
  }

  // Pre-phase steps: safe to re-run (idempotent)
  if (["init", "preflight", "classify", "configure"].includes(currentStep)) {
    return { action: "restart-step", step: currentStep };
  }

  // Post-phase steps: check completion
  if (currentStep === "milestone") {
    return { action: "restart-step", step: "milestone" };
  }

  return { action: "fresh-start" };
}

function recoverPhaseExecution(
  state: StateJson,
  pipeline: PipelinePosition,
): RecoveryAction {
  const phaseStep = pipeline.current_phase_step;
  const phaseId = state.context.current_phase;

  // Check what disk artifacts exist to determine true completion
  const hasCommit = checkGitLogForPhase(phaseId);
  const hasPlan = checkFileExists(`.planning/phases/${phaseId}-*/PLAN.md`);
  const hasVerification = state.context.verification_results?.find(
    (v) => v.phase_id === phaseId,
  );

  // Execution completed and committed -> advance to next phase
  if (hasCommit) {
    return { action: "advance-phase", completedPhase: phaseId };
  }

  // Execution completed but not committed -> run from commit step
  if (hasVerification?.harness?.status === "passed") {
    return { action: "resume-phase", step: "commit", phase: phaseId };
  }

  // Plan exists but execution incomplete -> re-execute
  if (hasPlan) {
    return { action: "resume-phase", step: "execute", phase: phaseId };
  }

  // Nothing completed -> restart phase from beginning
  return { action: "resume-phase", step: "discuss", phase: phaseId };
}
```

### What makes this deterministic

1. **No LLM decides where to resume.** TypeScript code reads JSON and returns a structured `RecoveryAction`.
2. **Disk artifacts are ground truth.** Git log, file existence, and state.json are verifiable facts.
3. **Recovery actions are enumerated.** `fresh-start`, `restart-step`, `resume-phase`, `advance-phase` -- finite, testable.
4. **Idempotent steps are safe to re-run.** Pre-flight, classification, configuration produce the same output given the same inputs. Re-running them is costless.

## Pipeline Position Tracking

### What needs to change in lu.skill.ts

The orchestrator must emit pipeline position updates at each step boundary. Currently, it emits state machine transitions (`luca-bridge transition --event=PHASE_START`), but these don't track sub-step granularity.

**Before (current):**

```bash
# Step 7h: Execute
Agent(name: "execute-{NN}", ...)
# No position update between execute and harness

# Step 7i: Harness
Agent(name: "harness-{NN}", ...)
```

**After (proposed):**

```bash
# Step 7h: Execute
luca-bridge set-field --field=pipeline_position.current_phase_step --value='"execute"'
Agent(name: "execute-{NN}", ...)

# Step 7i: Harness
luca-bridge set-field --field=pipeline_position.current_phase_step --value='"harness"'
Agent(name: "harness-{NN}", ...)
```

### Position tracking granularity

| Pipeline step          | Position value     | Recovery behavior                                               |
| ---------------------- | ------------------ | --------------------------------------------------------------- |
| Parse args             | `init`             | Re-run from beginning                                           |
| Cognitive pre-flight   | `preflight`        | Re-run pre-flight (idempotent)                                  |
| Classification         | `classify`         | Re-run classification (idempotent, or deterministic per L6)     |
| Configuration          | `configure`        | Re-run configuration (idempotent)                               |
| Git setup              | `git-setup`        | Check if branch exists, skip if so                              |
| Backlog scan           | `backlog`          | Re-run backlog scan (idempotent)                                |
| Build phase order      | `phase-order`      | Re-parse ROADMAP.md (idempotent)                                |
| Phase dependency check | `dependency-check` | Re-check (idempotent)                                           |
| Oversight gate         | `oversight-gate`   | Re-prompt user if needed                                        |
| Research               | `research`         | Check if research/ dir populated, skip if so                    |
| Discussion             | `discuss`          | Check if CONTEXT.md exists, skip if so                          |
| Planning               | `plan`             | Check if PLAN.md exists, skip if so                             |
| Plan review            | `plan-review`      | Re-run if plan was not approved                                 |
| Execution              | `execute`          | **Key recovery point.** Check git diff for uncommitted changes. |
| Harness                | `harness`          | Re-run harness (idempotent, deterministic)                      |
| Verification           | `verify`           | Re-run verification (idempotent)                                |
| Code review            | `review`           | Re-run reviews (idempotent)                                     |
| Learning               | `learn`            | Re-run or skip (low cost)                                       |
| Commit                 | `commit`           | Check git log for existing commit                               |
| Milestone check        | `milestone`        | Re-run milestone check (idempotent)                             |

### Key recovery points

Most steps are idempotent (re-running produces the same result). The critical recovery points are:

1. **Execution (7h):** The agent may have partially modified files. Recovery must detect uncommitted changes and either continue from the partial state or reset and re-execute.

2. **Commit (7n):** If the commit failed mid-push, recovery must check remote status. `git status` + `git log origin/{branch}..HEAD` tells us if changes are committed but not pushed, or not committed at all.

3. **Git setup (4.5):** If the branch was created but not pushed, or the issue was created but branch wasn't, recovery must check each independently.

## Lock File Approach

GSD2 uses a lock file (`.gsd/lock`) that tracks:

- Current unit (slice/task)
- Session ID
- Timestamp
- PID (process ID)

### Luca's equivalent: `.planning/.pipeline-lock.json`

```json
{
  "session_id": "uuid",
  "pid": 12345,
  "started_at": "2026-04-01T12:00:00Z",
  "pipeline_step": "phase-loop",
  "phase_step": "execute",
  "phase_id": 3,
  "lock_acquired_at": "2026-04-01T12:15:00Z"
}
```

### Lock lifecycle

1. **Acquire on `/lu` start:** Write lock file with PID and timestamp.
2. **Update on step transition:** Update `pipeline_step` and `phase_step` fields.
3. **Release on clean exit:** Delete lock file.
4. **Stale lock detection on next start:** If lock file exists:
   - Check if PID is still running (`kill -0 $PID 2>/dev/null`)
   - If PID dead: stale lock from crash. Read lock to determine crash point.
   - If PID alive: another `/lu` session is running. Warn and exit.

### Why a separate lock file (not state.json)?

1. **Frequency:** Lock file is updated on every sub-step transition (~20 times per phase). state.json is updated on state machine transitions (~5 times per phase). Separating them reduces write contention.

2. **Atomicity:** Lock file is small (< 200 bytes). Atomic write is reliable. state.json can be > 10KB. Larger files have higher partial-write risk.

3. **Semantics:** Lock file answers "is a session running and where is it?" State file answers "what is the workflow's complete context?" Different questions, different files.

4. **Cleanup:** Lock file is deleted on clean exit. state.json persists across sessions.

## Recovery Algorithm (Complete)

```
ON /lu START:
  1. Check for lock file (.planning/.pipeline-lock.json)

  IF lock exists:
    a. Check PID liveness: kill -0 $LOCK_PID
    b. IF PID alive:
       - "Another /lu session (PID $LOCK_PID) is running."
       - "Use --force to override, or wait for it to complete."
       - EXIT (unless --force)
    c. IF PID dead (stale lock = CRASH):
       - Read lock: { pipeline_step, phase_step, phase_id }
       - Read state.json: full context
       - Run deterministic recovery:
         i.   Check git status (uncommitted changes?)
         ii.  Check PLAN.md existence for current phase
         iii. Check harness-result.json for current phase
         iv.  Check git log for phase commit
       - Compute RecoveryAction (deterministic, no LLM)
       - Print recovery briefing:
         "Recovering from crash at step: {pipeline_step}/{phase_step}"
         "Phase {phase_id}: {recovery_action}"
         "Resuming from: {resume_point}"
       - Acquire new lock with new PID
       - Jump to resume point in pipeline

  IF no lock:
    a. Fresh start
    b. Acquire lock
    c. Continue normal pipeline

  ON each step transition:
    - Update lock file: pipeline_step, phase_step
    - Update state.json pipeline_position (via bridge)

  ON clean exit:
    - Delete lock file
    - Update state.json (final state)
    - Generate STATE.md snapshot
```

## How Structured State (Learning 9) Enables This

Without Learning 9, crash recovery cannot be deterministic because:

| Without structured state                                                    | With structured state (Learning 9)                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Pipeline position stored in /tmp (volatile)                                 | Pipeline position in state.json (persistent)                             |
| Phase sub-step unknown (state.json says "executing" but not which sub-step) | `pipeline_position.current_phase_step` says exactly which sub-step       |
| Verification results in prose VERIFICATION.md (requires LLM to interpret)   | `verification_results[]` in state.json (JSON parse, deterministic)       |
| Git context in /tmp/lu-context.json (volatile)                              | `git_workflow` in state.json (persistent)                                |
| Recovery requires LLM to read STATE.md and infer position                   | Recovery reads JSON fields and makes deterministic switch/case decisions |

**Learning 9 is a hard prerequisite for Learning 10.** Without structured state, the recovery algorithm cannot be implemented as deterministic TypeScript -- it would still require LLM interpretation, which defeats the purpose.

## Constraints from Claude Code Runtime

1. **No process persistence.** Claude Code sessions can be interrupted by the user (Ctrl+C), by IDE restart, by system sleep, or by context window exhaustion. There is no graceful shutdown hook. The lock file + state.json approach handles all of these because the lock becomes stale and the state on disk is the recovery source.

2. **No background processes.** We cannot run a watchdog or heartbeat. Stale lock detection relies on PID checking, which works for local development but not for remote/cloud scenarios. For Luca's target use case (solo developer, local machine), PID checking is sufficient.

3. **Context window exhaustion is a crash.** When Claude Code hits the context limit, the session ends abruptly. The orchestrator (LLM) cannot execute cleanup code. Lock file persistence on disk is the only recovery mechanism. This is the most common "crash" scenario in practice.

4. **The orchestrator IS the LLM.** In GSD2, the orchestrator is TypeScript code that runs deterministically. In Luca, the orchestrator is an LLM executing lu.skill.ts as a prompt. This means the recovery algorithm described above must be expressed as structured instructions in the prompt, not as TypeScript code. The LLM follows the algorithm, but it follows it as a prompted instruction, not as compiled code.

   **This is the fundamental constraint.** We can make recovery MOSTLY deterministic by:
   - Making the recovery decision in TypeScript (a pre-step hook or bridge command)
   - Passing the recovery action as a flag to the LLM orchestrator
   - The LLM only needs to "jump to step X" based on the flag

   ```bash
   # Recovery decision made in TypeScript (deterministic)
   RECOVERY=$(bun src/recovery/recover.ts 2>/dev/null || echo '{"action":"fresh-start"}')
   RESUME_STEP=$(echo "$RECOVERY" | bun -e "..." )
   # LLM receives structured instruction, not ambiguous state
   echo "Recovery action: resume from step $RESUME_STEP"
   ```

5. **Agent() calls are the unit of recovery.** Each Agent() call either completes fully or crashes. There is no "partial agent completion." This simplifies recovery: if the last completed Agent() call is known (from the lock file), the next Agent() call is the resume point.

## Implementation Approach

### Phase 1: Lock file + pipeline position tracking

1. Add `pipeline_position` to `WorkflowContext` schema (Learning 9 Phase 1)
2. Create `.planning/.pipeline-lock.json` on `/lu` start
3. Update lock file at each step transition in lu.skill.ts
4. Add stale lock detection at `/lu` start
5. Add `--force` flag to override stale locks

### Phase 2: Deterministic recovery function

1. Create `src/recovery/recover.ts` -- pure TypeScript recovery logic
2. Reads: lock file, state.json, git status, filesystem (PLAN.md, etc.)
3. Returns: `RecoveryAction` (structured JSON)
4. Called by lu.skill.ts Step 1 via `bun src/recovery/recover.ts`
5. Recovery action passed to LLM as a structured instruction

### Phase 3: Recovery briefing

1. `recover.ts` also generates a recovery briefing (structured, not prose)
2. Briefing includes: what crashed, what was lost, what will be re-run
3. Briefing is printed to the user and passed to the cognitive pre-flight agent
4. MuninnDB session context updated with crash context

### Integration with existing bridge commands

| Command                        | Change                                               |
| ------------------------------ | ---------------------------------------------------- |
| `luca-bridge ensure-init`      | Also creates lock file if not present                |
| `luca-bridge suspend`          | Updates lock file with suspend metadata              |
| `luca-bridge resume-phase`     | Updates lock file with resume metadata               |
| New: `luca-bridge recover`     | Runs recovery algorithm, returns RecoveryAction JSON |
| New: `luca-bridge lock-status` | Returns lock file contents or "unlocked"             |

## Risks and Tradeoffs

### Risk: Lock file corruption

**Scenario:** Crash during lock file write leaves corrupted JSON.
**Mitigation:** Use write-then-rename pattern (write to `.pipeline-lock.tmp`, then `rename` to `.pipeline-lock.json`). Bun supports this via `Bun.write` + `fs.renameSync`.
**Fallback:** If lock file is unreadable, treat as no lock (fresh start).

### Risk: PID reuse

**Scenario:** OS reuses the PID after the original process dies. Lock check says "still running" but it's a different process.
**Mitigation:** Check PID AND creation timestamp. If the lock is > 24 hours old, treat as stale regardless of PID status.
**Decision:** Accept. PID reuse within a short time window is extremely unlikely on modern systems.

### Risk: Over-engineering for a solo developer tool

**Scenario:** Crash recovery adds complexity for a scenario that rarely happens.
**Counter:** Context window exhaustion is the most common failure mode. It happens regularly during COMPLEX+ phases. Every unrecoverable crash costs the user 30-60 minutes of re-setup. The lock file + deterministic recovery is ~200 lines of TypeScript and saves significant user time.
**Decision:** Adopt. The cost is low and the benefit is high for the primary failure mode.

### Risk: LLM orchestrator ignores recovery instructions

**Scenario:** The LLM in lu.skill.ts receives "resume from step execute" but decides to start from preflight anyway.
**Mitigation:** Make recovery instructions unambiguous. Use `## RECOVERY MODE` header in the prompt. Provide explicit step number. Skip impossible steps (e.g., "Step 2: SKIP (completed)"). Test with real crash scenarios.
**Decision:** Accept. The risk is real but mitigated by clear prompt structure. The alternative (LLM interprets ambiguous state) is strictly worse.

## Recommendation

Adopt deterministic crash recovery in three phases:

**Phase 1 (lock file + position tracking):** Low cost, immediate value. Even without the full recovery algorithm, the lock file prevents concurrent `/lu` sessions (a current failure mode) and the position tracking provides debugging visibility.

**Phase 2 (recovery algorithm):** Requires Learning 9 Phase 1 (pipeline_position in state.json) as a prerequisite. This is the core value: crash -> restart -> deterministic resume from last known good point.

**Phase 3 (recovery briefing):** Nice-to-have. The briefing provides context for the cognitive pre-flight agent, improving the quality of the resumed session.

The most impactful single change is adding the lock file (Phase 1). It prevents a class of failures (concurrent sessions) that currently cause data corruption, and it establishes the foundation for deterministic recovery.
