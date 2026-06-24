---
id: 21-01
title: "Hook registry and build pipeline updates"
phase: 21
status: complete
complexity: COMPLEX
branch: 7--claude-code-plugin-distribution
ticket: "#7"
commits:
  - e0a405f feat(hooks): #7 add session-start hook to registry
  - f347bca feat(hooks): #7 add PLUGIN_EXCLUDED_HOOKS constant
  - a6ebbdf feat(hooks): #7 filter excluded hooks from plugin build
  - 265e4f5 feat(hooks): #7 create placeholder session-start.sh script
  - feac702 feat(hooks): #7 build outputs for session-start hook and plugin filtering
---

# Plan 21-01 Summary: Hook Registry and Build Pipeline Updates

## Objective

Add a `session-start` hook to the hook registry and introduce `PLUGIN_EXCLUDED_HOOKS` filtering in the plugin build script so the plugin excludes development-only hooks while including the new `session-start` hook.

## What Changed

### Task 1: Added `session-start` to hookRegistry

**File:** `src/hooks/index.ts`

- Added 7th entry to `hookRegistry` with `event: "SessionStart"`, `cursorEvent: "sessionStart"`, 15s timeout, synchronous execution, and `"Initializing Luca..."` status message.
- No matcher (fires on every session start).

### Task 2: Added `PLUGIN_EXCLUDED_HOOKS` constant

**File:** `scripts/build-plugin.ts`

- Defined `PLUGIN_EXCLUDED_HOOKS: ReadonlySet<string>` containing `"pre-commit-drift-check"`.
- Follows the exact same pattern as `COMMAND_EXCLUDED_SKILLS`.
- JSDoc documents why each hook is excluded (references dev-only `scripts/check-drift.ts`).

### Task 3: Applied filtering in plugin build pipeline

**File:** `scripts/build-plugin.ts`

- Created `pluginHookRegistry` by filtering `hookRegistry` against `PLUGIN_EXCLUDED_HOOKS`.
- Updated hook copy loop to iterate `pluginHookRegistry` instead of `hookRegistry`.
- Updated `generatePluginHooksConfig()` call to use `pluginHookRegistry`.
- Added exclusion logging: `Excluded 1 hook(s): pre-commit-drift-check`.

### Task 4: Created placeholder `session-start.sh`

**File:** `src/hooks/scripts/session-start.sh` (new)

- Minimal valid hook script with shebang, `set -euo pipefail`, stdin read, and `exit 0`.
- Marked as placeholder for full implementation in Plan 21-03.
- File is executable (`chmod +x`).

### Task 5: Verified full build pipeline

- `bun run build:all` completes successfully.
- Dev outputs: 7 hooks in `.claude/hooks/` and `.cursor/hooks/` (including `session-start.sh`).
- Plugin outputs: 6 hooks in `dist/plugin/scripts/` (excluding `pre-commit-drift-check.sh`).
- Plugin `hooks.json` contains `SessionStart` section, no drift-check references.
- Plugin manifest lists `session-start`, excludes `pre-commit-drift-check`.
- All tests pass (one pre-existing drift in `post-edit-typecheck.sh` unrelated to this plan).

## Verification Results

| Criteria                                                                          | Status |
| --------------------------------------------------------------------------------- | ------ |
| hookRegistry has 7 entries including `session-start`                              | PASS   |
| `PLUGIN_EXCLUDED_HOOKS` set exists following `COMMAND_EXCLUDED_SKILLS` pattern    | PASS   |
| Plugin build excludes `pre-commit-drift-check` from scripts, hooks.json, manifest | PASS   |
| Plugin build includes `session-start` in scripts, hooks.json, manifest            | PASS   |
| All builds (dev + plugin) complete without errors                                 | PASS   |
| Build log shows `Excluded 1 hook(s): pre-commit-drift-check`                      | PASS   |
| `.claude/settings.json` contains `SessionStart` event section                     | PASS   |
| `.cursor/hooks.json` contains `sessionStart` event entry                          | PASS   |

## Pre-existing Issues (Not Introduced)

- `post-edit-typecheck.sh` has a content drift between source and output (3 comment lines differ). This is pre-existing and unrelated to Plan 21-01 changes.

## Files Modified

| File                                     | Action                                            |
| ---------------------------------------- | ------------------------------------------------- |
| `src/hooks/index.ts`                     | Modified (added session-start entry)              |
| `scripts/build-plugin.ts`                | Modified (added PLUGIN_EXCLUDED_HOOKS, filtering) |
| `src/hooks/scripts/session-start.sh`     | Created (placeholder)                             |
| `.claude/hooks/session-start.sh`         | Generated (build output)                          |
| `.cursor/hooks/session-start.sh`         | Generated (build output)                          |
| `.claude/settings.json`                  | Regenerated (includes SessionStart)               |
| `.cursor/hooks.json`                     | Regenerated (includes sessionStart)               |
| `dist/plugin/scripts/session-start.sh`   | Generated (build output)                          |
| `dist/plugin/hooks/hooks.json`           | Regenerated (filtered)                            |
| `dist/plugin/.claude-plugin/plugin.json` | Regenerated (filtered manifest)                   |
