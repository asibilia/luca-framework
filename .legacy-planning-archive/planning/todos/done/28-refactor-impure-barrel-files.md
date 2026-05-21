---
title: "Refactor Impure Barrel Files (7 index.ts with Logic)"
area: architecture
created: 2026-03-01
updated: 2026-03-02
source: repo-audit
tier: 0
complexity: MODERATE
---

## Context

Multiple repo audits found 7 `index.ts` barrel files that contain business logic, violating the project invariant: "Every domain's index.ts is a pure barrel — only re-export statements, no logic."

## Task

Extract logic from these barrel files into named modules:

### From initial audit (2026-03-01)

1. **`src/index.ts`** (46 lines) — Contains `defineCommand` CLI entry point
   - Extract to `src/cli.ts` or `src/main.ts`, re-export from index

2. **`src/adapters/index.ts`** (92 lines) — Contains `switch` statement for adapter factory
   - Extract factory function to `src/adapters/factory.ts`, re-export from index

3. **`src/utils/doctor/index.ts`** (99 lines) — Contains doctor check orchestration logic
   - Extract to `src/utils/doctor/run-checks.ts`, re-export from index

### From standard audit (2026-03-02)

4. **`src/rules/index.ts`** (~80 lines) — Contains `loadProfileConfig()`, `loadProfileRules()`, `generalRules` const, `ruleRegistry` assembly logic, and `readFileSync` import
   - Extract registry logic to `src/rules/__helpers/rule-registry.ts`, re-export from index

5. **`src/agents/index.ts`** — Contains inline `agentRegistry` const with factory map
   - Extract to `src/agents/__helpers/agent-registry.ts`, re-export from index

6. **`src/skills/index.ts`** — Contains inline `skillRegistry` const with factory map
   - Extract to `src/skills/__helpers/skill-registry.ts`, re-export from index

7. **`src/harness/parsers/index.ts`** — Contains inline `parserRegistry` const with logic
   - Extract to `src/harness/parsers/parser-registry.ts`, re-export from index

After refactoring, each index.ts should contain only `export { ... } from './module'` statements.

## Notes

- Low risk refactor — purely structural, no behavior change
- Aligns with domain architecture invariant documented in AGENTS.md and module-boundary.md
- Items 4-6 are Entity domain registries — these are common in Archetype A domains but still violate the barrel-only invariant
