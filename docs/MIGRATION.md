# docs/ Restructure Migration Map (2026-03-31)

Old path to new path for every moved or renamed file. Use this to update bookmarks and cross-references.

## Moved to architecture/

| Old Path                                            | New Path                                    |
| --------------------------------------------------- | ------------------------------------------- |
| `docs/runtime-architecture/dag-workflow-engine.md`  | `docs/architecture/dag-engine.md`           |
| `docs/runtime-architecture/adapter-architecture.md` | `docs/architecture/adapter-architecture.md` |
| `docs/runtime-architecture/architectural-vision.md` | `docs/architecture/architectural-vision.md` |

## Consolidated (multiple files to single file)

| Old Paths                                                                                                                          | New Path                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `docs/agent-framework/README.md`, `luca/README.md`, `luca/architecture-plan.md`, `luca/end-to-end-workflow.md`, `luca/diagrams.md` | `docs/architecture/agent-framework.md` |
| `docs/memory-system/architecture-review.md`, `decisions.md`, `gap-analysis.md`                                                     | `docs/architecture/memory-system.md`   |
| `docs/research/anti-step-skipping/00-synthesis.md`                                                                                 | `docs/research/anti-step-skipping.md`  |
| `docs/skill-naming/naming-conventions.md`                                                                                          | `docs/guides/skill-naming.md`          |

## Moved to decisions/

| Old Path                                                                 | New Path                                            |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| `docs/runtime-architecture/decisions/backlog-integration-decisions.md`   | `docs/decisions/backlog-integration-decisions.md`   |
| `docs/runtime-architecture/decisions/behavioral-equivalence-criteria.md` | `docs/decisions/behavioral-equivalence-criteria.md` |
| `docs/runtime-architecture/decisions/iteration-integration-spec.md`      | `docs/decisions/iteration-integration-spec.md`      |
| `docs/runtime-architecture/decisions/open-questions-resolved.md`         | `docs/decisions/open-questions-resolved.md`         |

## Moved to guides/

| Old Path                               | New Path                          |
| -------------------------------------- | --------------------------------- |
| `docs/style-guide/coding-standards.md` | `docs/guides/coding-standards.md` |
| `docs/style-guide/content.md`          | `docs/guides/content-style.md`    |

## Relocated (operational files out of docs/)

| Old Path                       | New Path                            |
| ------------------------------ | ----------------------------------- |
| `docs/scouting/inbox.md`       | `.planning/scouting/inbox.md`       |
| `docs/scouting/INDEX.md`       | `.planning/scouting/INDEX.md`       |
| `docs/scouting/.scout-state/`  | `.planning/scouting/.scout-state/`  |
| `docs/scouting/deferred/`      | `.planning/scouting/deferred/`      |
| `docs/scouting/digests/`       | `.planning/scouting/digests/`       |
| `docs/scouting/integration/`   | `.planning/scouting/integration/`   |
| `docs/scouting/manual-review/` | `.planning/scouting/manual-review/` |

## Archived

See [archive/README.md](archive/README.md) for the full list of archived files and what replaced them.

## Source Code References Updated

- `src/workflow/**/*.ts` -- @see paths updated to `docs/architecture/dag-engine.md`
- `src/skills/**/*.ts`, `src/hooks/**/*.ts` -- @see docs/skill-to-agent-migration/ lines removed (migration complete)
- `src/skills/general/scout*.ts`, `src/agents/general/lu-scout*.ts`, `src/skills/__helpers/scout-index.ts` -- `docs/scouting` to `.planning/scouting`
- `README.md` -- links updated to new paths
- `AGENTS.md` -- links updated to new paths

**Note:** `bun run build:all` must be run after merging to regenerate dist/ files from updated source.
