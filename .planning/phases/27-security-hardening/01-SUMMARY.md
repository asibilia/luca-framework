# Plan 27-01 Summary: Hook Script Hardening

**Status:** COMPLETE
**Phase:** 27 — Security Hardening
**Wave:** 1
**Plan:** 27-01
**GitHub Issue:** #9
**Branch:** feat/9-audit-tech-debt-cleanup

## Requirements Covered

- **SEC-01**: Validate transcript_path in context-monitor.sh
- **SEC-02**: Sanitize END_REASON in session-persist.sh
- **SEC-05**: Document COMMAND extraction in pre-commit-gate.sh

## Changes Made

### Task 1: Validate `transcript_path` in `context-monitor.sh` (SEC-01)

Added a path validation block after the `TRANSCRIPT_PATH` extraction that:

1. Rejects relative paths (only absolute paths starting with `/` are accepted)
2. Resolves symlinks via `realpath` and verifies the resolved path is within `$HOME`
3. Clears `TRANSCRIPT_PATH` (sets to empty string) for any rejected path, causing the script to fall through to the WORKING.md fallback check

### Task 2: Sanitize `END_REASON` in `session-persist.sh` (SEC-02)

Added a sanitization block after the `END_REASON` extraction that:

1. Strips all characters except alphanumeric, spaces, hyphens, underscores, and periods using `tr -cd`
2. Truncates the result to 100 characters using bash substring expansion
3. Prevents markdown injection into WORKING.md session-end markers

### Task 3: Document `COMMAND` extraction in `pre-commit-gate.sh` (SEC-05)

Replaced the 2-line comment block with a comprehensive 26-line security documentation block covering:

- Input format for both Claude Code and Cursor platforms
- Extraction method safety (JSON.parse, no shell interpolation, printf format string prevention)
- Matching strategy safety (case/esac glob patterns, double-quoting, no eval/exec)
- Maintenance warnings (never eval/exec/source `$COMMAND`, safe extension patterns)

### Task 4: Rebuild and propagate changes

1. Ran `bun run build:all` -- rebuilt all 309 output files across `.claude/`, `.cursor/`, and `dist/plugin/`
2. Synced 3 template copies to `packages/luca-framework/templates/hooks/scripts/`
3. All drift checks passed (30/30 tests)
4. All template sync tests passed (5/5 tests)
5. Full test suite passed (955 pass, 6 skip, 0 fail)

## Verification Results

| Check                                           | Result                          |
| ----------------------------------------------- | ------------------------------- |
| `bash -n context-monitor.sh`                    | PASS (exit 0)                   |
| `bash -n session-persist.sh`                    | PASS (exit 0)                   |
| `bash -n pre-commit-gate.sh`                    | PASS (exit 0)                   |
| `bun run build:all`                             | PASS (309 files)                |
| `bun test scripts/check-drift.test.ts`          | PASS (30/30, 0 drift)           |
| `bun test __tests__/.../hooks-template.test.ts` | PASS (5/5)                      |
| `bun test` (full suite)                         | PASS (955 pass, 6 skip, 0 fail) |

## Files Modified

- `src/hooks/scripts/context-monitor.sh` — SEC-01 path validation
- `src/hooks/scripts/session-persist.sh` — SEC-02 input sanitization
- `src/hooks/scripts/pre-commit-gate.sh` — SEC-05 security documentation
- `.claude/hooks/context-monitor.sh` — compiled output
- `.claude/hooks/session-persist.sh` — compiled output
- `.claude/hooks/pre-commit-gate.sh` — compiled output
- `.cursor/hooks/context-monitor.sh` — compiled output
- `.cursor/hooks/session-persist.sh` — compiled output
- `.cursor/hooks/pre-commit-gate.sh` — compiled output
- `dist/plugin/scripts/context-monitor.sh` — plugin output
- `dist/plugin/scripts/session-persist.sh` — plugin output
- `dist/plugin/scripts/pre-commit-gate.sh` — plugin output
- `packages/luca-framework/templates/hooks/scripts/context-monitor.sh` — template copy
- `packages/luca-framework/templates/hooks/scripts/session-persist.sh` — template copy
- `packages/luca-framework/templates/hooks/scripts/pre-commit-gate.sh` — template copy

## Commits

- `4144c30` fix(hooks): #9 validate transcript_path in context-monitor.sh (SEC-01)
- `0c3d9d0` fix(hooks): #9 sanitize END_REASON in session-persist.sh (SEC-02)
- `8a70c5d` docs(hooks): #9 document COMMAND extraction in pre-commit-gate.sh (SEC-05)
- `3788c3a` build(hooks): #9 rebuild and propagate hardened hook scripts
