# Plan 90-A Summary: Scope Rules by Directory/Domain

## Status: COMPLETE

## What Changed

### 1. Rule Classification (6 rules scoped)

| Rule                 | Type        | Scope                                                                  |
| -------------------- | ----------- | ---------------------------------------------------------------------- |
| posthog-integration  | CONDITIONAL | `**/analytics/**`, `**/posthog/**`, `**/tracking/**`                   |
| atlassian-mcp        | CONDITIONAL | Description-based activation (no globs)                                |
| state-machine-bridge | DOMAIN      | `src/state/**`, `.planning/**`, `packages/luca-framework/src/state/**` |
| api-snake-case       | DOMAIN      | `src/**/*.schemas.ts`, `**/*.schemas.ts`                               |
| lodash-preference    | DOMAIN      | `src/**/*.ts`, `packages/**/*.ts`                                      |
| schema-first-parsing | DOMAIN      | `src/**/*.schemas.ts`, `src/**/*.ts`                                   |

All other rules remain GLOBAL (`alwaysApply: true`).

### 2. Claude Format Compiler Updated

`src/compilers/__helpers/compile.ts` -- `compileRuleClaude()` now prepends YAML frontmatter with `description`, `globs`, and `alwaysApply` fields when a rule has scoping metadata. Global rules emit no frontmatter (unchanged behavior).

### 3. Duplicate Bun Rules Merged

- `use-bun-instead-of-node-vite-npm-pnpm.rule.ts` merged into `bun-preference.rule.ts`
- Unique content (Bun APIs section) integrated into bun-preference
- Source file deleted, registry updated (21 -> 20 rules)
- Tests updated to reflect 7 TypeScript profile rules (was 8)

### 4. Additional Fix

- `lodash-preference.rule.ts` description fixed from "Generic rule description" to "Use lodash functions over built-in JavaScript equivalents for consistency and safety"

## Files Changed

- `src/rules/general/posthog-integration.rule.ts` -- alwaysApply: false, globs added
- `src/rules/general/atlassian-mcp.rule.ts` -- alwaysApply: false, globs removed
- `src/rules/general/state-machine-bridge.rule.ts` -- alwaysApply: false, globs updated
- `src/rules/profiles/typescript/api-snake-case.rule.ts` -- alwaysApply: false, globs updated
- `src/rules/profiles/typescript/lodash-preference.rule.ts` -- alwaysApply: false, globs + description
- `src/rules/profiles/typescript/schema-first-parsing.rule.ts` -- alwaysApply: false, globs updated
- `src/rules/profiles/typescript/bun-preference.rule.ts` -- Bun APIs section merged in
- `src/rules/profiles/typescript/index.ts` -- Removed use-bun import/registration
- `src/rules/profiles/typescript/use-bun-instead-of-node-vite-npm-pnpm.rule.ts` -- DELETED
- `src/compilers/__helpers/compile.ts` -- YAML frontmatter for scoped rules
- `__tests__/src/rules/profiles/profile-registry.test.ts` -- 8->7 rule count
- `__tests__/src/rules/rule-registry-profiles.test.ts` -- 21->20 rule count

## Verification

- `bunx --bun tsc --noEmit` -- PASS
- `bun test __tests__/src/rules/` -- 40/40 PASS
- `bun run build:all` -- PASS
- `bun run check:drift` -- No drift detected
