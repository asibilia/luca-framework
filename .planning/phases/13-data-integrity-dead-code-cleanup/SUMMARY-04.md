# SUMMARY: Phase 13 Plan 04 -- DRY validation-utils.ts and Fix T0-to-T2 Boundary Inversion

## Result: COMPLETE

## Objective

Replace 3 near-identical `safeValidate*Config` functions in `src/shared/__helpers/validation-utils.ts` with a single generic `safeValidate<T>` function, and resolve the T0-to-T2 boundary inversion where shared (T0) imported from agents/skills/rules (T2).

## Changes Made

### Commit 1: `58eeaa73` -- feat(shared): replace entity-specific validators with generic safeValidate<T>

**Tasks 1, 2, 3, 5 (committed atomically -- type check requires all changes together)**

- **`src/shared/__helpers/validation-utils.ts`**: Removed all T2 imports (`AgentConfigSchema`, `SkillConfigSchema`, `RuleConfigSchema` and their types). Removed 6 entity-specific functions (`validateAgentConfig`, `validateSkillConfig`, `validateRuleConfig`, `safeValidateAgentConfig`, `safeValidateSkillConfig`, `safeValidateRuleConfig`). Added generic `safeValidate<T>(schema: z.ZodSchema<T>, config: unknown): Result<T>`.
- **`src/shared/index.ts`**: Updated barrel to export `safeValidate` instead of the 6 removed functions.
- **`index.ts`** (root): Updated public API to export `safeValidate` instead of the 6 removed functions.

### Commit 2: `237bbf1e` -- docs(rules): remove resolved T0-to-T2 exception from module-boundary rule

**Task 4**

- **`src/rules/general/module-boundary.rule.ts`**: Moved the `shared/__helpers/validation-utils.ts -> agents/skills/rules __schemas/` exception from the active exceptions table to the "Removed exceptions (resolved)" section with Phase 13 resolution context.

## Verification

- `bunx --bun tsc --noEmit` -- passes cleanly (0 errors)
- `bun run scripts/check-domain-boundaries.ts` -- "No domain boundary violations found"
- `grep -n "~/agents\|~/skills\|~/rules" src/shared/__helpers/validation-utils.ts` -- only match is inside a JSDoc `@example` comment, not an actual import
- No references to removed functions remain in `src/` (only in JSDoc documentation describing the replacement)

## Deviations

- **Tasks 1-3 and 5 committed atomically**: The plan specified per-task commits, but Tasks 1-3 and 5 are tightly coupled -- removing the functions (Task 1), removing imports (Task 2), updating barrels (Task 3), and updating root index.ts (Task 5) must all happen together for the type check to pass. Committing them separately would leave the codebase in a broken state between commits.
- **No entity-domain wrappers created**: Task 2 specified creating thin wrappers in agents/skills/rules `__helpers/` if consumers existed. The grep confirmed zero external consumers of the removed functions, so no wrappers were needed.

## Success Criteria

- [x] H4 closed: 3 near-identical safeValidate functions replaced with 1 generic function
- [x] H4 closed: T0->T2 boundary inversion resolved (shared no longer imports from entity domains)
- [x] Module boundary exception documentation updated
- [x] No regressions in type checking

## Manual Step Required

Run `bun run build:all` to regenerate `.claude/rules/module-boundary.md` from the updated source in `src/rules/general/module-boundary.rule.ts`.
