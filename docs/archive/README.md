# Archived Documentation

These documents are preserved for historical reference. They represent completed design phases, superseded specifications, and phase research artifacts. Content here is no longer actively maintained.

For current documentation, see [docs/README.md](../README.md).

## Contents

| Directory                            | Archived   | What It Contains                                                                                                                                                                 | Replaced By                                                                         |
| ------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `workflow-v2-spec/`                  | 2026-03-31 | Full 10-step v2 pipeline specification (74 files, 8 sections). Internal READMEs serve as navigation. **Fully implemented** — no drift.                                           | [architecture/workflow-orchestration.md](../architecture/workflow-orchestration.md) |
| `workflow-v1-analysis/`              | 2026-03-31 | v1 topology audit, state machine analysis, systematization gaps, target architecture. **Superseded by v2.**                                                                      | [architecture/workflow-orchestration.md](../architecture/workflow-orchestration.md) |
| `brainstorm/observer-studio-rework/` | 2026-03-31 | 13-file Studio redesign research (product vision, UX, architecture, tech decisions). **Core design implemented** in packages/luca-studio. Author tier (Tier 3) still incomplete. | packages/luca-studio source                                                         |
| `brainstorm/workflow-rework/`        | 2026-03-31 | Pre-v2 workflow redesign research (methodology synthesis, premortem, final design). **Synthesized into v2 spec.**                                                                | `workflow-v2-spec/`                                                                 |
| `runtime-research/`                  | 2026-03-31 | Phase A-E research (DAG engines, adapters, eval, IDE ecosystems, risk analysis). **All phases complete** (B and E exceeded spec).                                                | [architecture/](../architecture/)                                                   |
| `skill-to-agent-migration/`          | 2026-03-31 | Phase 232 migration from nested Skill() to Agent() dispatch (8 files: architecture, risk register, integration assessment, grounding report). **Migration complete.**            | Source code in src/                                                                 |
| `studio-review/`                     | 2026-03-31 | Luca Studio UI bug audit (10 issues, 2 P0). **P0 bugs fixed.** 6 remaining issues tracked as todos.                                                                              | .planning/todos/                                                                    |
| `agent-framework/`                   | 2026-03-31 | Original 5-file agent framework docs. **Consolidated.**                                                                                                                          | [architecture/agent-framework.md](../architecture/agent-framework.md)               |
| `memory-system/`                     | 2026-03-31 | Original 3-file memory system docs. **Consolidated with drift fixes.**                                                                                                           | [architecture/memory-system.md](../architecture/memory-system.md)                   |
| `anti-step-skipping/`                | 2026-03-31 | Supporting research docs 01-05 for the anti-step-skipping study.                                                                                                                 | [research/anti-step-skipping.md](../research/anti-step-skipping.md) (synthesis)     |

## Single Files

| File                             | Archived   | Reason                                                             |
| -------------------------------- | ---------- | ------------------------------------------------------------------ |
| `runtime-roadmap.md`             | 2026-03-31 | Phase A-E roadmap — phases mostly complete                         |
| `mastra-evaluation.md`           | 2026-03-31 | Mastra.ai framework evaluation — decision made (do not adopt)      |
| `runtime-architecture-readme.md` | 2026-03-31 | Original runtime-architecture index                                |
| `observer-architecture.md`       | 2026-03-31 | SpacetimeDB architecture — **DEPRECATED** (SpacetimeDB removed)    |
| `observer-deployment.md`         | 2026-03-31 | SpacetimeDB deployment — **DEPRECATED** (SpacetimeDB removed)      |
| `skill-description-audit.md`     | 2026-03-31 | Audit observations on 47 skill descriptions                        |
| `skill-naming-rename-plan.md`    | 2026-03-31 | Transient rename plan (conventions kept in guides/skill-naming.md) |
