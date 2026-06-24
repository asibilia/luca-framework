---
title: "v2 Phase 1: Research Infrastructure — 4 parallel researcher agents"
area: agents
created: 2026-03-23
source: docs/workflow-system/v2/06-implementation-plan/phased-rollout.md
---

## Context

Luca Workflow v2 replaces the single `lu-phase-researcher` with 4 parallel specialist researchers operating in cold isolation. This is the foundation phase — all other v2 work depends on it.

## Task

Create 4 new researcher agents and enhance `phase-research` skill:

### New Files (5)

- `src/agents/general/lu-architecture-researcher.agent.ts` — system design, patterns, structure
- `src/agents/general/lu-implementation-researcher.agent.ts` — APIs, code patterns, configuration
- `src/agents/general/lu-ecosystem-researcher.agent.ts` — libraries, community, state of art
- `src/agents/general/lu-risk-researcher.agent.ts` — pitfalls, failures, security, performance
- `src/agents/__helpers/researcher-shared-sections.ts` — shared prompt constants (tool strategy, source hierarchy, verification protocol)

### Modified Files (3-4)

- `src/skills/general/phase-research.skill.ts` — add v2 branch: multi-agent spawning, research dir creation, v1 fallback
- `src/agents/__helpers/build-agent-registry.ts` — register 4 researchers
- `src/complexity/__helpers/model-routing.ts` — add ROUTER preset entries for 4 researchers
- `src/skills/__helpers/build-skill-registry.ts` — if export name changes

### Key Decisions (from CANONICAL-DECISIONS.md)

- Decision 2: Separate agents, not parameterized
- Decision 10: ROUTER preset (fast for TRIVIAL/SIMPLE, balanced for MODERATE+)
- Decision 11: Cold isolation (non-negotiable)
- Decision 12: Numbered filenames (01-architecture-patterns.md through 04-pitfalls-and-risks.md)

### Verification

- All 4 agents pass `bunx --bun tsc --noEmit`
- Agent registry imports all 4 without errors
- Model routing table includes all 4 with ROUTER preset
- v1 mode: skill behaves identically to current (single researcher)
- v2 mode: creates phase-scoped `research/` directory and spawns 4 agents in parallel

## Notes

- Full agent specs with code are in `docs/workflow-system/v2/06-implementation-plan/new-agents-needed.md`
- No dependencies — this is the foundation phase
- Remember: `bun run build:all` must be run outside Claude Code session
