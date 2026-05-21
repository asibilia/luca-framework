---
id: "101-04"
title: "Hook portability finalization and drift check"
phase: 101
wave: 2
complexity: MODERATE
depends_on: []
tasks:
  - id: "101-04-1"
    title: "Audit all hook scripts for cross-platform stdin/stdout consistency"
    goal: "Verify every shell script in src/hooks/scripts/ handles both Claude Code and Cursor JSON stdin formats and documents the contract in header comments"
    verify: "All 9 shell scripts have documented stdin/stdout contracts; all handle both platform formats; no script assumes single-platform input"
  - id: "101-04-2"
    title: "Add missing platform event mappings to canonical hook registry"
    goal: "Audit the canonical hook registry (from Phase 100-07) for completeness — ensure every hook has correct event mappings for all 3 platforms and no mapping returns undefined"
    verify: "Every canonical hook resolves to valid platform events for claude, cursor, and pi; no undefined or empty event names; unit test verifies all mappings"
  - id: "101-04-3"
    title: "Run full build pipeline and verify zero drift"
    goal: "Execute bun run build:all followed by bun run check:drift to confirm all generated output files match source — no stale, missing, or drifted files"
    verify: "bun run build:all completes without errors; bun run check:drift exits 0 with 'No drift detected' message"
  - id: "101-04-4"
    title: "Add pre-commit drift check hook validation test"
    goal: "Create a test that verifies the pre-commit-drift-check.sh hook correctly detects and reports drift when source and output are out of sync"
    verify: "Test simulates drift scenario; pre-commit-drift-check.sh exits non-zero when drift exists; exits 0 when no drift; bun test passes"
  - id: "101-04-5"
    title: "Update hook portability regression test suite"
    goal: "Extend the hook portability tests (from Phase 100-07) to cover any edge cases found during the audit — missing matchers, empty command filters, platform-specific quirks"
    verify: "Hook portability tests cover all edge cases; all tests pass; no regressions from Phase 100 changes"
---

# 101-04: Hook Portability Finalization and Drift Check

## Goal

Finalize the hook portability work started in Phase 100-07. This plan performs a comprehensive audit of all hook scripts for cross-platform consistency, verifies the canonical hook registry has complete platform mappings, confirms the build pipeline produces zero drift, and strengthens the regression test suite. This is the final quality gate before v2.7.0 can ship hook portability as a completed feature.

## Context

@src/hooks/scripts/\*.sh -- All 9 hook shell scripts
@src/hooks/**schemas/hook.schemas.ts -- CanonicalHookSchema, HookDefinitionSchema, CANONICAL_EVENTS
@src/hooks/**helpers/hook-registry.ts -- canonicalHookRegistry, hookRegistry, resolveCanonicalRegistry
@src/hooks/**helpers/platform-adapters.ts -- adaptForClaude, adaptForCursor, adaptForPi, canonicalToLegacy
@src/hooks/**helpers/config-generators.ts -- Platform-specific config generators
@src/hooks/index.ts -- Hooks barrel exports
@scripts/check-drift.ts -- Drift detection script
@scripts/build-all.ts -- Build pipeline
@**tests**/src/hooks/hook-portability.test.ts -- Existing portability tests (from Phase 100-07)
@.claude/settings.json -- Generated Claude Code settings with hooks config
@.cursor/hooks.json -- Generated Cursor hooks config

**Architecture constraints:**

- Source lives in `src/hooks/` -- never edit generated files in `.claude/`, `.cursor/`, `.pi/`
- Shell scripts must handle both Claude Code and Cursor JSON stdin formats
- `bun run build:all` must produce byte-identical output to what is committed
- `bun run check:drift` is the automated enforcement mechanism
- All hook scripts use `#!/usr/bin/env bash` with `set -euo pipefail`
- JSON parsing in scripts uses `bun -e` (not jq) per project convention

**Phase 100-07 established:**

- CanonicalHookSchema with platform-independent event types
- Platform adapters (adaptForClaude, adaptForCursor, adaptForPi)
- canonicalHookRegistry with all hooks in canonical format
- Legacy hookRegistry preserved via canonicalToLegacy
- Initial hook portability regression test suite

**This plan finalizes:**

- Audit all scripts for cross-platform completeness
- Fill any gaps in platform event mappings
- Verify zero drift end-to-end
- Strengthen regression tests with edge cases

## Tasks

### Task 101-04-1: Audit all hook scripts for cross-platform stdin/stdout consistency

Audit every shell script in `src/hooks/scripts/` for cross-platform compatibility.

**Scripts to audit:**

| Script                       | Purpose                    | Stdin     | Critical Check                       |
| ---------------------------- | -------------------------- | --------- | ------------------------------------ |
| `post-edit-format.sh`        | Format files after edit    | file_path | Extracts file_path from both formats |
| `post-edit-typecheck.sh`     | Type check after edit      | file_path | Extracts file_path from both formats |
| `pre-commit-gate.sh`         | Block bad commits          | command   | Extracts command from both formats   |
| `pre-commit-drift-check.sh`  | Block drifted commits      | command   | Extracts command from both formats   |
| `context-check-throttled.sh` | Monitor context usage      | any event | Handles missing fields gracefully    |
| `snapshot-sync.sh`           | Sync STATE.md              | any event | Handles missing fields gracefully    |
| `context-monitor.sh`         | Context exhaustion warning | minimal   | Handles empty stdin                  |
| `session-persist.sh`         | Save session state         | minimal   | Handles empty stdin                  |
| `session-start.sh`           | Initialize session         | minimal   | Handles empty stdin                  |

**Audit checklist per script:**

1. Header comment documents stdin format for each platform
2. Header comment documents stdout format (or "no output") for each platform
3. Header comment documents exit codes
4. JSON extraction handles both `data.tool_input.command` (Claude) and `data.command` (Cursor)
5. Script does not crash on empty stdin
6. Script does not crash on malformed JSON stdin
7. Uses `bun -e` for JSON parsing (not jq)

**Steps:**

1. Read each script and verify all 7 checklist items
2. Fix any scripts that assume a single platform format
3. Add missing header documentation
4. Test each script with both platform JSON formats manually

**Verify:**

- [ ] All 9 scripts have documented stdin/stdout/exit code contracts
- [ ] All scripts handle both Claude and Cursor JSON formats
- [ ] All scripts handle empty or malformed stdin without crashing
- [ ] All scripts use `bun -e` for JSON parsing
- [ ] No script has platform-specific assumptions

### Task 101-04-2: Add missing platform event mappings to canonical hook registry

Audit the canonical hook registry for completeness.

**Steps:**

1. Import `resolveCanonicalRegistry` and `adaptForClaude`, `adaptForCursor`, `adaptForPi`
2. For each hook in the canonical registry:
   - Call all 3 adapters
   - Verify no adapted event name is `undefined` or empty string
   - Verify matchers are correctly transformed per platform
3. Fix any missing mappings in platform-adapters.ts

**Specific edge cases to check:**

- `context-check-throttled` hook: has no `tool_filter` -- verify all platforms handle this correctly (fire on all tool events, not just filtered ones)
- `snapshot-sync` hook: same as above (no tool_filter)
- `context-monitor` hook: uses `stop` canonical event -- verify all 3 platforms map this correctly
- `session-persist` hook: uses `session_end` canonical event -- verify Cursor mapping is correct (not all Cursor events have been verified)
- `pre-commit-drift-check` hook: has both `tool_filter` and `command_filter` -- verify Pi adapter handles both

**Verify:**

- [ ] Every hook produces valid platform configs for all 3 platforms
- [ ] No undefined or empty event names after adaptation
- [ ] Hooks without tool_filter correctly fire on all tools
- [ ] Command_filter correctly translated for each platform
- [ ] Unit test added verifying all mappings are non-empty

### Task 101-04-3: Run full build pipeline and verify zero drift

Execute the full build pipeline and drift check.

```bash
bun run build:all
bun run check:drift
```

**What to check:**

1. `bun run build:all` completes without errors
2. `bun run check:drift` exits with code 0
3. No drifted files (output differs from source)
4. No missing files (source exists but output not generated)
5. No orphaned/stale files (output exists but no source)

**If drift is detected:**

1. Identify the drifted file(s)
2. Determine whether the drift is from:
   - Source changes not yet built (fix: `bun run build:all`)
   - Generated output edited directly (fix: revert and edit source)
   - Build logic change (fix: update source to produce correct output)
3. Fix the drift and re-run

**Verify:**

- [ ] `bun run build:all` completes without errors
- [ ] `bun run check:drift` reports "No drift detected"
- [ ] Exit code 0 from both commands
- [ ] `.claude/hooks/` scripts match `src/hooks/scripts/`
- [ ] `.cursor/hooks/` scripts match `src/hooks/scripts/`
- [ ] `.claude/settings.json` hooks section matches generated output
- [ ] `.cursor/hooks.json` matches generated output

### Task 101-04-4: Add pre-commit drift check hook validation test

Create `__tests__/src/hooks/drift-check-hook.test.ts`.

Tests verifying that the `pre-commit-drift-check.sh` hook correctly detects drift.

**Test scenarios:**

1. **No drift**: Set up a temp project where all outputs match source. Simulate a commit command. Verify exit 0 (allow).
2. **Drift detected**: Set up a temp project, then modify a generated file (simulating direct edit). Simulate a commit command. Verify exit 2 (block) with appropriate deny message.
3. **Non-commit command**: Send a non-commit bash command. Verify exit 0 immediately (fast path, no drift check).
4. **Missing build artifacts**: No generated output exists at all. Verify the script handles this gracefully (either skip or report).

**Steps:**

1. Create temp project directory with minimal structure
2. Run `simulateHookExecution` (from Task 101-03-1 or create inline) on `pre-commit-drift-check.sh`
3. Verify exit codes and stdout

**Verify:**

- [ ] Test file exists at `__tests__/src/hooks/drift-check-hook.test.ts`
- [ ] Tests cover no-drift, drift-detected, non-commit, and missing-artifacts scenarios
- [ ] All tests pass: `bun test __tests__/src/hooks/drift-check-hook.test.ts`
- [ ] Tests are deterministic (temp directory cleanup)

### Task 101-04-5: Update hook portability regression test suite

Extend `__tests__/src/hooks/hook-portability.test.ts` with additional edge case tests.

**New tests to add:**

1. **Hooks without tool_filter**: Verify that hooks with no `tool_filter` (context-check-throttled, snapshot-sync) produce valid platform configs without matchers
2. **Hooks with both tool_filter and command_filter**: Verify pre-commit-gate and pre-commit-drift-check produce correct matchers on all platforms
3. **Pi array matcher format**: Verify adaptForPi correctly splits pipe-separated tool_filter into string arrays (e.g., "Edit|Write" -> ["edit", "write"])
4. **Empty canonical registry**: Verify resolveCanonicalRegistry handles an empty registry without errors
5. **Round-trip consistency**: Verify canonical -> legacy -> verify output matches directly calling legacy registry

**Verify:**

- [ ] 5+ new edge case tests added to hook-portability.test.ts
- [ ] All tests pass: `bun test __tests__/src/hooks/hook-portability.test.ts`
- [ ] No regressions from existing tests
- [ ] Edge cases documented with inline comments

## Success Criteria

- [ ] All 9 hook scripts have complete cross-platform stdin/stdout documentation
- [ ] All hooks handle both Claude Code and Cursor JSON formats
- [ ] Every canonical hook maps to valid platform events for all 3 platforms
- [ ] `bun run build:all` completes without errors
- [ ] `bun run check:drift` reports zero drift
- [ ] Pre-commit drift check hook correctly detects and blocks drifted commits
- [ ] Hook portability regression tests cover all edge cases
- [ ] All tests pass: `bun test`
- [ ] `bunx --bun tsc --noEmit` passes
