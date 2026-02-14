# Phase 29 Wave 1: Registry Factories, Category Staleness, Stale References

## Objective

Refactor registries from class constructors to factory functions (REG-01), add category staleness test (TEST-01), extract shared test entities (TEST-04), and update stale documentation (CLEAN-01).

## Requirements Addressed

- REG-01: Factory functions for registries
- TEST-01: Category staleness test
- TEST-04: Shared test entities
- CLEAN-01: Stale compiler references in docs

## Tasks

### Task 1: Refactor registries to factory functions

Replace `new (AgentClass as new () => BaseAgent)()` pattern with factory functions in registries.

**Files:**

- `src/agents/base/base-agent.ts` — add `createAgent()` factory
- `src/skills/base/base-skill.ts` — add `createSkill()` factory
- `src/rules/base/base-rule.ts` — add `createRule()` factory
- `src/agents/index.ts` — export factory-based registry or keep class registry with factory wrapper
- `src/skills/index.ts` — same
- `src/rules/index.ts` — same
- `scripts/build-shared.ts` — use factory functions in `generateAgentOutputs()`, `generateSkillOutputs()`, `generateRuleOutputs()`, `generatePluginOutputs()`

**Verification:** Tests pass, drift zero, no `new (…Class as new () => Base…)()` patterns remain.

### Task 2: Add category staleness test

Create test that verifies SKILL_CATEGORIES and AGENT_CATEGORIES cover all registry entries.

**Files:**

- `__tests__/scripts/category-staleness.test.ts` (new)
- `scripts/build-shared.ts` — add missing "autopilot" to SKILL_CATEGORIES

**Verification:** New test passes. Adding a new skill without a category mapping causes test failure.

### Task 3: Extract shared test entities

Consolidate duplicated TestAgent/TestSkill/TestRule across test files into shared module.

**Files:**

- `__tests__/utils/test-entities.ts` (new)
- `__tests__/src/agents/base/base-agent.test.ts` — import from shared
- `__tests__/src/skills/base/base-skill.test.ts` — import from shared
- `__tests__/src/rules/base/base-rule.test.ts` — import from shared
- `__tests__/src/compilers/claude-compiler.test.ts` — import from shared
- `__tests__/src/compilers/cursor-compiler.test.ts` — import from shared

**Verification:** Tests pass. No duplicate TestAgent/TestSkill/TestRule definitions remain.

### Task 4: Update stale documentation

Remove references to deleted CursorCompiler/ClaudeCompiler classes.

**Files:**

- `docs/generation-system.md` — update compiler section

**Verification:** No stale references to deleted class names.

## Success Criteria

- [ ] No `new (…Class as new () => Base…)()` casts in build pipeline
- [ ] Category staleness test catches missing entries
- [ ] Shared test entities used across all compiler tests
- [ ] Zero stale compiler class references in docs
- [ ] 982+ tests pass, zero drift
