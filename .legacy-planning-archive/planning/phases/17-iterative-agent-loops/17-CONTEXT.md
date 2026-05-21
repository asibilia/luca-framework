---
phase: 17
title: Iterative Agent Loops (Ralph Wiggum)
status: locked
created: 2026-02-11
---

# Phase 17 Context: Iterative Agent Loops

Decisions locked during `/lu-discuss-phase 17`. These guide research and planning — downstream agents should not re-ask these questions.

---

## Decision 1: Loop Scope & Granularity

### Multiple targeted loops, not a single outer loop

Phase 17 implements **two distinct loop points** in the execution pipeline:

- **Loop A (Harness Loop):** After harness run. Handles mechanical failures (test failures, type errors, lint errors, build errors). Replaces the existing Step 6.6 failure-to-fix loop with the new unified loop controller.
- **Loop B (Verify Loop):** After lu-verifier. Handles semantic gaps (plan objectives not met, requirements not satisfied). New loop point. Operates at **per-plan granularity** — verifier identifies which plan(s) have gaps, and only those plans get re-executed with gap-targeted instructions.

### Orchestrator-only iteration control

All iteration is controlled by lu-execute-phase (the orchestrator). Agents are stateless — they execute once and return a result envelope. The orchestrator decides whether to re-invoke. No agent self-loops.

This aligns with the Ralph Wiggum principle: **external control, not LLM self-assessment**.

### Step 6.6 is replaced, not extended

The existing Step 6.6 failure-to-fix loop is **replaced** by the new unified loop controller. The loop controller is a general-purpose module that handles both Loop A and Loop B. Step 6.6 becomes an instance of the loop controller configured for harness failures.

### Gap granularity is per-plan (requires verifier enhancement)

When the verifier finds gaps, it identifies which plan(s) are responsible. The loop controller generates targeted fix instructions for those specific plans and re-executes only them. Other plans are not re-executed.

**Prerequisite:** The current lu-verifier outputs overall pass/fail with a list of gaps but does NOT attribute gaps to specific plans. Phase 17 must enhance the verifier's gap output to include plan attribution — leveraging the Specification Anchoring from Phase 14, which already maps plan objectives to must-haves. Each gap in the verifier output should include a `source_plan` field tracing it to the originating plan number.

---

## Decision 2: Checkpoint Strategy

### Git tags for state capture

Checkpoints use **lightweight git tags** with a naming convention:

```
iter/<phase>/<loop>/<iteration>
```

Example: `iter/17/harness/1`, `iter/17/verify/2`

Tags are cheap, don't create extra commits, and `git checkout <tag>` restores full state. Easy to prune.

### Checkpoint metadata in JSON files

Each checkpoint writes a metadata file to `.planning/checkpoints/<tag-name>.json` containing:

- Iteration number
- Harness/verifier result summary
- Error count and delta from previous iteration
- Agent statuses
- Timestamp

This enables the loop controller to make rollback decisions without re-running the harness.

### Rollback is full-iteration only

Rollback restores the entire state to the previous iteration's checkpoint. No per-plan partial rollback — if plan A succeeded but plan B failed within the same iteration, both get rolled back. The next iteration can selectively re-execute only the failed plan(s).

### Rollback authority follows mode

- **AFK mode:** Loop controller automatically rolls back when iteration N is worse than N-1
- **HITL mode:** Loop controller presents comparison and asks for human confirmation before rollback

### Checkpoint pruning after phase completion

All iteration checkpoints for a phase are deleted once the phase passes verification. This keeps the git tag namespace clean. No checkpoints persist across phases.

---

## Decision 3: AFK vs HITL Boundaries

### Default mode is AFK (autonomous)

Loops run to completion without pausing by default. Human reviews results at the end. Best for background/overnight execution.

### Soft cost budget stop

When token budget reaches 80% threshold, the loop completes the current iteration but doesn't start a new one. This allows clean exit without partial work. The 80% threshold leaves headroom for the current iteration to finish.

### Mode configuration

Default mode is set in `.planning/config.json` under an `iteration` key. Overridable per-invocation with `--mode=afk|hitl` flag. Persistent preference with escape hatch.

### HITL pause options

When the loop pauses in HITL mode, the human gets four choices:

1. **Continue** — Proceed to next iteration
2. **Rollback** — Revert to previous checkpoint and retry (optionally with different instructions)
3. **Abort** — Stop the loop entirely, keep current state
4. **Skip** — Skip the current loop point and move to the next pipeline step (e.g., skip remaining harness-fix iterations, proceed to verify loop)

---

## Decision 4: Convergence & Error Semantics

### Multi-signal composite convergence detection

Convergence (no-progress) is detected using three signals:

1. **Error count delta** — Did total errors decrease?
2. **Error fingerprint overlap** — Did the set of errors (hashed by file:line:message) change?
3. **Artifact change delta** — Did any files actually change?

If **2 of 3 signals** show no progress, the iteration is declared "stale." After **2 consecutive stale iterations**, the loop declares convergence failure and halts (or escalates in HITL mode).

### Rule-based error classification

Errors are classified by source, not by LLM judgment:

| Source                 | Class       | Behavior                     |
| ---------------------- | ----------- | ---------------------------- |
| Test failures          | Correctable | Retry with error context     |
| Type errors            | Correctable | Retry with error context     |
| Lint errors            | Correctable | Retry with error context     |
| Build failures         | Transient   | Retry (may be intermittent)  |
| Network/timeout        | Transient   | Retry with backoff           |
| Verifier semantic gaps | Correctable | Retry with gap-targeted plan |
| Missing dependency     | Permanent   | Skip, continue on remaining  |
| Circular import        | Permanent   | Skip, continue on remaining  |

**Promotion rule:** If a correctable error persists unchanged for 3 iterations, it is promoted to permanent.

### Permanent errors: skip and continue

When a permanent error is detected, it is marked as "known permanent" and excluded from convergence calculations. The loop continues iterating on remaining correctable/transient errors. This prevents one intractable error from blocking all other fixes.

Permanent errors are captured in the iteration history for learning extraction.

### Iteration history: summary level

Each iteration records:

- Iteration number
- Error count (total and delta from previous)
- Status: `improved` | `stalled` | `regressed`
- Duration (ms)
- Which agent was invoked
- Checkpoint tag name

This is sufficient for convergence detection and basic learning capture without excessive verbosity.

---

## Decision 5: Implementation Form

### TypeScript module at `src/iteration/` — decision-support utilities, not a standalone loop

The `src/iteration/` module provides **decision-support functions** that Claude calls via CLI during the loop, consistent with how `src/harness/runner.ts` works today. **Claude following the lu-execute-phase skill IS the loop controller** — the skill describes the loop protocol, and Claude calls these utilities for convergence checks, error classification, checkpoint management, and budget tracking.

The module provides CLI-callable utilities:

- `convergence.ts` — takes two error arrays, returns `stale | improved | regressed`
- `classifier.ts` — takes harness errors, returns classified errors with `transient | correctable | permanent`
- `checkpoint.ts` — creates/rollbacks git tags, writes/reads JSON metadata
- `budget.ts` — tracks iteration costs, returns `under_budget | soft_stop | exceeded`
- `types.ts` — Zod schemas for all iteration types
- `index.ts` — public API barrel export

This is NOT a standalone loop program that tries to orchestrate agents. The skill orchestrates; the module provides the intelligence for decisions.

### Iteration limits stay in ComplexityGate

`ComplexityGate.harnessFixIterations` keeps defining the iteration **limits** (how many). A new `verifyFixIterations` field is added alongside it. The `src/iteration/` module defines the iteration **behavior** (convergence, checkpoints, mode, budget).

### verifyFixIterations defaults (lower than harness)

Semantic gaps (Loop B) are harder to auto-fix than mechanical failures (Loop A) and more expensive per iteration. Verify loop limits are intentionally lower:

| Level    | harnessFixIterations (existing) | verifyFixIterations (new) |
| -------- | ------------------------------- | ------------------------- |
| TRIVIAL  | 1                               | 0                         |
| SIMPLE   | 2                               | 1                         |
| MODERATE | 3                               | 1                         |
| COMPLEX  | 3                               | 2                         |
| CRITICAL | 5                               | 3                         |

TRIVIAL gets 0 verify iterations — if the verifier finds gaps at TRIVIAL complexity, something is fundamentally wrong and iteration won't help.

---

## Deferred Ideas

_(Captured during discussion, not in Phase 17 scope)_

- **Agent self-loops with orchestrator approval** — Agents could signal "I think I need another pass" via result envelope metadata, orchestrator decides. Deferred to future enhancement.
- **Per-plan partial rollback** — Surgical rollback of individual plans within a wave. Requires cross-plan file conflict resolution. Deferred to future enhancement.
- **LLM-assisted error classification** — Use a lightweight LLM to classify ambiguous errors. Adds cost and contradicts external-control principle. Deferred.
- **Code review loop (Loop C)** — Make code review findings actionable with retry loop. Currently review is informational only. Deferred to future enhancement.

---

## Requirements Mapping

| Requirement | Decision(s) | Key Choice                                                                                         |
| ----------- | ----------- | -------------------------------------------------------------------------------------------------- |
| ITER-01     | D1, D5      | Decision-support utilities in src/iteration/, skill orchestrates loop, replaces Step 6.6           |
| ITER-02     | D4          | Multi-signal composite (error count + fingerprint + artifact delta), 2-stale threshold             |
| ITER-03     | D5          | Limits stay in ComplexityGate (harnessFixIterations + new verifyFixIterations with lower defaults) |
| ITER-04     | D2          | Git tags + JSON metadata in .planning/checkpoints/, full-iteration rollback, prune after phase     |
| ITER-05     | D4          | Rule-based classification (transient/correctable/permanent), 3-iteration promotion to permanent    |
| ITER-06     | D3          | Soft stop at 80% budget, finish current iteration, don't start new one                             |
| ITER-07     | D3          | Default AFK, config file + flag override, HITL offers Continue/Rollback/Abort/Skip                 |

---

## Refinements (post-research)

Added after comparing against the actual Ralph Wiggum plugin documentation and Ralph Orchestrator. These clarify implementation details without changing locked decisions.

### R1: Module provides decision-support, skill orchestrates the loop

The `src/iteration/` module is NOT a standalone loop controller that spawns agents. Claude following the lu-execute-phase skill IS the loop controller — the same way Claude currently runs Step 6.6 by following skill instructions. The TypeScript module provides CLI-callable utilities (convergence detection, error classification, checkpoint management, budget tracking) that Claude invokes during the loop. This mirrors how `src/harness/runner.ts` works today.

### R2: Verifier gap-to-plan attribution

Loop B requires the verifier to attribute gaps to specific plans (via `source_plan` field). The current verifier doesn't do this. Phase 17 planning must include a verifier enhancement leveraging the existing Specification Anchoring (Phase 14) which already maps plan objectives to must-haves.

### R3: verifyFixIterations lower than harnessFixIterations

Semantic gaps are harder and more expensive to auto-fix than mechanical failures. Defaults are intentionally asymmetric (see Decision 5 table). TRIVIAL gets 0 verify iterations — if gaps exist at TRIVIAL, iteration won't help.

---

_Context locked: 2026-02-11_
_Refinements added: 2026-02-11 (post-research, pre-planning)_
