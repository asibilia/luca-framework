# Requirements — v9.0.0 Workflow Pipeline Redesign

## Overview

Redesign the `/lu` end-to-end pipeline to restore lost capabilities and apply GSD2 learnings, making the workflow complete, convergence-aware, and crash-resilient. All requirements trace to the definitive spec at `docs/research/workflow-redesign/06-final-workflow.md` and the binding decision log (D1-D15).

---

## Foundation (FOUND)

| ID       | Requirement                                                                                                                                                              | Priority |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| FOUND-01 | Add `pipeline_position`, `git_workflow`, `token_profile`, and `schema_version` fields to `WorkflowContext` in `src/state/types.ts`, with Zod schemas and typed defaults  | v1       |
| FOUND-02 | Migrate pipeline position tracking from `/tmp/lu-context.json` to `state.json` so crash recovery can read structured position data instead of ephemeral temp files       | v1       |
| FOUND-03 | Eliminate STATE.md entirely: remove all generation code, remove all reads/greps across skills and agents, delete the file, and remove the `snapshot` bridge command (D9) | v1       |
| FOUND-04 | Update `luca-bridge read-status` to serve as the sole human-readable state inspection interface, returning a formatted JSON summary from `state.json`                    | v1       |
| FOUND-05 | Migrate all skills/agents that grep or read STATE.md to use `luca-bridge` read commands instead                                                                          | v1       |

## Classification (CLASS)

| ID       | Requirement                                                                                                                                                                                                                                            | Priority |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| CLASS-01 | Create `src/complexity/__helpers/classify.ts` as a deterministic TypeScript heuristic that scores task complexity from input signals (task count, file count, keyword scan, dependency count) and returns `{ complexity, route, score, signals }` (D1) | v1       |
| CLASS-02 | Provide a CLI entry point for `classify.ts` so the orchestrator can invoke it via `bun src/complexity/__helpers/classify.ts --description=... --roadmap=... --history=...` without an Agent() call                                                     | v1       |
| CLASS-03 | Eliminate both session-level and per-phase classify Agent() calls from `lu.skill.ts`, replacing them with the deterministic CLI invocation                                                                                                             | v1       |
| CLASS-04 | Create routing history schema (`.planning/routing-history.jsonl`) and append an entry after each phase completion in Step 5q with fields: timestamp, phase, initial/final complexity, succeeded, stalled, iteration counts, task/file counts, keywords | v1       |
| CLASS-05 | Implement adaptive adjustment function that reads routing history (20-entry window or current milestone, whichever smaller) and adjusts complexity by at most 1 level up or down, with `--complexity` user override always taking precedence (D10)     | v1       |

## Lock File (LOCK)

| ID      | Requirement                                                                                                                                                                             | Priority |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| LOCK-01 | Create `.planning/.pipeline-lock.json` on `/lu` start (Step 0c) containing `session_id`, `pid`, `started_at`, `pipeline_step`, `phase_step`, `phase_id`, and `lock_acquired_at`         | v1       |
| LOCK-02 | Update the lock file at every step transition within `lu.skill.ts` (inline bash, not Agent() call) so that crash recovery can determine exact resume point                              | v1       |
| LOCK-03 | Detect stale locks on startup via PID liveness check and 24-hour staleness threshold; warn and exit if PID is alive (concurrent session prevention), allow override with `--force` flag | v1       |

## Token Profiles (PROF)

| ID      | Requirement                                                                                                                                                                                             | Priority |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| PROF-01 | Add `--profile=budget\|balanced\|quality` CLI flag to `/lu` with `balanced` as default, matching current behavior exactly (zero regression)                                                             | v1       |
| PROF-02 | Store the active token profile in `state.json` so it persists across crash recovery                                                                                                                     | v1       |
| PROF-03 | Implement `resolveModelWithProfile()` that applies profile-based tier modifiers (budget: demote 1 tier with protected agent list; quality: promote 1 tier) around the existing `resolveModelForAgent()` | v1       |
| PROF-04 | Apply profile-based loop budget multipliers (budget: 0.5x floor 1; balanced: 1.0x; quality: 2.0x) to complexity matrix iteration limits                                                                 | v1       |
| PROF-05 | Wire v2 research pipeline profile gating (budget: skip entirely; balanced: 2 researchers, no review loop; quality: full pipeline)                                                                       | v1       |
| PROF-06 | Print active profile at session start and warn if complexity is COMPLEX/CRITICAL with budget profile                                                                                                    | v1       |

## Verification (VERIF)

| ID       | Requirement                                                                                                                                                                                                                                                                           | Priority |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| VERIF-01 | Define `PhaseVerificationResultSchema` and `CriterionResultSchema` in `src/verification/__schemas/` with fields: phase, verdict, criteria_met, criteria_total, per-criterion results (criterion_id, description, met, evidence, gap, blocking), blocking_gaps, timestamp, duration_ms | v1       |
| VERIF-02 | Update `GOAL_VERIFY_PROMPT` so the verifier agent writes a structured `verification-result.json` file that the orchestrator reads mechanically for verdict (no prose parsing)                                                                                                         | v1       |
| VERIF-03 | Update the planner prompt to assign criterion IDs (SC-1, SC-2, ...) to success criteria in PLAN.md so verification can track convergence per criterion across iterations                                                                                                              | v1       |
| VERIF-04 | Implement deterministic milestone validation (Step 6a) that aggregates all `verification-result.json` files mechanically and produces a milestone-level verdict without LLM interpretation                                                                                            | v1       |

## Stuck Detection (STUCK)

| ID       | Requirement                                                                                                                                                                                                   | Priority |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| STUCK-01 | Wire existing `src/iteration/__helpers/classifier.ts` into the harness fix loop (Step 5i-b) to classify errors as transient, correctable, or permanent                                                        | v1       |
| STUCK-02 | Wire existing `src/iteration/__helpers/convergence.ts` into the harness fix loop (Step 5i-c) to compute convergence signals (fingerprint overlap, error count delta, artifact change delta, semantic overlap) | v1       |
| STUCK-03 | Wire existing `src/iteration/__helpers/stall-debate.ts` for stall evaluation (Step 5i-d) returning strategy: halt, retry_with_context_promotion, retry_with_error_focus, or retry_with_rollback               | v1       |
| STUCK-04 | Update `HARNESS_FIX_PROMPT` to accept only correctable errors (excluding permanent) and include convergence context from previous iterations                                                                  | v1       |
| STUCK-05 | Add verification-level convergence tracking to the outer implementation loop (Steps 5h-5k): compare failing criteria sets between iterations, invoke stuck detection when same criteria fail twice            | v1       |
| STUCK-06 | Wire git checkpoint tags for rollback support in the harness fix loop (Step 5i-d retry_with_rollback strategy)                                                                                                | v1       |

## Ceremony (CEREM)

| ID       | Requirement                                                                                                                                                                                                                         | Priority |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| CEREM-01 | Create `src/process-data/compute.ts` as a mechanical TypeScript module that reads context metrics from `state.json`, computes aggregates (duration, error rates, convergence stats), and writes results back — zero LLM tokens (D5) | v1       |
| CEREM-02 | Replace the process-data Agent() call in `lu.skill.ts` with a deterministic `bun src/process-data/compute.ts --context=state.json` invocation (Step 5o)                                                                             | v1       |
| CEREM-03 | Make configure step inline in `lu.skill.ts` (read config.json, set shell variables, resolve profile settings) with no Agent() call (D6)                                                                                             | v1       |
| CEREM-04 | Change the orchestrator from 1 Agent() per plan to 1 Agent() per wave (per-wave execution model) with context assembled fresh before each wave Agent() call                                                                         | v1       |

## Context (CTXT)

| ID      | Requirement                                                                                                                                                                                                                                      | Priority |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| CTXT-01 | Define a `PhaseContextPayload` schema and implement fresh context assembly before each Agent() dispatch, with the orchestrator reading no more than 2K tokens per dispatch preparation (D11)                                                     | v1       |
| CTXT-02 | Define context tiers per agent type: Full (lu-executor, lu-planner), Scoped (lu-verifier, code reviewers), Minimal (harness checker) — with lu-discuss-researcher and lu-learner keeping their current context approach (not minimal, per D2/D4) | v1       |
| CTXT-03 | Update all prompt templates in `agent-prompts.ts` to accept an `inlinedContext` parameter for tier-appropriate context injection                                                                                                                 | v1       |

## Task Sizing (SIZE)

| ID      | Requirement                                                                                                                                                                             | Priority |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| SIZE-01 | Update the planner prompt to require per-task metadata: file count estimate, scope classification (SMALL/MEDIUM/LARGE), and split marker for LARGE tasks                                | v1       |
| SIZE-02 | Update the planner prompt to require per-wave metadata: total file count < 10, wave dependency declarations                                                                             | v1       |
| SIZE-03 | Add a 7th verification dimension (task sizing) to `lu-plan-checker`: flag BLOCKER if any task touches 10+ files, flag WARNING if no file count estimate, validate wave total < 10       | v1       |
| SIZE-04 | Implement overflow detection in the executor: if agent detects context exhaustion mid-wave, output `OVERFLOW:{task-id}` and the orchestrator spawns a fresh Agent() for remaining tasks | v1       |

## Drift Detection (DRIFT)

| ID       | Requirement                                                                                                                                                                                                       | Priority |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| DRIFT-01 | Implement mechanical drift check after every phase (Step 5q+): git diff for changed files, compare against file references in remaining phases, check for deleted/renamed modules, check dependency graph changes | v1       |
| DRIFT-02 | Create `REASSESS_PROMPT` template and add `lu-reassessor` agent type (ROUTER preset) that evaluates remaining phases as VALID, NEEDS_UPDATE, REDUNDANT, or BLOCKED when mechanical drift is detected              | v1       |
| DRIFT-03 | Implement drift response logic in the orchestrator: mark redundant phases complete, apply updates per oversight mode, park blocked phases, cascade dependency checks, rebuild execution order if needed           | v1       |
| DRIFT-04 | Record drift events in `session-ledger.jsonl` and emit `DRIFT_DETECTED` bridge transition with affected phase metadata                                                                                            | v1       |
| DRIFT-05 | Implement infrastructure file ignore list (tsconfig.json, package.json) unless structural changes are detected                                                                                                    | v1       |

## Recovery (RECOV)

| ID       | Requirement                                                                                                                                                                                                                                                                           | Priority |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| RECOV-01 | Create `src/recovery/recover.ts` with a deterministic recovery algorithm that reads lock file, state.json, git status, and filesystem to produce a `RecoveryAction` JSON: `{ action: "fresh-start" \| "restart-step" \| "resume-phase" \| "advance-phase", step?, phase?, briefing }` | v1       |
| RECOV-02 | Integrate recovery into `lu.skill.ts` Step 0b: if stale lock detected, run recovery module and jump to the resume point (skip completed steps) instead of interpreting state via LLM                                                                                                  | v1       |
| RECOV-03 | Add `luca-bridge recover` command that runs `recover.ts` and returns structured JSON, and `luca-bridge lock-status` that returns lock file contents or "unlocked"                                                                                                                     | v1       |
| RECOV-04 | Persist convergence state (error ledger, stale count, checkpoint tags) in a recoverable location so crash recovery can resume mid-harness-loop                                                                                                                                        | v1       |

## Cross-Milestone (CROSS)

| ID       | Requirement                                                                                                                                                                                  | Priority |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| CROSS-01 | Implement full state reset between milestones (Step 7): release and re-acquire lock, reset routing history, reset pipeline position, archive milestone data to `milestones/` directory (D12) | v1       |
| CROSS-02 | Preserve `session_id` and `git_workflow` fields across milestone reset while clearing all other `state.json` context fields                                                                  | v1       |
| CROSS-03 | Enforce safety limit of maximum 3 milestones per session and require previous milestone to have completed cleanly before cross-milestone continuation                                        | v1       |

## Orchestrator (ORCH)

| ID      | Requirement                                                                                                                                                                                                                                                                                                           | Priority |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| ORCH-01 | Rewrite the `lu.skill.ts` pipeline to incorporate all changes from this milestone: deterministic classification, lock file lifecycle, token profiles, per-wave execution, fresh context assembly, structured verification reads, stuck detection wiring, mechanical process data, drift detection, and crash recovery | v1       |
| ORCH-02 | Implement the oversight gate matrix from Section 6 of the spec: gate behavior varies by oversight mode (full-auto, flagged, milestone, phase) and token profile at each decision point                                                                                                                                | v1       |
| ORCH-03 | Implement budget matrix from Section 7: base iteration limits by complexity, profile multipliers, task sizing limits (not profile-modified), and convergence overrides that can extend or shorten loops beyond iteration counts                                                                                       | v1       |

---

## Traceability

| Requirement | Phase     | Status  |
| ----------- | --------- | ------- |
| FOUND-01    | Phase 258 | Pending |
| FOUND-02    | Phase 258 | Pending |
| FOUND-03    | Phase 258 | Pending |
| FOUND-04    | Phase 258 | Pending |
| FOUND-05    | Phase 258 | Pending |
| CLASS-01    | Phase 258 | Pending |
| CLASS-02    | Phase 258 | Pending |
| CLASS-03    | Phase 258 | Pending |
| CLASS-04    | Phase 258 | Pending |
| CLASS-05    | Phase 258 | Pending |
| LOCK-01     | Phase 259 | Pending |
| LOCK-02     | Phase 259 | Pending |
| LOCK-03     | Phase 259 | Pending |
| PROF-01     | Phase 260 | Pending |
| PROF-02     | Phase 260 | Pending |
| PROF-03     | Phase 260 | Pending |
| PROF-04     | Phase 260 | Pending |
| PROF-05     | Phase 260 | Pending |
| PROF-06     | Phase 260 | Pending |
| VERIF-01    | Phase 261 | Pending |
| VERIF-02    | Phase 261 | Pending |
| VERIF-03    | Phase 261 | Pending |
| VERIF-04    | Phase 261 | Pending |
| STUCK-01    | Phase 262 | Pending |
| STUCK-02    | Phase 262 | Pending |
| STUCK-03    | Phase 262 | Pending |
| STUCK-04    | Phase 262 | Pending |
| STUCK-05    | Phase 262 | Pending |
| STUCK-06    | Phase 262 | Pending |
| CEREM-01    | Phase 263 | Pending |
| CEREM-02    | Phase 263 | Pending |
| CEREM-03    | Phase 263 | Pending |
| CEREM-04    | Phase 263 | Pending |
| CTXT-01     | Phase 264 | Pending |
| CTXT-02     | Phase 264 | Pending |
| CTXT-03     | Phase 264 | Pending |
| SIZE-01     | Phase 264 | Pending |
| SIZE-02     | Phase 264 | Pending |
| SIZE-03     | Phase 264 | Pending |
| SIZE-04     | Phase 264 | Pending |
| DRIFT-01    | Phase 265 | Pending |
| DRIFT-02    | Phase 265 | Pending |
| DRIFT-03    | Phase 265 | Pending |
| DRIFT-04    | Phase 265 | Pending |
| DRIFT-05    | Phase 265 | Pending |
| RECOV-01    | Phase 266 | Pending |
| RECOV-02    | Phase 266 | Pending |
| RECOV-03    | Phase 266 | Pending |
| RECOV-04    | Phase 266 | Pending |
| CROSS-01    | Phase 267 | Pending |
| CROSS-02    | Phase 267 | Pending |
| CROSS-03    | Phase 267 | Pending |
| ORCH-01     | Phase 268 | Pending |
| ORCH-02     | Phase 268 | Pending |
| ORCH-03     | Phase 268 | Pending |

---

## Decision Log (Binding)

These decisions are from the v9.0.0 brainstorming session and are BINDING. Do not deviate.

| ID  | Decision                                                                               | Status                   |
| --- | -------------------------------------------------------------------------------------- | ------------------------ |
| D1  | Classification becomes deterministic TypeScript heuristic (no Agent("classify") calls) | ACCEPTED                 |
| D2  | Discussion stays SEPARATE agent at all profiles -- NEVER fold into planning            | REJECTED (keep separate) |
| D3  | Keep ALL 4 code reviewers -- NEVER reduce to 2                                         | REJECTED (keep all 4)    |
| D4  | Learning capture stays LLM -- NEVER make mechanical                                    | REJECTED (keep LLM)      |
| D5  | Process data becomes mechanical TypeScript (no agent call)                             | ACCEPTED                 |
| D6  | Configure becomes inline (no agent call)                                               | ACCEPTED                 |
| D7  | Backlog WSJF stays LLM agent -- NEVER make deterministic                               | REJECTED (keep LLM)      |
| D8  | Research graduation stays separate -- NEVER merge into synthesis                       | REJECTED (keep separate) |
| D9  | STATE.md ELIMINATED ENTIRELY -- not derived, not on-demand, DELETED                    | ACCEPTED                 |
| D10 | Adaptive routing history with 1-level cap, 20-entry window                             | ACCEPTED                 |
| D11 | Orchestrator context read: 2K tokens max per agent dispatch                            | ACCEPTED                 |
| D12 | Cross-milestone: FULL STATE RESET between milestones                                   | ACCEPTED                 |
| D13 | Milestone bootstrap: inherit current flow as-is, do NOT redesign                       | ACCEPTED                 |
| D14 | Hook interaction: no changes needed                                                    | ACCEPTED                 |
| D15 | Reviewer context sharing: keep parallel/independent                                    | ACCEPTED                 |
