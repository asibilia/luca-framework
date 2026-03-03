# Summary: 95-D — Deduplicate getArg/hasFlag in iteration helpers

## Objective

Replace 5 identical local `getArg()` function definitions (and 1 `hasFlag()` definition) in `src/iteration/__helpers/` CLI entry points with imports from the existing `~/shared/__helpers/cli-utils` module.

## Changes Made

### Files Modified

1. **`src/iteration/__helpers/convergence.ts`**
   - Added import: `import { getArg, hasFlag } from "~/shared/__helpers/cli-utils";`
   - Removed local `function getArg(name, defaultValue)` closure (5 lines)
   - Removed local `function hasFlag(name)` closure (3 lines)
   - Updated 6 call sites to pass `args` as first argument

2. **`src/iteration/__helpers/metrics-collector.ts`**
   - Added import: `import { getArg } from "~/shared/__helpers/cli-utils";`
   - Removed local `function getArg(name, defaultValue)` closure (5 lines)
   - Updated 3 call sites to pass `args` as first argument

3. **`src/iteration/__helpers/classifier.ts`**
   - Added import: `import { getArg } from "~/shared/__helpers/cli-utils";`
   - Removed local `function getArg(name, defaultValue)` closure (5 lines)
   - Updated 3 call sites to pass `args` as first argument

4. **`src/iteration/__helpers/checkpoint.ts`**
   - Added import: `import { getArg } from "~/shared/__helpers/cli-utils";`
   - Removed local `function getArg(name, defaultValue)` closure (5 lines)
   - Updated 6 call sites to pass `args` as first argument

5. **`src/iteration/__helpers/budget.ts`**
   - Added import: `import { getArg } from "~/shared/__helpers/cli-utils";`
   - Removed local `function getArg(name, defaultValue)` closure (5 lines)
   - Updated 6 call sites to pass `args` as first argument

## Key Signature Difference

The shared `getArg(args, name, defaultValue)` takes `args` as the first parameter. The local closures defined `getArg(name, defaultValue)` as closures over a local `args` variable. Each call site was updated to pass `args` as the first argument.

## Lines Removed

- 5 local `getArg` function definitions (25 lines total)
- 1 local `hasFlag` function definition (3 lines)
- **Total: ~28 lines of duplicated code removed**

## Validation

- `bunx --bun tsc --noEmit` passes with no errors
- `bun test __tests__/packages/luca-framework/` — 421 tests pass, 0 failures
- `bun test __tests__/src/iteration/` — 146 tests pass, 0 failures
- No local `function getArg` or `function hasFlag` definitions remain in `src/iteration/__helpers/`
