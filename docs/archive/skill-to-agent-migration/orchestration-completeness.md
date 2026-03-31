# Orchestration Completeness

End-to-end audit of all 5 orchestrators, comparing current implementation against the migration plan. Identifies coverage gaps, state transition mismatches, and robustness concerns.

---

## Critical Gaps (Must-Address Before Migration)

### 1. Fix Loop Nesting Constraint

**Current:** `phase-execute-verify` spawns `Task(lu-executor)` to fix harness/verify failures (up to 3 iterations).

**Problem:** An Agent() sub-agent CANNOT spawn Task(). The fix loop logic must be **hoisted to the orchestrator level** — the orchestrator runs Agent("harness"), reads result, and if failures exist, runs Agent("fix") then Agent("harness") again.

**Impact:** Both phase-execute and lu must implement fix loops inline.

### 2. Interactive verify-test Cannot Run in Sub-Agent

**Current:** `verify-test` presents tests to the user one at a time for interactive confirmation.

**Problem:** Agent() sub-agents run in isolation and **cannot interact with the user**. This step MUST remain inline in the main conversation or use a different mechanism.

**Impact:** verify orchestrator must handle verify-test as inline work, not an Agent() call.

### 3. Routing Branch Logic Missing from Migration Plan

**Current:** lu-route branches to 7+ non-phase-execute handlers (quick, pr-address, debug, session-plan, progress, project-new, milestone-new). Each path has post-routing verification and learning.

**Problem:** The migration pipeline (Steps 4-12) only shows the phase-execute path. All alternative routes must be preserved in the flat orchestrator.

### 4. Gap Closure Retry Loop Missing

**Current:** lu-phase-loop has a GAP_RETRIES loop — re-invoke `phase-plan --gaps` then `phase-execute --gaps-only` for failed phases.

**Problem:** Completely absent from migration plan. Must be inlined in the lu orchestrator.

### 5. Swarm/Parallel Phase Execution Incompatible

**Current:** lu-phase-loop uses `TeamCreate` + worktree isolation for parallel phase execution.

**Problem:** `TeamCreate` is a sub-agent spawning mechanism, so it faces the same nesting constraint when lu calls Agent() for phase execution. This feature likely needs to be **deferred or redesigned**.

### 6. Per-Phase Complexity Re-Classification Missing

**Current:** lu-phase-loop re-classifies complexity for EACH phase via `Task(lu-router)`.

**Problem:** Migration plan shows classification once (Step 5) but phases in the loop don't re-classify. Must add Agent("classify") call inside the phase loop.

### 7. Milestone-Complete Inlining

**Current:** lu-phase-loop calls `Skill(milestone-complete)` which has 5 sub-steps.

**Problem:** When lu runs milestone-complete, those 5 sub-steps must be either:

- (a) Flattened as 5 separate Agent() calls from lu, OR
- (b) milestone-complete runs as a single mega-agent doing all work without sub-agents

Some milestone sub-skills (milestone-learn, milestone-shadow-gate) themselves spawn Task() — nesting constraint applies.

---

## Coverage Matrix: lu Orchestrator

> **Reconciliation note:** All gaps identified below have been addressed in architecture.md's updated End-to-End Pipeline (Steps 1-15, with sub-steps 10a-10q). The "In Plan?" column references the corrected pipeline step numbers.

| Step                                     | Current                             | In Plan?                  | Status                                                    |
| ---------------------------------------- | ----------------------------------- | ------------------------- | --------------------------------------------------------- |
| Parse args, init context                 | INLINE                              | Steps 1-3                 | Covered                                                   |
| Cognitive pre-flight                     | Task() in lu-route AND lu-configure | Step 4                    | Covered (consolidated to single step)                     |
| Complexity classification + routing      | Task() in lu-route                  | Step 5                    | Covered                                                   |
| Routing decision (7+ branches)           | INLINE in lu-route                  | Step 6                    | **Covered** (route branch with non-phase-execute handler) |
| Non-phase-execute paths + verify + learn | lu.skill.ts Step 2                  | Steps 6a-6d               | **Covered**                                               |
| Configure session                        | lu-configure                        | Step 7                    | Covered                                                   |
| Bridge START/PREFLIGHT_COMPLETE          | Inside lu-configure                 | Step 7                    | **Covered** (bridge transitions in step 7)                |
| Backlog scan                             | lu-backlog                          | Step 8                    | Covered                                                   |
| Swarm roadmap revision (TeamCreate)      | Inside lu-backlog                   | Step 8                    | **Deferred** — serial scan only                           |
| Build execution order                    | INLINE in lu-phase-loop             | Step 9                    | Covered                                                   |
| Phase dependency check                   | INLINE in lu-phase-loop             | Step 10a                  | **Covered**                                               |
| Oversight gate (per-phase)               | INLINE in lu-phase-loop             | Step 10b                  | **Covered**                                               |
| Per-phase complexity re-classify         | Task(lu-router) per phase           | Step 10c                  | **Covered**                                               |
| Premortem gate resolution                | INLINE in lu-phase-loop             | Step 10d                  | **Covered**                                               |
| Discussion                               | Skill(phase-discuss)                | Step 10e                  | Covered                                                   |
| Plan existence check                     | INLINE in lu-phase-loop             | Step 10f                  | **Covered**                                               |
| Planning                                 | Skill(phase-plan)                   | Step 10g                  | Covered                                                   |
| Execution                                | Skill(phase-execute)                | Step 10h                  | Covered                                                   |
| Harness + fix loop                       | phase-execute-verify with Task()    | Step 10i                  | **Covered** (hoisted to orchestrator)                     |
| Goal-backward verification               | phase-execute-verify                | Step 10j                  | Covered                                                   |
| Code review (parallel)                   | phase-execute-review with Task()    | Step 10k                  | **Covered** (parallel Agent() from orchestrator)          |
| Learning capture                         | Task(lu-learner)                    | Step 10l                  | Covered                                                   |
| Process data gate                        | INLINE in lu-phase-loop             | Step 10m                  | **Covered**                                               |
| Gap closure retry loop                   | INLINE in lu-phase-loop             | Step 10p                  | **Covered**                                               |
| Park-and-continue strategy               | INLINE in lu-phase-loop             | Step 10q                  | **Covered**                                               |
| Milestone completion                     | Skill(milestone-complete)           | Step 11 (5 Agent() calls) | **Covered** (inlined as 11a-11e)                          |
| Cross-milestone loop                     | lu-phase-loop Step 6                | Step 12                   | **Covered**                                               |
| Gap detection audit                      | lu.skill.ts Step 6                  | Step 13                   | **Covered**                                               |

---

## Coverage Matrix: phase-execute

> **Reconciliation note:** All gaps addressed in architecture.md's updated standalone /phase-execute pipeline (Steps 1-13).

| Step                         | Current                                     | In Plan?       | Status                                           |
| ---------------------------- | ------------------------------------------- | -------------- | ------------------------------------------------ |
| Init context + model routing | INLINE                                      | Step 1         | Covered                                          |
| Phase start commit capture   | `git rev-parse HEAD`                        | Step 2         | **Covered**                                      |
| GitHub tracking verification | Gate check                                  | Step 3         | **Covered**                                      |
| Procedure replay check       | MuninnDB recall                             | Step 4         | **Covered**                                      |
| Wave execution               | Skill(phase-execute-waves)                  | Step 5         | Covered                                          |
| Harness + fix loops          | Skill(phase-execute-verify) with Task()     | Step 6         | **Covered** (hoisted fix loop)                   |
| Code review swarm            | Skill(phase-execute-review) with 4-5 Task() | Step 8         | **Covered** (parallel Agent() from orchestrator) |
| Learning capture             | Task(lu-learner)                            | Step 9         | Covered                                          |
| Process data                 | Task(lu-process-data) conditional           | Step 10        | **Covered**                                      |
| Bridge events                | 4 transitions                               | Steps 6, 9, 13 | **Covered**                                      |
| UAT                          | INLINE interactive                          | Step 11        | **Covered** (inline, interactive)                |
| Final commit                 | INLINE                                      | Step 13        | Covered                                          |

---

## Coverage Matrix: verify, milestone-complete, pr-address

### verify

| Step                                         | Gap?                                                            |
| -------------------------------------------- | --------------------------------------------------------------- |
| Extract deliverables                         | No                                                              |
| **Interactive testing (verify-test)**        | **CRITICAL** — requires user interaction, cannot run in Agent() |
| Diagnose — spawns Task(lu-debugger) parallel | **Nesting constraint**                                          |
| Review — spawns 5 reviewer Task()            | **Nesting constraint**                                          |

### milestone-complete

| Step                                         | Gap?                   |
| -------------------------------------------- | ---------------------- |
| Learn — spawns Task(lu-learner)              | **Nesting constraint** |
| Prune                                        | No (leaf work)         |
| Shadow gate — spawns Task(lu-shadow-scanner) | **Nesting constraint** |
| Archive                                      | No (leaf work)         |
| Finalize                                     | No (leaf work)         |

### pr-address

| Step                                                                  | Gap?                   |
| --------------------------------------------------------------------- | ---------------------- |
| Fetch                                                                 | No (leaf work)         |
| Validate — spawns reviewer Task()                                     | **Nesting constraint** |
| Debate — spawns Task()                                                | **Nesting constraint** |
| Fix — spawns Task(lu-planner) + Task(lu-executor) + Task(lu-verifier) | **Nesting constraint** |
| Learn — spawns Task(lu-learner)                                       | **Nesting constraint** |
| Respond                                                               | No (leaf work)         |

---

## State Transition Gaps

The lu state machine goes `idle -> routed -> configured -> scanned -> executing -> complete` with no per-phase granularity. The migration plan adds steps (cognition, classify) between idle and routed that have no state machine events.

Options:

1. Add intermediate states to lu state machine
2. Steps 4-5 map to existing ROUTE_COMPLETE transition (compound step)
3. Track phase progress via context file only (outside state machine)

---

## Parallel Execution Opportunities

| Steps                           | Parallelizable? | Notes                                                                       |
| ------------------------------- | --------------- | --------------------------------------------------------------------------- |
| Multiple code reviewers         | **Yes**         | Orchestrator spawns 4-5 Agent() calls in parallel. Already proven pattern.  |
| Multiple debuggers              | **Yes**         | Same pattern as reviewers.                                                  |
| discuss + plan                  | No              | Planning depends on discussion.                                             |
| harness + verify                | No              | Semantic verify depends on harness pass.                                    |
| Phases at same dependency level | Complex         | Requires worktree isolation per agent. TeamCreate blocked. Likely deferred. |

---

## Error Recovery Assessment

| Scenario             | Current                            | After Migration                                        |
| -------------------- | ---------------------------------- | ------------------------------------------------------ |
| Sub-skill failure    | ABORT -> `failed`                  | Same — ABORT still works                               |
| Harness fix loop     | Task(lu-executor) inside sub-skill | **Must hoist to orchestrator**                         |
| Verify fix loop      | Task(lu-verifier) inside sub-skill | **Must hoist to orchestrator**                         |
| Phase parking        | Park-and-continue in lu-phase-loop | Must inline in lu orchestrator                         |
| Gap closure retry    | Re-invoke plan + execute           | Must inline in lu orchestrator                         |
| Session interruption | Context files + STATE.md persist   | Same — no explicit resume logic exists in either model |

---

## Agent Prompt Template Count

~30 unique prompt templates needed total (including reviewer variants). Most are shared between standalone and inline modes. Key divergences:

- **Loop control**: Standalone has no loop; inline lu has FOR loop
- **State tracking**: Standalone writes to own context file; inline writes to lu context
- **UAT**: Standalone includes UAT; inline may skip per config

---

## Sources

- `src/skills/luca/lu.skill.ts` — 194 lines, main entry
- `src/skills/luca/lu-phase-loop.skill.ts` — 708 lines, largest sub-skill
- `src/skills/general/phase-execute.skill.ts` — Phase execution
- `src/skills/general/phase-execute-verify.skill.ts` — Fix loops with Task() spawning
- `src/skills/general/phase-execute-review.skill.ts` — Reviewer swarm with Task()
- `src/skills/general/verify.skill.ts` — Verify orchestrator
- `src/skills/general/milestone-complete.skill.ts` — Milestone orchestrator
- `src/skills/general/pr-address.skill.ts` — PR handling orchestrator
