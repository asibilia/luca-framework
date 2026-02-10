# Phase 5 Context: Code Quality

## Objective
Clean up code quality issues found in the Phase 5 research audit. Focus on structural correctness, dead code removal, and type safety in the core framework code.

## Scope
- `src/` (monorepo root source — types, base classes, shared utilities, compilers)
- `packages/luca-framework/src/` (CLI framework)
- Build scripts in `scripts/`

Content files (agents/general/, skills/general/, rules/general/) are mostly markdown-in-TypeScript and are lower priority.

## Wave Structure

### Wave 1 (05-01): Dead Code & Duplicates
- Remove unused functions, constants, duplicate files
- Clean up barrel file inconsistencies
- Quick wins, high impact

### Wave 2 (05-02): Type Safety
- Replace `any` in type definitions with proper generics/`unknown`
- Tighten `Record<string, any>` in shared utilities
- Fix index signatures

### Wave 3 (05-03): Base Class Consolidation
- Extract shared `toCursorFormat()`/`toClaudeFormat()` logic
- Reduce duplication across base-agent, base-skill, base-rule

### Wave 4 (05-04): Content Files Cleanup
- Fix class naming (kebab→PascalCase conversion)
- Consolidate luca/ vs general/ duplicates
- Add `import type` where appropriate

## Dependencies
- Phase 4 test suite provides safety net
- Run `bun test` after each wave

## Success Criteria
- Zero `any` in core type definitions
- No dead code in shared utilities
- No duplicate files
- `bun test` passes after all changes
