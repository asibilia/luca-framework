---
phase: 173
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: [172]
---

# Phase 173 Plan 1: MuninnDB Binary Management

## Objective

Implement binary download, installation, health checking, and service management for MuninnDB so that `luca init` can automatically provision the MuninnDB runtime. MuninnDB is Luca's semantic graph memory system -- without it, cognitive pre-flight, learning capture, and session context are unavailable.

This phase adds the infrastructure layer: given a platform (darwin-arm64, darwin-x64, linux-x64, linux-arm64), download the correct binary, place it in `~/.luca/bin/muninndb`, verify it starts and responds on port 8476, and provide start/stop lifecycle management.

## Context

@packages/luca-framework/src/commands/init.ts — Setup orchestrator (will consume muninndb step)
@packages/luca-framework/src/utils/prerequisites.ts — Platform detection patterns (PlatformInfoSchema, checkPlatform)
@packages/luca-framework/src/utils/luca-home.ts — Home directory management (LucaHomePathsSchema, ensureLucaHome)
@packages/luca-framework/src/utils/runtime-context.ts — Runtime context detection patterns
@packages/luca-framework/src/commands/doctor.ts — Health check command pattern

## Tasks

### 1. Create MuninnDB binary schemas

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-framework/src/utils/muninndb-schemas.ts` with Zod schemas for:

- `MuninndbPlatformTargetSchema` — validated platform target string (e.g. `darwin-arm64`, `linux-x64`)
- `MuninndbBinaryStatusSchema` — binary install status: installed (bool), path (string|null), version (string|null), executable (bool)
- `MuninndbServiceStatusSchema` — service status: running (bool), port (number), pid (number|null), healthy (bool)
- `MuninndbInstallResultSchema` — download result: success (bool), binaryPath (string|null), error (string|null)

Use `checkPlatform()` from prerequisites.ts to resolve OS+arch. Map `process.platform`/`process.arch` to the four supported targets. Reject unsupported combinations with a clear error.

**Files to create:**

- `packages/luca-framework/src/utils/muninndb-schemas.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All schemas export types via `z.infer<>`
- Platform target mapping covers darwin-arm64, darwin-x64, linux-x64, linux-arm64

---

### 2. Implement binary download utility

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `packages/luca-framework/src/utils/muninndb-download.ts` with:

- `resolvePlatformTarget()` — uses `checkPlatform()` to return the validated platform target string
- `buildDownloadUrl(target, version?)` — constructs the GitHub release asset URL for the MuninnDB binary. Use a `MUNINNDB_DOWNLOAD_BASE` constant that can be overridden via env var for testing/mirrors.
- `downloadMuninndbBinary(targetDir, options?)` — downloads the binary to `targetDir/muninndb`, sets executable permission (0o755), returns `MuninndbInstallResult`

Use Bun APIs for the download: `fetch()` for HTTP, `Bun.write()` for writing the file. Use `Bun.$` for chmod. Show progress via `@clack/prompts` spinner.

Handle errors: network failure, HTTP non-200, write failure, unsupported platform. All errors should return a result object (not throw), following the pattern in prerequisites.ts.

**Files to create:**

- `packages/luca-framework/src/utils/muninndb-download.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Function signatures match schema types
- Error paths return result objects (never throw)
- Download URL is configurable via env var

---

### 3. Implement health check utility

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `packages/luca-framework/src/utils/muninndb-health.ts` with:

- `checkMuninndbBinary()` — checks if `~/.luca/bin/muninndb` exists and is executable, returns `MuninndbBinaryStatus`
- `checkMuninndbService(port?)` — checks if MuninnDB is responding on the given port (default 8476) via HTTP health endpoint, returns `MuninndbServiceStatus`
- `waitForMuninndbHealthy(options?)` — polls `checkMuninndbService()` with configurable timeout (default 10s) and interval (default 500ms), returns service status once healthy or after timeout

Use `fetch()` for the HTTP health check (GET to `http://localhost:{port}/health` or similar). Use `Bun.which()` pattern to check binary existence. Read PID from a pidfile at `~/.luca/muninndb.pid` if available.

**Files to create:**

- `packages/luca-framework/src/utils/muninndb-health.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Returns schema-validated results
- Timeout/retry logic is configurable
- Gracefully handles connection refused (service not running)

---

### 4. Implement service start/stop management

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Create `packages/luca-framework/src/utils/muninndb-service.ts` with:

- `startMuninndb(options?)` — starts the MuninnDB process in the background using `Bun.spawn()` with detached mode, writes PID to `~/.luca/muninndb.pid`, waits for healthy via `waitForMuninndbHealthy()`, returns `MuninndbServiceStatus`
- `stopMuninndb()` — reads PID from pidfile, sends SIGTERM, waits for process exit, cleans up pidfile, returns success/failure result
- `restartMuninndb()` — stop then start
- `getMuninndbStatus()` — combines `checkMuninndbBinary()` + `checkMuninndbService()` into a single status report

Default data directory: `~/.luca/muninndb-data/`. Default port: 8476. Both configurable via options or env vars (`MUNINNDB_PORT`, `MUNINNDB_DATA_DIR`).

**Files to create:**

- `packages/luca-framework/src/utils/muninndb-service.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- PID management is safe (handles stale pidfiles)
- Process is spawned detached (survives parent exit)
- Graceful shutdown with SIGTERM

---

### 5. Integrate into init.ts orchestrator

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 4

Update `packages/luca-framework/src/commands/init.ts` to add a MuninnDB setup step between the home directory setup (Step 5) and the success message (Step 6):

- Check if MuninnDB binary already installed via `checkMuninndbBinary()`
- If not installed, download via `downloadMuninndbBinary()`
- Start the service via `startMuninndb()`
- Verify health via `checkMuninndbService()`
- Show PATH guidance if `~/.luca/bin/` is not on PATH (check via `process.env.PATH`)
- Update the success note to include MuninnDB status

Add a `--skip-muninndb` flag to init command args for users who manage MuninnDB separately.

**Files to edit:**

- `packages/luca-framework/src/commands/init.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `luca init` shows MuninnDB install progress
- `luca init --skip-muninndb` skips the MuninnDB step
- PATH guidance appears when ~/.luca/bin/ is not on PATH
- Human verify: run `luca init` in a clean environment and confirm MuninnDB starts

---

### 6. Add PATH detection utility

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `packages/luca-framework/src/utils/path-check.ts` with:

- `isOnPath(dir)` — checks if a directory is included in `process.env.PATH`, returns boolean
- `getPathGuidance(dir)` — returns shell-specific guidance string for adding a directory to PATH (detects bash/zsh/fish from `process.env.SHELL`)

Keep this generic (not MuninnDB-specific) so it can be reused for any `~/.luca/bin/` binary.

**Files to create:**

- `packages/luca-framework/src/utils/path-check.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Detects bash, zsh, fish shells
- Returns actionable guidance strings

## Wave Grouping

**Wave 1 (parallel):** Tasks 1, 6

- Schemas and PATH utility have no dependencies on each other

**Wave 2 (parallel):** Tasks 2, 3

- Both depend on schemas (Task 1) but are independent of each other

**Wave 3 (sequential):** Task 4

- Depends on both download (Task 2) and health (Task 3)

**Wave 4 (sequential):** Task 5

- Integration step, depends on everything above

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors after all tasks
2. `luca init` on a clean machine downloads MuninnDB, starts it, and confirms health
3. `luca init --skip-muninndb` skips the MuninnDB step cleanly
4. `luca init` on a machine with MuninnDB already installed detects it and skips download
5. PATH guidance is shown when `~/.luca/bin/` is not in PATH
6. `stopMuninndb()` + `startMuninndb()` cycle works without errors
7. Health check returns unhealthy when service is stopped, healthy when running

## Success Criteria

- MuninnDB binary is downloaded to `~/.luca/bin/muninndb` with correct permissions
- Service starts on port 8476 and passes health check
- All four platform targets (darwin-arm64, darwin-x64, linux-x64, linux-arm64) have correct download URLs
- Service management (start/stop/restart/status) works reliably
- PID file management handles stale processes
- `luca init` integrates MuninnDB setup seamlessly
- PATH detection and guidance works for bash, zsh, and fish

## Output Specification

New files created:

- `packages/luca-framework/src/utils/muninndb-schemas.ts` — Zod schemas and types
- `packages/luca-framework/src/utils/muninndb-download.ts` — Binary download logic
- `packages/luca-framework/src/utils/muninndb-health.ts` — Health check utilities
- `packages/luca-framework/src/utils/muninndb-service.ts` — Service lifecycle management
- `packages/luca-framework/src/utils/path-check.ts` — PATH detection utility

Files modified:

- `packages/luca-framework/src/commands/init.ts` — MuninnDB setup step added
