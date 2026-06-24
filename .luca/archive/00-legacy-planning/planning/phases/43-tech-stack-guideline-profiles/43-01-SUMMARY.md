---
id: "43-01"
status: "complete"
tasks_completed: 7
tasks_total: 7
---

# 43-01 Summary: Profile Directory Structure, Config Toggle, Migrate TS-Specific Rules

## Completed Tasks

### T1: Create Profile Directory Structure

- Created `src/rules/profiles/` directory
- Created `src/rules/profiles/typescript/` directory
- Created placeholder directories with `.gitkeep` for `python/`, `go/`, `rust/` (Wave 2)

### T2: Define Profile Types and Zod Schemas

- Created `src/rules/profiles/profile.types.ts` with `TechStackProfile` interface (name, description, rules: Record<string, () => BaseRule>)
- Created `src/rules/profiles/profile.schemas.ts` with `profileConfigSchema` Zod schema containing `opinionated_guidelines` (boolean, default: true) and `tech_stack_profiles` (string[], default: ["typescript"])

### T3: Add Config Toggle

- Added `"opinionated_guidelines": true` to workflow section of `.planning/config.json`
- Added `"tech_stack_profiles": ["typescript"]` to workflow section of `.planning/config.json`

### T4: Migrate TS-Specific Rules to TypeScript Profile

- Used `git mv` to move 8 rule files from `src/rules/general/` to `src/rules/profiles/typescript/`:
  - api-snake-case.rule.ts
  - bun-preference.rule.ts
  - functional-api-reuse.rule.ts
  - import-standards.rule.ts
  - lodash-preference.rule.ts
  - no-classes.rule.ts
  - schema-first-parsing.rule.ts
  - use-bun-instead-of-node-vite-npm-pnpm.rule.ts
- Updated import paths in all 8 files: `../base/` -> `../../base/`, `../types/` -> `../../types/`

### T5: Create TypeScript Profile Registry

- Created `src/rules/profiles/typescript/index.ts` exporting `typescriptProfile` object with all 8 rule factories
- Created `src/rules/profiles/index.ts` as master profile registry containing typescript profile, re-exporting types and schemas

### T6: Update Rule Registry for Profile-Aware Loading

- Rewrote `src/rules/index.ts` to dynamically assemble rule registry from general rules (11, always loaded) + active profile rules (8 from typescript, config-controlled)
- Added `loadProfileConfig()` function that reads `.planning/config.json` with Zod-validated defaults
- Added `loadProfileRules()` function that loads rules from active profiles based on `opinionated_guidelines` and `tech_stack_profiles` settings
- Re-exported profile infrastructure (`profileRegistry`, `profileConfigSchema`, types) for consumers

### T7: Verify Build Pipeline

- `bun run build:all` succeeded: 19 rules, 327 total files
- `bun run check:drift` passed: no drift detected
- All 19 rules present in both `.claude/rules/` and `.cursor/rules/`
- `bun test`: 2065 pass, 3 fail (all 3 pre-existing, unrelated failures)
- Fixed `__tests__/src/rules/rule-registry.test.ts` to scan `profiles/` directory

## Deviations

- **Test fix required**: The rule registry completeness test (`__tests__/src/rules/rule-registry.test.ts`) needed updating to also scan the `profiles/` directory tree, not just `general/` and root. Added `collectRuleNames()` recursive helper.
- **functional-api-reuse.rule.ts** used single quotes for imports while other 7 files used double quotes. Both were updated correctly with their respective quote styles. A formatter normalized this to double quotes.

## Findings

- All 8 TypeScript-specific rule files follow an identical pattern: import `BaseRuleImpl` from `../base/base-rule` and `RuleConfig` from `../types/rule.types`. This made the migration straightforward.
- The `loadProfileConfig()` function uses `require("fs").readFileSync` for synchronous config reading at module initialization time. This ensures the registry is fully assembled before any consumer accesses it.
- Pre-existing TypeScript compiler errors in `src/` are all unrelated to rule infrastructure (agent type imports, hooks index). No new errors introduced.
- Pre-existing test failures (3): `planner integration` and `parseTodos` (x2) are unrelated to rule infrastructure.
