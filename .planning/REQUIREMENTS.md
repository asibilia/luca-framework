# v1.3.3 Requirements — Final Audit Sweep

**Milestone:** v1.3.3
**Source:** v1.3.2 Milestone Audit Report (`.planning/v1.3.2-MILESTONE-AUDIT.md`)
**Scope:** All actionable tech debt from v1.3.2 audit (10 items)
**Requirements:** 10

---

## Build Script Cleanup

- [ ] **BUILD-01**: Deprecate `build-claude.ts` and `build-cursor.ts` — now redundant with `generateAllOutputs()` in `build-shared.ts`. Remove or mark as deprecated with migration path to `build-all.ts`. (~400 lines removable) (H-1)
- [ ] **BUILD-02**: Move `generateClaudeHooksConfig` from `scripts/build-shared.ts` to `src/hooks/` — co-locate with `generateCursorHooksConfig`. Fix the `index.ts` boundary violation (scripts/ -> src/ dependency inversion). (M-7, M-11)
- [ ] **BUILD-03**: Decompose `generateAllOutputs()` — split 212-line monolith into focused sub-functions (agents, skills, rules, hooks, plugins). (H-2)
- [ ] **BUILD-04**: Register Luca-specific entities (LuExecutorAgent, LuPlannerAgent, LuSkill, LuWorkflowRule) in main registries — eliminate special-casing with copy-pasted compilation logic. (H-3)

## Registry & Architecture

- [ ] **REG-01**: Refactor registries from class constructors (`new AgentClass()`) to factory functions per no-classes rule. (H-4)

## Test Quality

- [ ] **TEST-01**: Add category staleness test — verify `SKILL_CATEGORIES`/`AGENT_CATEGORIES` arrays cover all registry entries. Prevent silent stale categories. (M-6)
- [ ] **TEST-02**: Extract drift test helpers — DRY up 9 repetitive drift-checking and 10 orphan-detection test patterns in `check-drift.test.ts`. (M-1, M-8)
- [ ] **TEST-03**: Migrate plugin spec tests to Bun APIs — `plugin-spec-e2e.test.ts`, `plugin-spec-structure.test.ts`, `plugin-spec-hooks-format.test.ts` still use sync `node:fs`. (M-4)
- [ ] **TEST-04**: Extract shared test entities — `TestAgent`/`TestSkill`/`TestRule` duplicated across compiler test files into a shared test fixtures module. (M-5)

## Code Hygiene

- [ ] **CLEAN-01**: Update stale error messages — references to deleted `CursorCompiler`/`ClaudeCompiler` classes in build script error handlers. (L-1)

---

## Traceability

| Requirement | Audit Finding | Severity | Phase |
| ----------- | ------------- | -------- | ----- |
| BUILD-01    | H-1           | HIGH     | 28    |
| BUILD-02    | M-7, M-11     | MEDIUM   | 28    |
| BUILD-03    | H-2           | HIGH     | 28    |
| BUILD-04    | H-3           | HIGH     | 28    |
| REG-01      | H-4           | HIGH     | 29    |
| TEST-01     | M-6           | MEDIUM   | 29    |
| TEST-02     | M-1, M-8      | MEDIUM   | 29    |
| TEST-03     | M-4           | MEDIUM   | 29    |
| TEST-04     | M-5           | MEDIUM   | 29    |
| CLEAN-01    | L-1           | LOW      | 29    |

---

_Requirements created: 2026-02-13_
_Source: v1.3.2 Milestone Audit Report_
