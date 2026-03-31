# State Machine Analysis

How the Luca state machine relates to workflow orchestration, and why it does NOT define topology.

## Summary

The state machine is a **runtime orchestrator** — it tracks what phase the workflow is in, what events have fired, and what transitions are legal. It does NOT define the topology (which agents exist, what stage they belong to, or how they connect). The topology is hardcoded separately in the observer.

## Architecture

### Source Files

| File                                                      | Purpose                                        |
| --------------------------------------------------------- | ---------------------------------------------- |
| `packages/luca-framework/src/state/machine.ts`            | Main XState machine definition                 |
| `packages/luca-framework/src/state/types.ts`              | Zod schemas for context, events, transitions   |
| `packages/luca-framework/src/state/guards.ts`             | 20 guard functions for conditional transitions |
| `packages/luca-framework/src/state/actions.ts`            | State mutation actions                         |
| `packages/luca-framework/src/state/actors/phase-actor.ts` | Phase execution child machine                  |
| `packages/luca-framework/src/state/bridge.ts`             | CLI bridge (15 subcommands)                    |
| `packages/luca-framework/src/state/persistence.ts`        | JSON persistence (`.planning/state.json`)      |
| `packages/luca-framework/src/state/snapshot.ts`           | STATE.md generation from context               |
| `packages/luca-framework/src/state/ledger.ts`             | Session audit trail                            |
| `packages/luca-framework/src/state/defaults.ts`           | Default complexity matrix                      |

## 14 Workflow States

| #   | State          | Description                                    | Terminal? |
| --- | -------------- | ---------------------------------------------- | --------- |
| 1   | **idle**       | Waiting for START event (5-min idle timeout)   | No        |
| 2   | **preflight**  | Cognitive pre-flight (MuninnDB recall)         | No        |
| 3   | **routing**    | Complexity classification via lu-router        | No        |
| 4   | **discussing** | Phase discussion (gated by complexity)         | No        |
| 5   | **planning**   | Plan creation and verification                 | No        |
| 6   | **executing**  | Phase execution with phase actor child machine | No        |
| 7   | **verifying**  | Harness + lu-verifier checks                   | No        |
| 8   | **learning**   | Pattern/decision/pitfall capture               | No        |
| 9   | **committing** | Git commit                                     | No        |
| 10  | **complete**   | Terminal success (can cooldown or reset)       | Yes       |
| 11  | **cooldown**   | Optional cooldown (5-min timeout)              | No        |
| 12  | **paused**     | Waiting for human intervention                 | No        |
| 13  | **suspended**  | Checkpoint-based suspension                    | No        |
| 14  | **failed**     | Terminal error (can reset)                     | Yes       |

### State Flow Diagram

```
idle → preflight → routing → discussing → planning → executing → verifying → learning → committing → complete
                                                          ↕                    ↕
                                                      suspended              paused
                                                                               ↓
                                                                            failed
```

## 23+ Workflow Events

### Session Control

| Event   | Description                   | Data                   |
| ------- | ----------------------------- | ---------------------- |
| `START` | Begin workflow                | ticket_id, config_path |
| `RESET` | Reset context, return to idle | —                      |
| `ABORT` | Abort current phase           | reason                 |
| `SKIP`  | Skip current step             | reason                 |

### Classification

| Event                | Description           | Data              |
| -------------------- | --------------------- | ----------------- |
| `PREFLIGHT_COMPLETE` | Pre-flight done       | intuition_flags[] |
| `ROUTE_COMPLETE`     | Complexity classified | complexity level  |

### Pipeline Phases

| Event                | Description     | Data                               |
| -------------------- | --------------- | ---------------------------------- |
| `DISCUSS_COMPLETE`   | Discussion done | summary                            |
| `PREMORTEM_COMPLETE` | Pre-mortem done | risks[], mitigations[], confidence |
| `PLAN_COMPLETE`      | Plan created    | plan_id                            |
| `PHASE_START`        | Phase started   | phase_id                           |
| `PHASE_COMPLETE`     | Phase succeeded | phase_id, summary                  |
| `PHASE_FAILED`       | Phase failed    | phase_id, error                    |

### Verification

| Event              | Description                     | Data                 |
| ------------------ | ------------------------------- | -------------------- |
| `HARNESS_COMPLETE` | Harness check done              | status, total_errors |
| `VERIFY_PASSED`    | Verification succeeded          | —                    |
| `VERIFY_FAILED`    | Verification failed             | gaps[]               |
| `VERIFY_HALTED`    | Verification halted by reviewer | reason               |

### Finalization

| Event                   | Description           | Data                       |
| ----------------------- | --------------------- | -------------------------- |
| `LEARN_COMPLETE`        | Learning capture done | learnings[]                |
| `PROCESS_DATA_COMPLETE` | Process metrics done  | tokens_used, wall_clock_ms |
| `COMMIT_COMPLETE`       | Git commit done       | commit_hash                |

### Pause/Resume

| Event               | Description           | Data                  |
| ------------------- | --------------------- | --------------------- |
| `RESUME`            | Resume from paused    | —                     |
| `SUSPEND`           | Create checkpoint     | reason, checkpoint_id |
| `RESUME_PHASE`      | Resume from suspended | checkpoint_id         |
| `COOLDOWN_COMPLETE` | Cooldown finished     | —                     |
| `SKIP_COOLDOWN`     | Skip cooldown, reset  | —                     |

## Phase Actor (Child Machine)

The `executing` state spawns a child machine that manages wave-based execution with harness verification loops.

### 7 Phase Actor States

| State               | Description                                        |
| ------------------- | -------------------------------------------------- |
| **idle**            | Waiting for PLAN_WAVE                              |
| **wave_executing**  | Wave of plan tasks being executed                  |
| **wave_evaluating** | Evaluating wave result                             |
| **phase_verifying** | Running harness verification                       |
| **phase_fixing**    | Fixing harness failures (within budget)            |
| **phase_done**      | Terminal success (outcome = "passed")              |
| **phase_blocked**   | Terminal failure (outcome = "blocked" or "failed") |

### 7 Phase Actor Events

| Event            | Description                 |
| ---------------- | --------------------------- |
| `PLAN_WAVE`      | Start next wave             |
| `WAVE_COMPLETE`  | Wave succeeded              |
| `WAVE_FAILED`    | Wave failed                 |
| `HARNESS_PASSED` | Harness verification passed |
| `HARNESS_FAILED` | Harness verification failed |
| `FIX_COMPLETE`   | Fix iteration succeeded     |
| `FIX_FAILED`     | Fix iteration failed        |

### Phase Actor Context

Tracks: `phase_id`, `plan_ids[]`, `current_wave`, `total_waves`, `wave_results[]`, `fix_iterations`, `max_fix_iterations`, `harness_passed`, `last_harness_errors[]`, `outcome`, `outcome_reason`, timestamps.

Output on completion: `{ phase_id, outcome: "passed" | "blocked" | "failed", outcome_reason }`

## 20 Guard Functions

Guards control conditional transitions. They read from workflow context.

### Complexity Gating Guards

| Guard                    | Purpose                              |
| ------------------------ | ------------------------------------ |
| `shouldRunResearch`      | Research step enabled for complexity |
| `shouldRunDiscussion`    | Discussion step not skipped          |
| `shouldRunUAT`           | UAT step enabled                     |
| `shouldCaptureLearnings` | Learning capture not skipped         |
| `shouldRunCodeReview`    | Code review agents list non-empty    |
| `shouldRunLearning`      | Learning depth >= "standard"         |

### Gate Config Guards

| Guard                | Purpose             |
| -------------------- | ------------------- |
| `gateEnabled(gate)`  | Named gate is true  |
| `gateDisabled(gate)` | Named gate is false |

### Oversight Guards

| Guard                | Purpose                        |
| -------------------- | ------------------------------ |
| `needsHumanApproval` | Oversight is "plan" or "phase" |
| `isFullAuto`         | Oversight is "full-auto"       |

### Budget & Iteration Guards

| Guard                  | Purpose                           |
| ---------------------- | --------------------------------- |
| `withinBudget`         | Iteration budget allows retry     |
| `canRetryVerification` | Attempts < max_attempts           |
| `appetiteWithinBudget` | Token context budget not exceeded |

### Other Guards

| Guard                           | Purpose                            |
| ------------------------------- | ---------------------------------- |
| `meetsComplexityThreshold(min)` | Meets minimum complexity           |
| `workflowConfigEnabled(key)`    | Workflow config key is true        |
| `hasMorePhases`                 | More phases to execute             |
| `hasCurrentPhase`               | current_phase is set               |
| `lastPhaseSucceeded`            | Last phase completed with "passed" |
| `shouldRunPremortem`            | Pre-mortem gate enabled            |
| `shouldRunProcessData`          | Process data gate enabled          |

## Bridge CLI (15 Subcommands)

The bridge provides a shell-friendly interface to the state machine, used by all skills and agents.

### 6 Read Commands

| Command                                                | Output                                 |
| ------------------------------------------------------ | -------------------------------------- |
| `read-status`                                          | Comprehensive workflow status JSON     |
| `read-complexity`                                      | `{ complexity: string }`               |
| `read-oversight`                                       | `{ oversight: string }`                |
| `read-phase`                                           | `{ phase_id, milestone, plan_ids }`    |
| `read-field --field=path`                              | Arbitrary context field via lodash get |
| `read-ledger [--tail=N] [--session=id] [--event=TYPE]` | Session ledger entries                 |

### 2 Write Commands

| Command                                 | Description                                                 |
| --------------------------------------- | ----------------------------------------------------------- |
| `set-field --field=name --value=json`   | Set allowlisted context field, persist, regenerate STATE.md |
| `transition --event=TYPE [--data=json]` | Send event, persist, update STATE.md atomically             |

### 5 Lifecycle Commands

| Command                            | Description                          |
| ---------------------------------- | ------------------------------------ |
| `ensure-init [--force]`            | Initialize state if not present      |
| `snapshot`                         | Generate STATE.md from current state |
| `gate-check --gate=name`           | Check if named gate enabled          |
| `suspend --phase=N [--reason=str]` | Create checkpoint, suspend           |
| `resume-phase --phase=N`           | Load checkpoint, resume              |

### 2 Observability Commands

| Command                                      | Description                       |
| -------------------------------------------- | --------------------------------- |
| `emit-event --type=eventType [--session=id]` | Fire-and-forget event to MuninnDB |
| `init-vault`                                 | Guided MuninnDB vault setup       |

## Dual-Write Pattern

Every state mutation writes to **both** the typed state machine and STATE.md:

1. **State machine** → `.planning/state.json` (full XState snapshot, typed)
2. **STATE.md** → `.planning/STATE.md` (human-readable, backward-compatible)

The snapshot generator preserves human-authored sections (Previous Milestones, Pending Todos, Next Actions, Project Reference, Blockers) while regenerating machine sections (Current Position, Session Identity, Progress, Git Context, Allowed Events).

## Mapping: 6 Pipeline Stages to Workflow States

| Pipeline Stage | Workflow State | Key Agent(s)                        | Entry Event                | Exit Event       |
| -------------- | -------------- | ----------------------------------- | -------------------------- | ---------------- |
| classify       | `routing`      | lu-router, lu-router-fast           | START → PREFLIGHT_COMPLETE | ROUTE_COMPLETE   |
| discuss        | `discussing`   | lu-discuss-researcher, lu-premortem | ROUTE_COMPLETE             | DISCUSS_COMPLETE |
| plan           | `planning`     | lu-planner, lu-plan-checker         | DISCUSS_COMPLETE           | PLAN_COMPLETE    |
| execute        | `executing`    | lu-executor, lu-test-writer         | PLAN_COMPLETE              | PHASE_COMPLETE   |
| verify         | `verifying`    | lu-verifier, code-architect, etc.   | PHASE_COMPLETE             | VERIFY_PASSED    |
| learn          | `learning`     | lu-learner, lu-process-data         | VERIFY_PASSED              | LEARN_COMPLETE   |

### Key Insight

The state machine maps 1:1 to the 6 pipeline stages but with additional states for lifecycle management (idle, paused, suspended, cooldown, failed, complete, committing, preflight). The observer topology shows only the 6 pipeline stages — the lifecycle states are not visible in the graph.

## Complexity Matrix

Each complexity level defines step activation and loop budgets (NOT which agents are present — all agents run at all levels).

| Parameter                    | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL   |
| ---------------------------- | ------- | ------ | -------- | ------- | ---------- |
| Cognitive preflight          | lite    | lite   | full     | full    | full       |
| Plan verification iterations | 1       | 1      | 1        | 2       | 3          |
| Harness fix iterations       | 1       | 2      | 2        | 2       | 3          |
| Verify fix iterations        | 1       | 1      | 1        | 1       | 2          |
| Verification mode            | quick   | quick  | standard | full    | full+human |

## Relationship to Observer Topology

**The state machine and observer topology are completely decoupled.**

- The state machine knows about states and transitions but not about which agents exist
- The observer topology knows about agents and stages but not about runtime state
- There is no shared data model between them
- The state machine doesn't define the pipeline — it tracks progress through it
- The topology is hardcoded in `workflow-topology.ts`; the state machine is in `packages/luca-framework/src/state/`

This decoupling means:

1. Adding an agent to the framework requires editing `workflow-topology.ts` separately
2. The observer cannot show real-time execution state (which state the machine is in)
3. The complexity matrix in the state machine defines different loop budgets, but the observer's complexity filter incorrectly hides agents instead of showing model tier changes
