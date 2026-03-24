# Backlog Integration Decisions

**Date:** 2026-03-24
**Status:** Active
**Applies to:** v2 pipeline sequencing relative to runtime architecture (Phases A-E)

## Decision 1: v2-phase-6 orchestrator integration lands AFTER Phase A DAG engine

- **Question:** Does v2-phase-6 (wire v2 pipeline into lu.skill.ts) land before or after the DAG engine?
- **Decision:** AFTER. v2-phase-6 will wire the v2 pipeline into the DAG definition instead of modifying lu.skill.ts prose directly.
- **Rationale:** v2-phase-6 modifies `src/skills/luca/lu.skill.ts`. Phase A's DAG engine makes lu.skill.ts a compilation output. If v2-phase-6 lands first, those modifications become throwaway when the DAG engine replaces the prose orchestrator. By waiting, v2-phase-6 becomes "define the v2 pipeline as a DAG variant" — work that persists.
- **Impact on v2-phase-6 todo:** Update the todo to target `src/workflow/__helpers/` (DAG step definitions) instead of `src/skills/luca/lu.skill.ts`. The v2 pipeline becomes a DAG branch (e.g., `workflow.version: "v2"` selects a different DAG definition with research/review/graduate steps).
- **Risk:** Delays v2-phase-6 delivery by 2-3 weeks (Phase A duration).
- **Mitigation:** v2-phases-1-through-5 are agent-level enhancements that can proceed in parallel with Phase A. Only v2-phase-6 (orchestration wiring) is blocked.

## Decision 2: v2-phase-5 executor enhancement proceeds independently

- **Question:** Does v2-phase-5 (per-task MuninnDB recall) overlap with DAG step execution?
- **Decision:** No overlap. v2-phase-5 modifies agent-level behavior (`lu-executor.agent.ts` and `phase-execute.skill.ts`), not orchestration logic. It can proceed immediately, in parallel with Phase A.
- **Rationale:** Per-task recall is about what data the executor receives, not how the orchestrator dispatches work. The DAG executor will call the same lu-executor agent; the agent's internal recall logic is orthogonal.

## Decision 3: Migration coexistence strategy is feature-flag per-session

- **Question:** How do the legacy prose orchestrator and DAG engine coexist during transition?
- **Decision:** Feature flag in `.planning/config.json`: `"workflow": { "engine": "prose" | "dag" }`. Default is `"prose"`. The flag is read at session start and determines which orchestration path runs for the entire session. Both systems are NEVER active simultaneously in the same session.
- **Rationale:** Per-phase routing (DAG for some phases, prose for others) creates debugging nightmares when state gets out of sync. Per-session switching is clean: either the DAG engine drives the whole session, or the prose orchestrator does.
- **Implementation:** Add `workflow.engine` field to the config schema. The `/lu` entry point reads this field and dispatches accordingly. When `engine: "dag"`, the DAG executor is invoked. When `engine: "prose"`, the current lu.skill.ts prose orchestrator runs unchanged.
- **Transition plan:** Start with `"prose"` (default). Developer switches to `"dag"` to test. Once confident, change default to `"dag"`. Eventually remove prose path entirely.

## Decision 4: v2 config schema updates extend (not conflict with) DAG config

- **Question:** Do v2 config schemas (`v2-config-and-schema-updates.md`) conflict with DAG config?
- **Decision:** No conflict. They are additive. v2 adds `workflow.version: "v1" | "v2"` and `research` config section. The DAG engine adds `workflow.engine: "prose" | "dag"`. These are orthogonal: `workflow.version` controls which pipeline variant is used (v1 simple vs v2 with research), while `workflow.engine` controls whether orchestration is prose-based or DAG-based. Both fields coexist.

## Decision 5: Interleaved execution order

- **Question:** What is the recommended execution order?
- **Decision:**
  1. X01 + X02 (domain architecture docs + boundary check — immediate, 1 day)
  2. Phase A (DAG engine — 2-3 weeks)
  3. In parallel with Phase A: v2-phase-1 (researcher agents), v2-phase-2 (review loop), v2-phase-3 (MuninnDB graduation), v2-phase-5 (executor enhancement)
  4. Phase B (adapter architecture — 2-3 weeks, blocks on Phase A)
  5. v2-phase-6 (orchestrator integration — now targets DAG, blocks on Phase A)
  6. Phase C (eval framework — 1-2 weeks, can overlap Phase B)
  7. Phase E (additional adapters — 1 week each, blocks on Phase B)
  8. Phase D (Luca Studio — 2-3 weeks, blocks on Phase B + C)
