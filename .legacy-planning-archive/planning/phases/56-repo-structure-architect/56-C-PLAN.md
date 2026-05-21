# Plan 56-C: Tests and Build Validation

## Objective

Add tests for the new agent and skill, then run the build pipeline to generate compiled outputs and validate everything works end-to-end.

## Tasks

### 1. Create agent test

**File:** `src/agents/__tests__/lu-repo-architect.test.ts`

- Test that `luRepoArchitectAgent` creates without errors
- Test that agent name is "lu-repo-architect"
- Test that agent has expected tools
- Test that `toCursorFormat()` and `toClaudeFormat()` produce valid output
- Test that agent is registered in `agentRegistry`

### 2. Create skill test

**File:** `src/skills/__tests__/repo-audit.test.ts`

- Test that `repoAuditSkill` creates without errors
- Test that skill name is "repo-audit"
- Test that `toCursorFormat()` and `toClaudeFormat()` produce valid output
- Test that skill is registered in `skillRegistry`

### 3. Run full build and test suite

- `bun test` — all tests pass
- `bunx --bun tsc --noEmit` — type checking passes
- `bun run build:all` — generates compiled outputs
- `bun run check:drift` — no drift after build

## Verification

- All existing 1763+ tests pass
- New tests pass
- No type errors
- Build outputs generated without drift

## References

- Test pattern: `src/agents/__tests/` and `src/skills/__tests/` existing test files
- Build: `scripts/build-all.ts`
- Drift check: `scripts/check-drift.ts`
