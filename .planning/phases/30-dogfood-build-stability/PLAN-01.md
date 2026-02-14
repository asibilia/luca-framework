---
id: "30-01"
title: "Session lock guard and harness safety"
phase: 30
wave: 1
tasks:
  - id: "T1"
    title: "Add session lock creation to session-start.sh"
    description: "Create `.claude/.session-lock` file at session start with a JSON payload containing timestamp and PID for stale lock detection."
    files: ["src/hooks/scripts/session-start.sh"]
    verification: "After build, `.claude/hooks/session-start.sh` creates `.claude/.session-lock` with valid JSON containing `created_at` and `pid` fields. Manually invoke the hook and confirm the lock file appears."
  - id: "T2"
    title: "Add session lock removal to session-persist.sh"
    description: "Remove `.claude/.session-lock` file during session end cleanup. Use `rm -f` to avoid errors if the file was already cleaned up."
    files: ["src/hooks/scripts/session-persist.sh"]
    verification: "After build, `.claude/hooks/session-persist.sh` removes `.claude/.session-lock`. Manually invoke the hook and confirm the lock file is deleted."
  - id: "T3"
    title: "Add session lock guard to build-all.ts"
    description: "Before the build pipeline starts, check for `.claude/.session-lock`. If it exists, print a warning and exit with code 1. Add a `--force` flag that bypasses the guard. Also handle stale locks: if the lock file timestamp is older than 12 hours, treat it as stale and warn but allow the build."
    files: ["scripts/build-all.ts"]
    verification: "Create a fake `.claude/.session-lock` file. Run `bun run build:all` and confirm it exits with code 1 and prints the session-active warning. Run `bun run build:all -- --force` and confirm it proceeds. Remove the lock file and confirm build runs normally."
  - id: "T4"
    title: "Change harness build check from build:all to check:drift"
    description: "In `.planning/config.json`, change the harness `build` check command from `bun run build:all` to `bun run check:drift`. This converts the harness from a destructive rebuild to a read-only drift verification, preventing mid-session artifact replacement. Also update the session-start.sh hook template to use `check:drift` in the generated config for new projects."
    files: [".planning/config.json", "src/hooks/scripts/session-start.sh"]
    verification: "Read `.planning/config.json` and confirm the harness build check uses `bun run check:drift`. Confirm `bun run check:drift` still works correctly (exit 0 when no drift, exit 1 when drift detected)."
  - id: "T5"
    title: "Add .gitignore entries for session lock"
    description: "Add `.claude/.session-lock` to `.gitignore` so the lock file is never committed."
    files: [".gitignore"]
    verification: "Run `git check-ignore .claude/.session-lock` and confirm it returns the path (meaning it would be ignored)."
---

# Plan 30-01: Session Lock Guard and Harness Safety

## Objective

Prevent mid-session artifact breakage by introducing a session lock mechanism that gates `bun run build:all` during active Claude Code sessions, and by converting the harness build check from a destructive rebuild to a read-only drift verification.

This plan addresses **DOGFOOD-02** (explicit rebuild script gates recompilation) and **DOGFOOD-03** (no file watchers trigger plugin recompilation during active sessions).

## Context

Read these files to understand the current system:

- @scripts/build-all.ts -- The unified build script that compiles src/ to .claude/, .cursor/, dist/plugin/
- @src/hooks/scripts/session-start.sh -- Hook that runs at session start, creates .planning/ files
- @src/hooks/scripts/session-persist.sh -- Hook that runs at session end, updates WORKING.md
- @.planning/config.json -- Harness configuration including the `build` check that currently runs `bun run build:all`
- @scripts/check-drift.ts -- Read-only drift detection that regenerates outputs in memory and compares
- @.gitignore -- Current gitignore entries

## Background

The project is self-referential: it uses its own compiled output (`.claude/` directory) during development. The build script (`bun run build:all`) cleans output directories before writing, creating a window where artifacts are missing. If a build runs during an active session, skills, agents, hooks, and rules could become corrupted or missing mid-conversation.

Currently there are no file watchers that auto-trigger builds (DOGFOOD-03 is mostly satisfied). The only remaining risk is the harness `build` check in `.planning/config.json` which runs `bun run build:all` as a phase boundary gate -- this could trigger a destructive rebuild during an active session.

## Task Details

### T1: Add session lock creation to session-start.sh

**Goal:** Create a session lock file at session start to signal that a session is active.

**Implementation:**

Add a new step after Step 7 (environment variables) in `src/hooks/scripts/session-start.sh`:

1. Create `.claude/.session-lock` containing a JSON payload:
   ```json
   {
     "created_at": "2026-02-14T00:00:00Z",
     "pid": 12345
   }
   ```
2. Use `bun -e` to write the JSON (following the project convention of using bun for JSON operations in shell hooks)
3. Place this step after directory creation but before the summary output
4. The lock file path should be `$PROJECT_DIR/.claude/.session-lock`

**Why JSON instead of just `touch`:** The timestamp enables stale lock detection (T3), and PID enables future process-based validation.

### T2: Add session lock removal to session-persist.sh

**Goal:** Clean up the session lock file when a session ends.

**Implementation:**

Add to `src/hooks/scripts/session-persist.sh`, before the `exit 0`:

```bash
# Remove session lock
rm -f "$PROJECT_DIR/.claude/.session-lock"
```

Use `rm -f` (not `rm`) to avoid errors if the file was already removed or never created. This step should be early in the hook (before WORKING.md operations) since removing the lock is the most important cleanup action.

### T3: Add session lock guard to build-all.ts

**Goal:** Gate `bun run build:all` behind a session lock check so it refuses to run during active sessions.

**Implementation:**

Add a session lock check at the very beginning of the `main()` function in `scripts/build-all.ts`, before `generateAllOutputs()`:

1. Check for `process.argv.includes("--force")` to allow override
2. Check if `.claude/.session-lock` exists using `Bun.file().exists()`
3. If lock exists and no `--force`:
   - Read the lock file JSON
   - Parse the `created_at` timestamp
   - If the lock is older than 12 hours, warn about staleness but still block
   - Print a clear error message explaining the situation
   - Print `Run with --force to override, or end the session first.`
   - Exit with code 1
4. If `--force` is provided with an active lock, print a warning but proceed

**Stale lock handling:** If a session crashes without running `session-persist.sh`, the lock file persists. The 12-hour staleness threshold provides a clear signal that the lock is likely orphaned, while still blocking to prevent accidental mid-session rebuilds.

### T4: Change harness build check to check:drift

**Goal:** Convert the harness build check from a destructive rebuild to a read-only verification.

**Implementation:**

1. In `.planning/config.json`, locate the harness `build` check and change:
   - `"command": "bun run build:all"` to `"command": "bun run check:drift"`
   - Keep `"enabled": true` so drift is still detected at phase boundaries
   - Keep `"parser": "generic"` since check-drift outputs plain text

2. In `src/hooks/scripts/session-start.sh`, in the config.json generation template (the `bun -e` block that creates config.json for new projects), update the harness build check in **both runtime branches** (the `bun` branch and the `npm` fallback branch):
   - Change `bun run build:all` to `bun run check:drift` in the bun branch
   - Change `npm run build:all` to `npm run check:drift` in the npm branch
   - Leave `"enabled": false` in the template -- the template is for NEW projects that may not have a `check:drift` script yet; the current project's `.planning/config.json` is updated directly in step 1 above with `"enabled": true`

**Why this matters:** The harness runs at phase boundaries during active sessions. If it uses `build:all`, it would trigger a destructive rebuild (clean + write). Using `check:drift` instead performs a read-only comparison that detects drift without modifying any files.

### T5: Add .gitignore entries

**Goal:** Ensure the session lock file is never committed to git.

**Implementation:**

Add to `.gitignore` under a new comment block:

```
# session management
.claude/.session-lock
```

## Success Criteria

1. `session-start.sh` creates `.claude/.session-lock` with valid JSON on every session start
2. `session-persist.sh` removes `.claude/.session-lock` on every session end
3. `bun run build:all` refuses to run when `.claude/.session-lock` exists (exits with code 1 and clear message)
4. `bun run build:all -- --force` overrides the guard and proceeds with a warning
5. The harness `build` check in `.planning/config.json` uses `bun run check:drift` (read-only, non-destructive)
6. `.claude/.session-lock` is in `.gitignore`
7. All 992+ existing tests continue to pass
8. `bun run check:drift` still works correctly (no regressions)
