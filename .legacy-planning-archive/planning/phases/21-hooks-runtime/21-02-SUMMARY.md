---
id: 21-02
title: "Hook script runtime detection"
phase: 21
status: complete
started: 2026-02-12
completed: 2026-02-12
complexity: COMPLEX
---

# Plan 21-02 Summary: Hook Script Runtime Detection

## Objective

Add runtime detection to `pre-commit-gate.sh`, `post-edit-format.sh`, and `post-edit-typecheck.sh` so they use the correct commands based on whether `bun` or `node` is the configured runtime. Plugin users who do not have bun installed will no longer get silent failures.

## What Changed

### Core Changes

All three hook scripts now include a `read_runtime()` shell function that:

1. Reads `runtime` field from `.planning/config.json` (using `bun -e` or `node -e`)
2. Falls back to `command -v` detection if config is unavailable
3. Defaults to `bun` if neither runtime is found (existing behavior)

### Command Mapping

| Check      | bun runtime                   | node runtime           |
| ---------- | ----------------------------- | ---------------------- |
| Tests      | `bun test`                    | `npm test`             |
| TypeScript | `bunx --bun tsc --noEmit`     | `npx tsc --noEmit`     |
| Formatter  | `bunx --bun prettier --write` | `npx prettier --write` |

### Files Modified

| File                                                               | Change                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `src/hooks/scripts/pre-commit-gate.sh`                             | Added `read_runtime()`, runtime-conditional test and tsc commands                     |
| `src/hooks/scripts/post-edit-format.sh`                            | Added `read_runtime()`, `FORMATTER_CMD` variable replaces 6 hardcoded formatter calls |
| `src/hooks/scripts/post-edit-typecheck.sh`                         | Added `read_runtime()`, `TSC_CMD` variable replaces hardcoded tsc call                |
| `__tests__/src/hooks/hook-registry.test.ts`                        | Updated to expect 7 registry entries and 5 event types (session-start from 21-01)     |
| `__tests__/packages/luca-framework/hooks-template.test.ts`         | Updated to expect 7 template scripts and 5 event types                                |
| `packages/luca-framework/templates/hooks/scripts/session-start.sh` | Added (template for session-start hook from 21-01)                                    |
| `packages/luca-framework/templates/hooks/settings-hooks.json`      | Added SessionStart event                                                              |
| `packages/luca-framework/templates/hooks/cursor-hooks.json`        | Added sessionStart event                                                              |

### Build Outputs Updated

Updated scripts distributed to all 3 output locations:

- `.claude/hooks/` (7 hooks)
- `.cursor/hooks/` (7 hooks)
- `dist/plugin/scripts/` (6 hooks, excluding drift-check)

## Design Decisions

1. **Duplicated `read_runtime()` in each script**: Hook scripts must be self-contained (plugin context has no `source` dependencies). The duplication across 3 scripts is intentional and acceptable.

2. **`set +e` / `set -e` wrapping**: Used for bun/node subshell calls in `read_runtime()` instead of `|| true`, per project conventions in MEMORY.md.

3. **JSON parsing via `bun -e` unchanged**: The stdin JSON parsing at the top of each script still uses `bun -e`. These are hard dependencies on the hook infrastructure. Only the quality-check commands (test/tsc/prettier) become runtime-conditional.

4. **Formatter `|| true` preserved**: All formatter calls in `post-edit-format.sh` retain `|| true` because formatting is non-blocking by design.

## Verification

- `bun run build:all` completes without errors (308 files generated)
- `bun test` passes: 877 pass, 6 skip, 0 fail
- All 9 output locations contain `read_runtime()` (3 scripts x 3 destinations)
- Existing behavior fully preserved when bun is available

## Commits

1. `6c53892` feat(hooks): #7 add runtime detection to pre-commit-gate.sh
2. `dc3eda7` feat(hooks): #7 add runtime detection to post-edit-format.sh
3. `ff70b74` feat(hooks): #7 rebuild outputs, fix tests for session-start hook
