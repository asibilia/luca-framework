---
title: "TypeScript round-trip utilities (read/write entity files, serializeSectionContent)"
area: tooling
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: []
phase: studio-w2
estimated_size: L
priority: P1
---

## Context

Agent, skill, and rule files are TypeScript with imports, typed config objects, and `createAgent()`/`createSkill()`/`createRule()` calls. The Studio UI must read structured data from these files and write back valid TypeScript. Research (R3) confirmed all 129 entity files follow a canonical template with zero structural deviations.

## Task

Build the read/write path for TypeScript entity files:

- **Read path:** Extract config object literal via targeted regex, evaluate, parse with Zod schema. Leverage the `.config` getter already exposed by every entity.
- **Write path:** Serialize config to TypeScript object literal, inject into canonical template, write file.
- **`serializeSectionContent()`:** Handle backtick template literals, escape `${}` sequences, preserve `${CONSTANT}` interpolation in 8 agents using shared prompt blocks (COLD*ISOLATION_BLOCK, RESEARCH_REVIEWER*\*). Must distinguish `${SHARED_BLOCK}` from literal `${user_text}`.
- Round-trip fidelity validation against all 129 entity files.

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (TypeScript Round-Trip Problem section) and `docs/brainstorm/observer-studio-rework/7.research-entity-editing.md` (R3) for detailed specs.

## Key Files

- New: `packages/luca-studio/lib/ts-round-trip.ts` (or similar)
- `src/agents/__schemas/agent.schemas.ts` (AgentConfigSchema)
- `src/skills/__schemas/skill.schemas.ts` (SkillConfigSchema)
- `src/rules/__schemas/rule.schemas.ts` (RuleConfigSchema)
- `src/agents/__helpers/create-agent.ts` (canonical template reference)

## Verification

- Round-trip all 129 entity files: read -> serialize -> write -> diff produces zero changes
- The 8 interpolation agents preserve `${CONSTANT}` expressions
- `bunx --bun tsc --noEmit` passes on all written files
