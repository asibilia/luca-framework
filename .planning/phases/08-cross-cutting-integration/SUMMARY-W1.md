# Phase 8 Wave 1 Summary: Cross-Cutting Integration (X03-X08)

**Phase:** 8
**Wave:** 1
**Status:** Complete
**Date:** 2026-03-24

## Tasks Completed

| #   | Todo                                  | Output                                                                   | Commit     |
| --- | ------------------------------------- | ------------------------------------------------------------------------ | ---------- |
| 1   | X03 Backlog integration audit         | `docs/runtime-architecture/decisions/backlog-integration-decisions.md`   | `1bfad542` |
| 2   | X04 Targeted recompilation script     | `scripts/targeted-recompile.ts`, `package.json` (build:domain alias)     | `2067fb11` |
| 3   | X05 Behavioral equivalence threshold  | `docs/runtime-architecture/decisions/behavioral-equivalence-criteria.md` | `dd8ca861` |
| 4   | X06 State machine DAG events          | `packages/luca-framework/src/state/types.ts`, `machine.ts`, `bridge.ts`  | `65b572e7` |
| 5   | X07 Iteration system integration plan | `docs/runtime-architecture/decisions/iteration-integration-spec.md`      | `796fc198` |
| 6   | X08 Open questions resolution         | `docs/runtime-architecture/decisions/open-questions-resolved.md`         | `07899f9c` |

## Files Created/Modified

**New files (6):**

- `docs/runtime-architecture/decisions/backlog-integration-decisions.md` -- 5 decisions about v2/runtime sequencing
- `docs/runtime-architecture/decisions/behavioral-equivalence-criteria.md` -- 5 acceptance criteria for DAG-compiled prose
- `docs/runtime-architecture/decisions/iteration-integration-spec.md` -- DAG executor integration with src/iteration/
- `docs/runtime-architecture/decisions/open-questions-resolved.md` -- 5 resolved design questions
- `scripts/targeted-recompile.ts` -- single-domain recompilation utility

**Modified files (3):**

- `packages/luca-framework/src/state/types.ts` -- added DAG*STEP*\* events and dag_execution context
- `packages/luca-framework/src/state/machine.ts` -- added DAG step actions and executing state handlers
- `packages/luca-framework/src/state/bridge.ts` -- exposed dag_execution in read-status output
- `package.json` -- added build:domain script alias

## Key Decisions Made

1. **v2-phase-6 blocked on Phase A** -- orchestrator integration targets DAG definitions, not lu.skill.ts prose
2. **Feature-flag coexistence** -- `workflow.engine: "prose" | "dag"` per-session switching
3. **DAG granularity** -- one step per skill invocation (7 primary steps)
4. **Oversight gates** -- out-of-band via state machine events, not DAG node types
5. **Adapter discovery** -- explicit registry pattern matching existing agent/skill/rule registries

## Deviations

**Task 2 (X04):** The targeted recompile script differs from the todo's exact template. The todo assumed per-domain compile functions (`compileAgents()`, `compileSkills()`, etc.) are exposed from `src/compilers/index`. In practice, the build pipeline uses `generateAllOutputs()` as a monolith with private per-domain functions. The script instead directly accesses the registries and compilers for single-domain mode, and uses `runCompile() + runDeploy()` for `--domain=all` mode.

## Verification

- `bunx --bun tsc --noEmit` passes after all changes
- All 4 DAG event types added to WorkflowEvent union
- dag_execution context field added and exposed via bridge
- All 6 todo files moved to `.planning/todos/done/`
- 6 atomic commits with Co-Authored-By trailers
