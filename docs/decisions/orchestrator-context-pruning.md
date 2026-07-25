# Decision: Orchestrator context pruning & phase-boundary compaction

**Status:** accepted (STEP 1 of the trace-insights context-compaction work — luca-framework#318)
**Date:** 2026-07-17

## Context

A 7-day trace-insights audit found that the `/lu` orchestrator's **resident root
context is the single largest cost driver**. The finding converged across 5
independent outlier traces (both the framework repo and other repos):

- The orchestrator runs the whole milestone in **one continuous root turn** and
  never compacts. Completed-phase artifacts (`research.md`, `plan.md`,
  `verify.json`, `audits/*`, `learn.md`) plus every subagent's full return pile
  up in the root transcript and are **cache-read priced on every root turn**.
- On long runs the root context saturates near the top of its window (~370–500K
  tokens observed) and stays there for the whole run.
- No compaction subagent ever fires — **Claude Code exposes no programmatic
  compaction API**. `/compact` is a user command; auto-compact only fires near
  the context-window limit.

## Decision

Bound the resident context with two complementary mechanisms:

1. **Subagents return compact envelopes, not inlined payloads.** A subagent
   keeps its verbose work in its own context window; only a short summary should
   cross back into the root. The worst offender was the `researcher`, whose full
   findings were inlined into the orchestrator so it could write `research.md`.
   The researcher now **writes `research.md` itself** (the stage-gate hook permits
   that write in the `research` step — exactly how `verifier`/`reviewer`/`learner`
   already persist their artifacts) and returns only a 3–5 line summary. The
   orchestrator holds the summary, never the full findings.

2. **Yield at phase boundaries.** Because the pipeline's durable state lives in
   `.luca/state.json` (`pipelineStep`, `currentPhase`, `roadmap`) and each
   phase's artifacts are on disk, ending the turn at a phase boundary loses
   nothing mechanically — `/lu` Step 0 resumes phase N+1 from state. The only
   thing a turn boundary would drop is the **cognitive layer** (why decisions
   were made, open threads), which is rescued by the `lu-handoff` skill: it
   persists a `session:phase-boundary-handoff` memory to the repo MuninnDB vault
   and surfaces a preservation-steered `/compact` command. After the handoff the
   orchestrator yields; a `/compact` (human, or a future autonomous re-invoker)
   resets the transcript and the next `/lu` turn resumes with a small context.

## Rollout & migration

This replaces the earlier **manual "Prune Sub-Agent Output"** guidance
(phase-execute §5.2) and the non-canonical `.continue-here.md` suspend handoff
(phase-execute §4.5) — the latter wrote a path outside `LUCA_DIR_CONTRACT` that
the stage-gate hook rejects. Both now route through the durable, contract-legal
`lu-handoff` memory instead.

**Boundary yield is staged by oversight:**

- `checkpoint` / `human-in-loop` — the yield pairs with the existing post-`learn`
  pause; the human compacts and re-invokes `/lu`. **Live in STEP 1.**
- `full-auto` — the handoff memory is still persisted (durable recovery), but
  the loop continues in-turn because current source has **no autonomous
  re-invoker** (autopilot was dropped in `433c78080`, #290). Making full-auto
  also yield-and-resume requires restoring that outer loop — **tracked follow-up**
  (relates to the budget-guard work, luca-framework#319, which also needs a
  clean checkpoint-and-resume primitive).

## Consequences

- **Per-phase cost drops in every mode** from the researcher-envelope change
  (the largest single inlined payload is removed).
- **Multi-phase resident-context growth is bounded** in `checkpoint` /
  `human-in-loop` immediately; in `full-auto` once the re-invoker lands.
- The budget/duration guard (#319) and this work share one checkpoint/handoff
  primitive (`lu-handoff`) — see that issue and the trace-insights synthesis on
  #318 for the full build order.

## References

- luca-framework#318 (this work), #319 (budget guard), the trace-insights
  synthesis comment on #318.
- `packages/luca-tools/src/artifacts/skills/lu-handoff/index.ts` — the shared
  handoff primitive (STEP 0).
