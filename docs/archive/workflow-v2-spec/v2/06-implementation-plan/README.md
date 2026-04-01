# Implementation Plan

> How to build Luca Workflow v2 incrementally, without breaking v1.

---

## What Needs to Change

Luca Workflow v2 introduces five new capabilities on top of the existing v1 pipeline:

| Capability                    | Impact                                                          | New Entities                                                                  |
| ----------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Multi-agent parallel research | Replace single `lu-phase-researcher` with 4 focused researchers | 4 new agents (or 1 parameterized), enhanced `phase-research` skill            |
| Research review loops         | Add convergence-based quality gate after research               | 3 new reviewer agents (or 1 parameterized), new `phase-research-review` skill |
| MuninnDB graduation           | Bridge research files to semantic memory                        | 1 new `lu-research-graduator` agent, new `phase-graduate` skill               |
| Plan review loops             | Multi-reviewer convergence gate for plans                       | Enhanced `phase-plan` skill (or new `phase-plan-review` skill)                |
| Per-task MuninnDB recall      | Targeted context injection during execution                     | Enhanced `lu-executor` agent, enhanced `phase-execute` skill                  |

### Supporting Changes

- **Config**: New `research` section and `workflow.version` field in `.planning/config.json`
- **Vault routing**: New `research:*` concept prefix routed to repo vault
- **Complexity matrix**: New `researchReviewIterations` and `planReviewIterations` fields
- **Model routing table**: New agent entries in `MODEL_ROUTING_TABLE`
- **Orchestrator**: Enhanced `lu.skill.ts` to conditionally run v2 pipeline

---

## Estimated Scope

### New Files

| Category | Count | Location                                               |
| -------- | ----- | ------------------------------------------------------ |
| Agents   | 5-8   | `src/agents/general/lu-*.agent.ts`                     |
| Skills   | 3-4   | `src/skills/general/phase-*.skill.ts`                  |
| Schemas  | 1-2   | `src/shared/__schemas/`, `src/complexity/__schemas/`   |
| Config   | 0     | Modifications to `.planning/config.json` (no new file) |

### Modified Files

| File                                           | Change                                              |
| ---------------------------------------------- | --------------------------------------------------- |
| `src/skills/general/phase-research.skill.ts`   | Multi-agent spawning, research directory creation   |
| `src/skills/luca/lu.skill.ts`                  | v2 pipeline branching (gated on `workflow.version`) |
| `src/agents/__helpers/build-agent-registry.ts` | Register new agents                                 |
| `src/skills/__helpers/build-skill-registry.ts` | Register new skills                                 |
| `src/complexity/__helpers/model-routing.ts`    | Add routing entries for new agents                  |
| `src/shared/__schemas/lu-config.schemas.ts`    | Extend config parser with `research` section        |
| `.planning/config.json`                        | Add `research` section, `workflow.version` field    |
| `.claude/rules/vault-routing.md`               | Add `research:*` prefix routing                     |
| `~/.claude/rules/vault-guard.md`               | Mirror `research:*` routing                         |

### Total Estimated Effort

- **New code**: ~2500-4000 lines across agents, skills, and schemas
- **Modified code**: ~300-500 lines of changes to existing files
- **Documentation**: Already being produced (this directory)

---

## Suggested Phasing

The implementation is broken into six sequential phases, each producing a working increment that can be tested independently. Phases build on each other but v1 continues to work at every stage.

| Phase | Name                     | New Entities                           | Estimated Files | Dependencies |
| ----- | ------------------------ | -------------------------------------- | --------------- | ------------ |
| 1     | Research Infrastructure  | 4 researcher agents, enhanced skill    | 5-9             | None         |
| 2     | Review Loop              | 3 reviewer agents, new skill           | 4-7             | Phase 1      |
| 3     | MuninnDB Graduation      | 1 graduator agent, new skill           | 2-3             | Phase 2      |
| 4     | Plan Enhancement         | Enhanced planner + plan review skill   | 2-3             | Phase 3      |
| 5     | Executor Enhancement     | Enhanced executor with per-task recall | 1-2             | Phase 3      |
| 6     | Orchestrator Integration | Enhanced `lu.skill.ts`, config, gates  | 2-3             | Phases 1-5   |

See [phased-rollout.md](phased-rollout.md) for detailed phase specifications.

---

## Documents in This Directory

| Document                                     | Purpose                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| [migration-from-v1.md](migration-from-v1.md) | Backward compatibility strategy, gate mechanism, what breaks (nothing)                  |
| [new-skills-needed.md](new-skills-needed.md) | Detailed specifications for new and enhanced skills                                     |
| [new-agents-needed.md](new-agents-needed.md) | Detailed specifications for new agents, including the parameterized vs. separate debate |
| [config-changes.md](config-changes.md)       | New config sections, Zod schemas, example config                                        |
| [phased-rollout.md](phased-rollout.md)       | Six-phase implementation plan with scope, dependencies, and verification criteria       |

---

## Key Constraints

These constraints apply to all implementation phases:

1. **Never run `bun run build:all` during a Claude Code session** -- it crashes the process. After implementing source changes, ask the user to stop the session, run the build manually, and restart.

2. **No test files** -- tests are currently removed (see `.claude/rules/no-tests.md`). Verification uses `bunx --bun tsc --noEmit` only.

3. **Generated file guard** -- never edit `.claude/`, `.cursor/`, or `.pi/` directly. Always edit source in `src/` and rebuild.

4. **Kebab-case naming** -- all new files must use kebab-case (e.g., `lu-architecture-researcher.agent.ts`).

5. **Functional patterns only** -- no classes. Use `createAgent()` and `createSkill()` factory functions.

6. **Module boundary compliance** -- new agents are T2 (entity), new skills are T2 (entity). They may import from T0 (shared, complexity) and T1 (context, planner, etc.) only. Agent and skill domains must never cross-import.

---

## Related Documentation

- [Design Principles](../00-design-principles/) -- The architectural reasoning behind v2
- [Workflow Steps](../01-workflow-steps/) -- The 10-step v2 pipeline reference
- [Research System](../02-research-system/) -- Multi-agent research architecture
- [MuninnDB Integration](../03-muninndb-integration/) -- Graduation model and per-task recall
- [Review Loops](../05-review-loops/) -- Convergence-based review patterns
