# Phase 231: v2 Orchestrator Integration — Summary

**Phase:** 231
**Wave:** 01
**Status:** Complete
**Complexity:** COMPLEX
**Date:** 2026-03-29

## Objective

Wire the v2 research pipeline into lu.skill.ts with conditional Agent() calls gated on `workflow.version: "v2"`.

## Changes

### Todo 1: research-config-schemas — Already Shipped

Both `research-config.schemas.ts` and `workflow-version.schemas.ts` were shipped in v6.0.0. Marked complete.

### Todo 2 + 4: Config Extensions + config.json Update

- Extended `lu-config.schemas.ts` with `workflow_version` field (imports WorkflowVersionSchema, default "v1")
- Added `"version": "v1"` to config.json workflow section
- Added top-level `"research"` section to config.json with all ResearchConfigSchema defaults
- complexity.schemas.ts v2 fields (researchReviewIterations, planReviewIterations) were already shipped

### Todo 3: v2 Pipeline Branch + Prompt Templates

- Added 6 v2 prompt templates to `agent-prompts.ts`:
  - RESEARCH_SCOPE_PROMPT, PARALLEL_RESEARCH_PROMPT, RESEARCH_SYNTHESIS_PROMPT
  - RESEARCH_REVIEW_PROMPT, RESEARCH_GRADUATION_PROMPT, PLAN_REVIEW_PROMPT
- Inserted v2 Research Pipeline block (7d-v2) into lu.skill.ts between steps 7d and 7e:
  - 7d-v2a: Research Scope (lu-phase-researcher in v2 mode)
  - 7d-v2b: Parallel Research (4 specialists simultaneously)
  - 7d-v2c: Research Synthesis (lu-research-synthesizer)
  - 7d-v2d: Research Review Loop (3 reviewers in parallel, iterate)
  - 7d-v2e: Research Graduation (lu-research-graduator)
- Inserted v2 Plan Review Loop (7g-v2) between steps 7g and 7h:
  - Convergence-aware multi-pass plan checking with approve/escalate/revise flow
- Added `--v2` CLI flag and v2 config resolution to Step 4

### Todo 5: v2 Graceful Degradation

Config key: `workflow.version` in config.json (read as `WORKFLOW_VERSION` shell variable in lu.skill.ts, stored as `workflow_version` in LuConfigSchema).

- **Gating (fail-closed):** All v2 blocks check `WORKFLOW_VERSION == "v2"` — if not v2, entire block is skipped (v1 runs unchanged)
- **Degradation (fail-safe):** If a v2 step fails at runtime, it logs and falls through to the next step — the v1 pipeline (discuss/plan/execute) always runs regardless of v2 failures
- Config default is "v1" — v2 is opt-in only
- `--v2` CLI flag overrides config for single invocation
- Existing v1 steps (7a-7p) completely unchanged

## Verification

- Typecheck: PASSED (0 new errors, 5 pre-existing dist/plugin/ errors)
- v1 pipeline: Unchanged (steps 7a-7p unmodified)
- v2 gating: All v2 blocks have explicit WORKFLOW_VERSION check
- Drift check: Deferred (build:all crashes during sessions)

## Files Modified

1. `src/shared/__schemas/lu-config.schemas.ts` — +workflow_version field
2. `.planning/config.json` — +version field in workflow, +research section
3. `src/skills/__helpers/agent-prompts.ts` — +6 v2 prompt templates (+255 lines)
4. `src/skills/luca/lu.skill.ts` — +v2 pipeline block, plan review loop, --v2 flag (+72 lines)
5. `.planning/ROADMAP.md` — All 5 todos marked complete
