---
title: "Refactor 62 agent/skill classes to functional factories"
area: architecture
priority: critical
created: 2026-02-16
source: repo-audit
---

## Context

The v1.6.0 tech debt cleanup refactored all 19 rule classes to functional `createRule()` factories. However, the same no-classes violation exists in agents and skills — 30 agent classes extend `BaseAgentImpl` and 32+ skill classes extend `BaseSkillImpl`.

## Task

Apply the same class-to-factory refactor pattern used for rules:

1. Replace `BaseAgentImpl` abstract class with `createAgent()` factory function in `src/agents/base/base-agent.ts`
2. Replace `BaseSkillImpl` abstract class with `createSkill()` factory function in `src/skills/base/base-skill.ts`
3. Refactor all 30 agent files from class exports to functional `createAgent()` instances
4. Refactor all 32+ skill files from class exports to functional `createSkill()` instances
5. Update agent and skill registries (`src/agents/index.ts`, `src/skills/index.ts`)
6. Update test utilities and test files

## Files

- `src/agents/base/base-agent.ts` — BaseAgentImpl abstract class
- `src/skills/base/base-skill.ts` — BaseSkillImpl abstract class
- `src/agents/general/*.agent.ts` — 28 agent classes
- `src/agents/luca/*.agent.ts` — 2 agent classes
- `src/skills/general/*.skill.ts` — 31+ skill classes
- `src/skills/luca/*.skill.ts` — 1 skill class
- `src/agents/index.ts` — Agent registry
- `src/skills/index.ts` — Skill registry

## Notes

- Exact same pattern as the successful rule refactor (createRule factory)
- No `instanceof` checks expected — tests use interface methods
- This is the largest remaining no-classes violation in the codebase
