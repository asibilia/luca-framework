---
id: 95-D
title: "Deduplicate getArg/hasFlag local closures in iteration helpers"
phase: 95
wave: 1
complexity: SIMPLE
todo: 95-D
---

# 95-D: Deduplicate getArg/hasFlag Local Closures in Iteration Helpers

## Objective

Replace 5 identical local `getArg()` function definitions (and 1 `hasFlag()` definition) in `src/iteration/__helpers/` CLI entry points with imports from the existing `~/shared/__helpers/cli-utils` module. The shared module already exports `getArg` and `hasFlag` with the exact same signature and logic.

This is an independent DRY cleanup with no dependencies on plan 95-A. It can run in Wave 1 in parallel.

## Context

@src/shared/**helpers/cli-utils.ts -- already exports getArg(args, name, defaultValue) and hasFlag(args, name) with the same logic
@src/iteration/**helpers/convergence.ts -- has local getArg (line 313) and hasFlag (line 319) inside import.meta.main block
@src/iteration/**helpers/metrics-collector.ts -- has local getArg (line 296) inside import.meta.main block
@src/iteration/**helpers/classifier.ts -- has local getArg (line 166) inside import.meta.main block
@src/iteration/**helpers/checkpoint.ts -- has local getArg (line 295) inside import.meta.main block
@src/iteration/**helpers/budget.ts -- has local getArg (line 268) inside import.meta.main block
@src/iteration/index.ts -- barrel, no changes needed (does not export getArg/hasFlag)

## Important Note on Signature Difference

The shared `getArg(args, name, defaultValue)` takes `args` as the first parameter. The local closures define `getArg(name, defaultValue)` as closures over a local `args` variable captured from `Bun.argv.slice(2)` or `Bun.argv.slice(3)`.

The replacement pattern is:

```typescript
// BEFORE (local closure):
const args = Bun.argv.slice(2);
function getArg(name: string, defaultValue: string = ""): string {
  const prefix = `--${name}=`;
  const arg = args.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : defaultValue;
}
// Usage: getArg("name", "default")

// AFTER (shared import):
import { getArg } from "~/shared/__helpers/cli-utils";
const args = Bun.argv.slice(2);
// Usage: getArg(args, "name", "default")
```

Each call site must be updated to pass `args` as the first argument.

## Tasks

### Task 1: Update convergence.ts

**Goal:** Replace local `getArg` and `hasFlag` in `convergence.ts` with imports from shared cli-utils.

**Files:** `src/iteration/__helpers/convergence.ts`

**Steps:**

1. Add import at top of file: `import { getArg, hasFlag } from "~/shared/__helpers/cli-utils";`
2. In the `import.meta.main` block (around line 310):
   - Remove the local `function getArg(name: string, defaultValue: string = ""): string { ... }` definition (lines ~313-317)
   - Remove the local `function hasFlag(name: string): boolean { ... }` definition (lines ~319-321)
   - Keep the `const args = Bun.argv.slice(2);` line
3. Update all call sites inside the `import.meta.main` block to pass `args` as first argument:
   - `getArg("current", "[]")` becomes `getArg(args, "current", "[]")`
   - `getArg("previous", "[]")` becomes `getArg(args, "previous", "[]")`
   - `getArg("artifact-delta", "0")` becomes `getArg(args, "artifact-delta", "0")`
   - `getArg("previous-stale-count", "0")` becomes `getArg(args, "previous-stale-count", "0")`
   - `getArg("stale-threshold", "2")` becomes `getArg(args, "stale-threshold", "2")`
   - `hasFlag("semantic")` becomes `hasFlag(args, "semantic")`
4. Run `bunx --bun tsc --noEmit`.
5. Run `bun test __tests__/src/iteration/` (if iteration tests exist).

**Verification:**

- [ ] No local `getArg` or `hasFlag` definitions remain in the file
- [ ] Import from `~/shared/__helpers/cli-utils` added
- [ ] All call sites pass `args` as first argument
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Update metrics-collector.ts

**Goal:** Replace local `getArg` in `metrics-collector.ts` with import from shared cli-utils.

**Files:** `src/iteration/__helpers/metrics-collector.ts`

**Steps:**

1. Add import at top of file: `import { getArg } from "~/shared/__helpers/cli-utils";`
2. In the `import.meta.main` block (around line 292):
   - Remove the local `function getArg(name: string, defaultValue: string = ""): string { ... }` definition (lines ~296-300)
   - Keep `const args = Bun.argv.slice(2);`
3. Update all call sites to pass `args` as first argument:
   - `getArg("category")` becomes `getArg(args, "category")`
   - `getArg("data")` becomes `getArg(args, "data")`
   - `getArg("path", DEFAULT_METRICS_PATH)` becomes `getArg(args, "path", DEFAULT_METRICS_PATH)`
4. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] No local `getArg` definition remains in the file
- [ ] Import from `~/shared/__helpers/cli-utils` added
- [ ] All call sites pass `args` as first argument
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Update classifier.ts

**Goal:** Replace local `getArg` in `classifier.ts` with import from shared cli-utils.

**Files:** `src/iteration/__helpers/classifier.ts`

**Steps:**

1. Add import at top of file: `import { getArg } from "~/shared/__helpers/cli-utils";`
2. In the `import.meta.main` block (around line 163):
   - Remove the local `function getArg(name: string, defaultValue: string = ""): string { ... }` definition (lines ~166-170)
   - Keep `const args = Bun.argv.slice(2);`
3. Update all call sites to pass `args` as first argument:
   - `getArg("harness-result", '{"checks":[]}')` becomes `getArg(args, "harness-result", '{"checks":[]}')`
   - `getArg("ledger", "{}")` becomes `getArg(args, "ledger", "{}")`
   - `getArg("promotion-threshold", "3")` becomes `getArg(args, "promotion-threshold", "3")`
4. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] No local `getArg` definition remains in the file
- [ ] Import from `~/shared/__helpers/cli-utils` added
- [ ] All call sites pass `args` as first argument
- [ ] `bunx --bun tsc --noEmit` passes

### Task 4: Update checkpoint.ts

**Goal:** Replace local `getArg` in `checkpoint.ts` with import from shared cli-utils.

**Files:** `src/iteration/__helpers/checkpoint.ts`

**Steps:**

1. Add import at top of file: `import { getArg } from "~/shared/__helpers/cli-utils";`
2. In the `import.meta.main` block (around line 291):
   - Remove the local `function getArg(name: string, defaultValue: string = ""): string { ... }` definition (lines ~295-299)
   - Keep `const args = Bun.argv.slice(3);` (note: this file slices at 3 because arg[2] is the subcommand)
3. Update all call sites to pass `args` as first argument:
   - `getArg("record")` becomes `getArg(args, "record")`
   - `getArg("tag")` becomes `getArg(args, "tag")`
   - Other `getArg(...)` calls in the switch cases
4. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] No local `getArg` definition remains in the file
- [ ] Import from `~/shared/__helpers/cli-utils` added
- [ ] All call sites pass `args` as first argument
- [ ] `bunx --bun tsc --noEmit` passes

### Task 5: Update budget.ts

**Goal:** Replace local `getArg` in `budget.ts` with import from shared cli-utils.

**Files:** `src/iteration/__helpers/budget.ts`

**Steps:**

1. Add import at top of file: `import { getArg } from "~/shared/__helpers/cli-utils";`
2. In the `import.meta.main` block (around line 264):
   - Remove the local `function getArg(name: string, defaultValue: string = ""): string { ... }` definition (lines ~268-272)
   - Keep `const args = Bun.argv.slice(3);` (note: this file slices at 3 because arg[2] is the subcommand)
3. Update all call sites to pass `args` as first argument:
   - `getArg("max-iterations", "3")` becomes `getArg(args, "max-iterations", "3")`
   - `getArg("soft-stop-percent", "80")` becomes `getArg(args, "soft-stop-percent", "80")`
   - `getArg("state")` becomes `getArg(args, "state")`
   - Other `getArg(...)` calls in the switch cases
4. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] No local `getArg` definition remains in the file
- [ ] Import from `~/shared/__helpers/cli-utils` added
- [ ] All call sites pass `args` as first argument
- [ ] `bunx --bun tsc --noEmit` passes

### Task 6: Final validation

**Goal:** Confirm all iteration helpers compile and no local getArg/hasFlag definitions remain.

**Steps:**

1. Run `bunx --bun tsc --noEmit` -- full type check.
2. Run `bun test` -- full test suite.
3. Verify no local `function getArg` or `function hasFlag` definitions remain in any `src/iteration/__helpers/` file by searching for the pattern.
4. Verify the iteration module still works as a CLI by spot-checking one entry:
   - `bun run src/iteration/__helpers/classifier.ts --harness-result='{"checks":[]}' --ledger='{}' --promotion-threshold=3` should produce JSON output.

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes
- [ ] Zero local `getArg`/`hasFlag` definitions in `src/iteration/__helpers/`
- [ ] CLI entry points still work when invoked directly

## Success Criteria

- [ ] All 5 local `getArg` definitions removed from iteration helpers
- [ ] The 1 local `hasFlag` definition removed from convergence.ts
- [ ] All replaced with imports from `~/shared/__helpers/cli-utils`
- [ ] All call sites updated to pass `args` as first argument
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes
- [ ] No functional behavior change (same CLI interface, same output)
