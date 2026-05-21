---
id: 89-B
status: complete
---

# 89-B Summary: Refactor Remaining Impure Barrels

## Tasks Completed

- Task 1: Extracted CLI logic (defineCommand, runMain, runInit) from `packages/luca-framework/src/index.ts` to new `packages/luca-framework/src/cli.ts`. The barrel now contains only re-export statements.
- Task 2: Extracted `parserRegistry` from `src/harness/parsers/index.ts` to new `src/harness/parsers/parser-registry.ts`. The barrel now contains only re-export statements. Updated the documented exception in module-boundary rule (both source `.rule.ts` and generated outputs).
- Task 3: Verified all barrels are pure. `bunx --bun tsc --noEmit` passes clean. `bun test` shows 2827 pass / 31 fail (all 31 failures are pre-existing Pi extension / session hook / category staleness issues, unrelated to barrel refactoring).

## Changes Made

- `packages/luca-framework/src/cli.ts`: New file containing CLI defineCommand, runMain, and runInit logic extracted from index.ts
- `packages/luca-framework/src/index.ts`: Now a pure barrel with only re-exports (from ./cli, ./types, ./utils/manifest)
- `src/harness/parsers/parser-registry.ts`: New file containing parserRegistry Record extracted from parsers/index.ts
- `src/harness/parsers/index.ts`: Now a pure barrel with only re-exports (from ./parser-registry, ./tsc, ./bun-test, ./eslint, ./generic)
- `src/rules/general/module-boundary.rule.ts`: Updated Rule 5 exception table to reference `parser-registry.ts` instead of `parsers/index.ts`
- `.claude/rules/module-boundary.md`: Regenerated from source rule (reflects parser-registry.ts reference)
- `.cursor/rules/module-boundary.mdc`: Regenerated from source rule (reflects parser-registry.ts reference)

## Verification

- bunx --bun tsc --noEmit: pass (clean, zero errors)
- bun test: 2827 pass / 31 fail (all failures pre-existing, unrelated to this plan)

## Issues Encountered

- The `.claude/rules/module-boundary.md` file is generated from `src/rules/general/module-boundary.rule.ts` via the build pipeline. Initial attempts to edit the generated file directly were reverted by the build process. Solution: edited the source `.rule.ts` file and ran `bun run build:all` to regenerate outputs.
