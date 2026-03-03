# 89-A Summary: Fix Test Suite Isolation -- 31 Failures in Full `bun test` Run

**Status:** COMPLETE
**Tests before:** 2858 pass, 31 fail (full suite)
**Tests after:** 2874 pass, 0 fail (full suite, two consecutive runs)
**Net test change:** +16 passing (previously-hidden tests now reaching pass due to isolation fix)

## Root Cause Analysis

The 31 failures fell into three categories:

### Category A: Stale Tests (20 failures, always fail)

Tests that were out of sync with source code changes:

1. **Pi extension renderCall/renderResult (11 tests)** -- `luca-subagents.ts` was missing `renderCall` and `renderResult` methods that E2E tests expected. Additionally, E2E tests treated return values as strings, but the Pi extension API requires component objects with `render()` and `invalidate()` methods.

2. **luca-widgets event count (2 tests)** -- Source had 9 `pi.on()` registrations (added `error` and `api_error` handlers) but tests expected 7.

3. **tool_result event shape (4 tests)** -- Tests passed `event.result.content` but source reads `event.content` directly.

4. **setFooter component pattern (1 test)** -- Footer renderer returns `{render(), invalidate()}` component, not a string.

5. **AGENT_CATEGORIES staleness (1 test)** -- 4 new roadmap agents missing from category map.

6. **Autopilot content rename (1 test)** -- "Phase Execution Loop" renamed to "Level-Based Execution Loop" in source.

### Category B: Global Mock Pollution (11 failures, only in full suite)

Two test files in `__tests__/packages/luca-framework/` used `mock.module("fs", ...)` with incomplete re-exports:

- **`config-validation.test.ts`** -- `mock.module("fs", () => ({ existsSync }))` only exported `existsSync`, stripping `writeFileSync`, `readFileSync`, `mkdirSync`, etc.
- **`update.test.ts`** -- `mock.module("fs", () => ({...partial, existsSync: mock(() => false)}))` replaced `existsSync` with a mock returning `false`.

In Bun's test runner, `mock.module` is **global and persistent** across all test files in a run. ESM `import { existsSync } from "node:fs"` IS affected by `mock.module("fs")`. This broke 7 hook-handler tests and 4 state-bridge-write tests that ran after the luca-framework tests.

### Category C: Stale Mock (1 failure)

- **`state-bridge-write.test.ts`** -- Test for "stateExists false" expected `writeField` to call mocked `stateExists()`, but source was refactored to use `existsSync` directly and auto-create `state.json` when missing.

## Changes Made

### Source Changes (2 files)

| File                                        | Change                                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/pi-extensions/luca-subagents.ts` | Added `renderCall` to `luca_subagent_create` tool; added `renderResult` to `luca_subagent_result` tool                                    |
| `scripts/build-shared.ts`                   | Added 4 roadmap agents to `AGENT_CATEGORIES`: `lu-roadmap-architect`, `lu-roadmap-prioritizer`, `lu-roadmap-qa`, `lu-roadmap-synthesizer` |

### Test Changes (6 files)

| File                                                                                  | Change                                                                                                                                          |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/src/hooks/pi-extension-e2e.test.ts`                                        | Updated event count 7->9; updated renderCall/renderResult tests to use `.render(80)` on components; fixed setFooter to handle component returns |
| `__tests__/src/hooks/pi-workflow-extensions.test.ts`                                  | Updated event count 7->9; fixed 4 tool_result event data shapes (`event.content` not `event.result.content`)                                    |
| `__tests__/packages/luca-framework/src/utils/doctor/checks/config-validation.test.ts` | Changed `mock.module("fs")` to spread full real `fs` module (`...realFs`) instead of exporting only `existsSync`                                |
| `__tests__/packages/luca-framework/src/commands/update.test.ts`                       | Changed `mock.module("fs")` to spread full real `fs` module; removed destructive `existsSync: mock(() => false)` override                       |
| `__tests__/src/hooks/pi-extensions/__helpers/state-bridge-write.test.ts`              | Updated "stateExists false" test to match new auto-create behavior                                                                              |
| `__tests__/src/skills/general/autopilot.skill.test.ts`                                | Updated "Phase Execution Loop" to "Level-Based Execution Loop"                                                                                  |

## Key Learnings

1. **`mock.module` in Bun is global and persistent** -- It affects ALL test files in the same `bun test` run, not just the file that defines the mock. Any `mock.module("fs", ...)` must spread the full real module (`...realFs`) and only override specific functions.

2. **`mock.module("fs")` affects `import from "node:fs"`** -- In Bun's ESM resolution, mocking `"fs"` also intercepts `"node:fs"` imports. CJS `require("node:fs")` is not affected the same way.

3. **Incomplete mock re-exports are silent time bombs** -- Exporting only `existsSync` from a `mock.module("fs")` call strips `writeFileSync`, `readFileSync`, etc. from ALL other test files. This only manifests in full-suite runs, making it hard to diagnose.

## Verification

- `bun test`: 2874 pass, 0 fail (two consecutive runs)
- `bunx --bun tsc --noEmit`: clean (no errors)
- `bun run build:all --force`: 468 files generated successfully
