# Phase 28 Plan 02 — Decompose Pipeline & Register Luca Entities

**Phase:** 28 — Build Script Cleanup
**Requirements:** BUILD-03 (decompose pipeline), BUILD-04 (register entities)
**Complexity:** MODERATE

## Objective

Break the 212-line `generateAllOutputs()` monolith into focused sub-functions, and eliminate Luca-specific entity special-casing by registering LuExecutorAgent, LuPlannerAgent, LuSkill, and LuWorkflowRule in the main registries.

## Context

- `generateAllOutputs()` in `build-shared.ts` has 8 logical sections (agents, luca-agents, skills, luca-skill, rules, luca-rule, hooks, settings, plugin commands, plugin hooks, plugin manifest, readme)
- Luca entities are compiled separately with copy-pasted logic (~25 lines of special-casing each)
- After registering Luca entities in registries, the special-casing can be deleted
- README generation manually appends "lu-executor", "lu-planner", "lu" to arrays — this becomes automatic

## Tasks

### Wave 2

1. **Register Luca-specific entities in registries**
   - `src/agents/index.ts`: Add `"lu-executor": LuExecutorAgent` and `"lu-planner": LuPlannerAgent` to `agentRegistry`
   - `src/skills/index.ts`: Add `"lu": LuSkill` to `skillRegistry`
   - `src/rules/index.ts`: Add `"lu-workflow": LuWorkflowRule` to `ruleRegistry`
   - Add corresponding imports for each

2. **Remove Luca-specific special-casing from `generateAllOutputs()`**
   - Remove direct imports of LuExecutorAgent, LuPlannerAgent, LuSkill, LuWorkflowRule in build-shared.ts
   - Delete the Luca-specific agent compilation block (lines ~484-511)
   - Delete the Luca-specific skill compilation block (lines ~530-537)
   - Delete the Luca-specific rule compilation block (lines ~552-561)
   - Delete the Luca-specific command block (lines ~601-605)
   - Update README generation to not manually append Luca entity names (lines ~659-664)

3. **Decompose `generateAllOutputs()` into focused sub-functions**
   - Extract `generateAgentOutputs(generated: Map)` — agent compilation loop
   - Extract `generateSkillOutputs(generated: Map)` — skill compilation loop
   - Extract `generateRuleOutputs(generated: Map)` — rule compilation loop
   - Extract `generateHookOutputs(generated: Map)` — hook script copying + config generation
   - Extract `generatePluginOutputs(generated: Map)` — commands, plugin hooks, manifest, marketplace, README
   - Keep `generateAllOutputs()` as a thin orchestrator calling sub-functions

## Verification

- `bun test` — all tests pass
- `bun run build:all` — identical output (verified by drift check)
- `bun run check:drift` — zero drift
- Verify lu-executor, lu-planner, lu, lu-workflow appear in registry iteration
- No direct Luca entity imports remain in build-shared.ts

## Success Criteria

- [ ] BUILD-03: `generateAllOutputs()` decomposed into 5+ focused sub-functions
- [ ] BUILD-04: All 4 Luca entities registered in main registries
- [ ] No Luca-specific special-casing remains in build pipeline
- [ ] All tests pass, zero drift
- [ ] Build output identical before and after refactoring
