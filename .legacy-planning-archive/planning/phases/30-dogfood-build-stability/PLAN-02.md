---
id: "30-02"
title: "Build manifest, dogfood config, and test coverage"
phase: 30
wave: 2
depends_on: ["30-01"]
tasks:
  - id: "T1"
    title: "Write build manifest in build-all.ts"
    description: "After a successful build, write `.claude/.build-manifest.json` containing build metadata: timestamp, source file count, output file count, and build version from package.json."
    files: ["scripts/build-all.ts"]
    verification: "Run `bun run build:all` (with no session lock or with `--force`). Confirm `.claude/.build-manifest.json` exists and contains valid JSON with `built_at`, `output_count`, and `version` fields."
  - id: "T2"
    title: "Record build manifest at session start"
    description: "In `session-start.sh`, after creating the session lock, read `.claude/.build-manifest.json` if it exists and record the `built_at` timestamp in the session lock payload. This allows post-session comparison to detect if artifacts changed during the session."
    files: ["src/hooks/scripts/session-start.sh"]
    verification: "Run a session start hook with a pre-existing build manifest. Confirm the `.claude/.session-lock` file includes a `build_manifest_at` field matching the manifest's `built_at` value."
  - id: "T3"
    title: "Add dogfood config section to .planning/config.json"
    description: "Add a `dogfood` section to `.planning/config.json` that formally declares the self-referential consumption model: source directory, output directories, build command, and lock file path. Also update the session-start.sh hook template to include the dogfood section when generating config.json for new projects."
    files: [".planning/config.json", "src/hooks/scripts/session-start.sh"]
    verification: "Read `.planning/config.json` and confirm the `dogfood` section exists with `enabled`, `source`, `outputs`, `build_command`, and `lock_file` fields."
  - id: "T4"
    title: "Add .gitignore entry for build manifest"
    description: "Add `.claude/.build-manifest.json` to `.gitignore` so the manifest is never committed (it is a build artifact, not source)."
    files: [".gitignore"]
    verification: "Run `git check-ignore .claude/.build-manifest.json` and confirm it returns the path."
  - id: "T5"
    title: "Write tests for session lock guard in build-all.ts"
    description: "Create `__tests__/scripts/dogfood-stability.test.ts` with tests covering: (1) build refuses when session lock exists, (2) build proceeds with --force, (3) stale lock detection (12-hour threshold), (4) build manifest is written on successful build, (5) build manifest contains required fields."
    files: ["__tests__/scripts/dogfood-stability.test.ts"]
    verification: "Run `bun test __tests__/scripts/dogfood-stability.test.ts` and confirm all tests pass."
  - id: "T6"
    title: "Run full test suite and verify no regressions"
    description: "Run `bun test` to confirm all 992+ existing tests still pass alongside the new tests. Run `bun run check:drift` to confirm drift detection works with the harness config change from Plan 01."
    files: []
    verification: "All tests pass. `bun run check:drift` exits with code 0 (no drift) after a clean build."
---

# Plan 30-02: Build Manifest, Dogfood Config, and Test Coverage

## Objective

Complete the dogfood build stability feature by adding a build manifest for artifact freshness tracking, formalizing the dogfood configuration, and adding comprehensive test coverage for all new behavior introduced in this phase.

This plan addresses **DOGFOOD-01** (plugin output consumed as workspace self-reference) and **DOGFOOD-04** (session-start snapshot of compiled artifacts to stable location).

**DOGFOOD-04 interpretation:** DOGFOOD-04 is satisfied by the _combination_ of the build guard (Plan 01 T3) and the build manifest (this plan T1/T2), not by a literal file-system snapshot. The build manifest records the build timestamp at session start, enabling post-hoc detection of any artifact changes, while the session lock guard prevents changes from happening in the first place. Together these provide the same guarantee as a full snapshot without the cost of copying the entire output directory.

## Context

Read these files to understand the current system and changes from Plan 01:

- @scripts/build-all.ts -- The build script (now includes session lock guard from Plan 01)
- @src/hooks/scripts/session-start.sh -- Hook that creates session lock (modified in Plan 01)
- @src/hooks/scripts/session-persist.sh -- Hook that removes session lock (modified in Plan 01)
- @.planning/config.json -- Project config (harness check updated in Plan 01)
- @.gitignore -- Gitignore entries (session lock added in Plan 01)
- @**tests**/scripts/build-output.test.ts -- Existing build output tests (pattern reference)
- @scripts/build-utils.ts -- Build utilities (ensureDir, cleanDirectory)
- @package.json -- Version field used for build manifest

## Background

Plan 01 introduced the session lock guard and harness safety changes. This plan builds on those foundations by:

1. **Build manifest** (DOGFOOD-04): Instead of snapshotting the entire `.claude/` directory at session start (expensive, fragile), we write a lightweight manifest at build time and record it in the session lock. This provides the same freshness guarantee: if the manifest changes during a session, the artifacts changed.

2. **Dogfood config** (DOGFOOD-01): The self-referential consumption model (project uses its own compiled output) should be formally declared in `.planning/config.json` rather than being implicit knowledge.

3. **Tests**: All new behavior from both Plan 01 and Plan 02 needs test coverage.

## Task Details

### T1: Write build manifest in build-all.ts

**Goal:** Create a manifest file after each successful build that records build metadata.

**Implementation:**

At the end of the `main()` function in `scripts/build-all.ts`, after the build summary is printed (Step 6), add a new Step 7:

1. Read version from `package.json` using `Bun.file`
2. Build the manifest object:
   ```typescript
   const manifest = {
     built_at: new Date().toISOString(),
     output_count: keys.length,
     version: packageVersion,
   };
   ```
3. Write to `.claude/.build-manifest.json`:
   ```typescript
   await Bun.write(
     path.join(claudeDir, ".build-manifest.json"),
     JSON.stringify(manifest, null, 2) + "\n",
   );
   ```
4. Log: `console.log("Build manifest written to .claude/.build-manifest.json");`

**Design choices:**

- Use snake_case for JSON fields per API snake_case convention
- Keep the manifest minimal -- only fields needed for freshness detection
- The manifest is written AFTER all files are written, so it acts as a "build complete" signal

### T2: Record build manifest at session start

**Goal:** Capture the build manifest timestamp in the session lock so we can detect mid-session artifact changes.

**Implementation:**

In `src/hooks/scripts/session-start.sh`, modify the session lock creation step (added in Plan 01) to also read `.claude/.build-manifest.json`:

1. Before writing the session lock, check if `.claude/.build-manifest.json` exists
2. If it exists, parse the `built_at` field
3. Include `build_manifest_at` in the session lock JSON payload:
   ```json
   {
     "created_at": "2026-02-14T00:00:00Z",
     "pid": 12345,
     "build_manifest_at": "2026-02-14T00:00:00Z"
   }
   ```
4. If the manifest does not exist, set `build_manifest_at` to `null`

This enables future diagnostics: if a session ends and the build manifest's `built_at` differs from the session lock's `build_manifest_at`, artifacts were rebuilt mid-session.

### T3: Add dogfood config section

**Goal:** Formally declare the self-referential consumption model in configuration.

**Implementation:**

1. Add to `.planning/config.json` (at the top level, after `runtime`):

   ```json
   {
     "dogfood": {
       "enabled": true,
       "source": "src/",
       "outputs": [".claude/", ".cursor/"],
       "build_command": "bun run build:all",
       "lock_file": ".claude/.session-lock",
       "manifest_file": ".claude/.build-manifest.json"
     }
   }
   ```

2. In `src/hooks/scripts/session-start.sh`, update the config.json generation template (the `bun -e` block) to include the `dogfood` section in the default config for new projects.

**Why formalize this:** The self-referential nature of this project is a critical architectural fact. Making it explicit in config means:

- Future tooling can read it programmatically
- New contributors immediately understand the consumption model
- Automated checks can validate the dogfood relationship

### T4: Add .gitignore entry for build manifest

**Goal:** Ensure the build manifest is never committed.

**Implementation:**

In `.gitignore`, extend the session management section (added in Plan 01):

```
# session management
.claude/.session-lock
.claude/.build-manifest.json
```

### T5: Write dogfood stability tests

**Goal:** Comprehensive test coverage for all new behavior.

**Implementation:**

Create `__tests__/scripts/dogfood-stability.test.ts` with:

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
```

**Test groups:**

1. **Session lock guard** (tests that exercise the lock check logic):
   - Test: build-all.ts detects session lock and refuses to proceed
   - Test: `--force` flag bypasses the lock guard
   - Test: stale lock (timestamp older than 12 hours) is detected and reported
   - Test: missing lock file allows build to proceed normally

2. **Build manifest**:
   - Test: manifest file is valid JSON with required fields (`built_at`, `output_count`, `version`)
   - Test: `built_at` is a valid ISO 8601 timestamp
   - Test: `output_count` is a positive integer
   - Test: `version` matches package.json version

3. **Harness config safety**:
   - Test: harness `build` check command is `bun run check:drift` (not `bun run build:all`)
   - Test: harness `build` check is enabled

**Test approach for session lock guard tests:** Use subprocess-based testing via `Bun.spawn()` to exercise the lock guard end-to-end. Tests should:

- Create a temporary `.claude/.session-lock` file in the project root before each lock guard test
- Spawn `bun run build:all` as a subprocess using `Bun.spawn(["bun", "run", "build:all"], { cwd: projectRoot, stderr: "pipe" })`
- Check the exit code (`1` when locked, `0` when not locked)
- Capture stderr to validate the warning message content
- For `--force` tests, spawn with `Bun.spawn(["bun", "run", "build:all", "--", "--force"], { cwd: projectRoot, stderr: "pipe" })`
- Clean up the temporary lock file in `afterEach` to avoid interfering with real sessions

**Test approach for manifest and config tests:** These are read-only assertions and do not need subprocess spawning:

- Read the actual `.planning/config.json` for harness config assertions
- Read the actual `.claude/.build-manifest.json` for manifest assertions (skip if not present, like `build-output.test.ts` does)
- Follow the existing test patterns in `__tests__/scripts/build-output.test.ts`

### T6: Full regression check

**Goal:** Confirm no regressions from the full Phase 30 implementation.

**Steps:**

1. Run `bun test` -- all tests must pass (992+ existing + new dogfood tests)
2. Run `bun run check:drift` -- must exit 0 (no drift after a clean build)
3. Verify the end-to-end flow:
   - Session lock is created on session start
   - Build is blocked during active session
   - Build proceeds with `--force`
   - Build manifest is written
   - Session lock is removed on session end

## Success Criteria

1. `.claude/.build-manifest.json` is written after every successful `bun run build:all` with valid JSON
2. Session lock includes `build_manifest_at` from the manifest (or null if no manifest exists)
3. `.planning/config.json` contains a `dogfood` section declaring the self-referential model
4. `.claude/.build-manifest.json` is in `.gitignore`
5. All new tests in `__tests__/scripts/dogfood-stability.test.ts` pass
6. All 992+ existing tests continue to pass
7. `bun run check:drift` works correctly with the new config
8. The session-start.sh config template includes both the `check:drift` harness change and the `dogfood` section
