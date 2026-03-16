---
phase: 179
plan: 2
type: bug
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 179 Plan 02: Medium/Low Security Fixes (PID Hardening + JSON Sanitization + Symlink Guard)

## Objective

Fix the remaining five security findings from the v5.0.0 milestone audit: SEC-004 (PID file lacks restrictive permissions and process identity check), SEC-005 (backup files world-readable), SEC-006/SEC-007 (raw JSON.parse calls), and SEC-008 (symlink traversal in copyDirForDeploy). These are defense-in-depth improvements that reduce attack surface for local privilege escalation and data corruption.

## Context

@packages/luca-framework/src/utils/muninndb-service.ts -- SEC-004 (PID permissions + process identity)
@packages/luca-framework/src/utils/backup-manager.ts -- SEC-005 (backup file permissions, partially done in Plan 01)
@packages/luca-framework/src/utils/vault-setup.ts -- SEC-006 (raw JSON.parse in writeVaultConfig)
@packages/luca-framework/src/commands/init.ts -- SEC-007 (raw JSON.parse), SEC-008 (copyDirForDeploy symlink)
@scripts/deploy-global.ts -- SEC-007 (raw JSON.parse), SEC-008 (copyDirRecursive symlink)
@packages/luca-framework/src/utils/sanitize.ts -- Existing sanitizeJsonParse to use
@.planning/phases/179-security-hardening/179-CONTEXT.md -- Gray Areas 2, 3, 5, 6

## Tasks

### 1. SEC-004: Harden PID file with restrictive permissions and process identity verification

**Type:** auto
**TDD:** false
**Depends on:** none

Fix `muninndb-service.ts` to set PID file permissions to 0600 after writing, and verify the process is actually MuninnDB before sending signals.

**Implementation:**

- In `startMuninndb()`, after `Bun.write(pidfilePath, String(proc.pid))`, add `chmodSync(pidfilePath, 0o600)` (import from `node:fs`)
- Add `verifyProcessIdentity(pid: number): boolean` function that:
  - Uses `Bun.$\`ps -p ${pid} -o comm=\`.quiet()` to get the process command name
  - Returns `true` if the output contains "muninndb" (case-insensitive)
  - Returns `false` on any error or non-match
- In `stopMuninndb()`, before sending SIGTERM, call `verifyProcessIdentity(pid)`:
  - If it returns `false`: log a warning, clean up the stale pidfile, return success (do NOT send signal)
  - If it returns `true`: proceed with SIGTERM as before
- In `cleanStalePidfile()`, also use `verifyProcessIdentity()` to detect stale files where the PID belongs to a different process

**Files to create/edit:**

- `packages/luca-framework/src/utils/muninndb-service.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `verifyProcessIdentity()` function exists and is called before signal dispatch
- PID file has 0600 permissions after `startMuninndb()` writes it

### 2. SEC-006 + SEC-007: Replace raw JSON.parse with sanitizeJsonParse

**Type:** auto
**TDD:** false
**Depends on:** none

Replace all `JSON.parse()` calls on file contents with `sanitizeJsonParse()` from `packages/luca-framework/src/utils/sanitize.ts` to prevent prototype pollution from crafted config files.

**Scope of replacements:**

1. `vault-setup.ts` line 241: `JSON.parse(await file.text())` in `writeVaultConfig()` -- replace with `sanitizeJsonParse(await file.text())`
2. `init.ts` line 273: `JSON.parse(readFileSync(settingsPath, "utf-8"))` in `runDeployStep()` -- replace with `sanitizeJsonParse(readFileSync(settingsPath, "utf-8"))`
3. `deploy-global.ts` line 588: `JSON.parse(readFileSync(settingsPath, "utf-8"))` in `mergeSettingsWithLibrary()` -- replace with `sanitizeJsonParse(readFileSync(settingsPath, "utf-8"))`
4. `deploy-global.ts` line 755: `JSON.parse(readFileSync(manifestPath, "utf-8"))` in `removeGlobalArtifacts()` -- replace with `sanitizeJsonParse(readFileSync(manifestPath, "utf-8"))`
5. `deploy-global.ts` line 841: `JSON.parse(readFileSync(settingsFilePath, "utf-8"))` in `removeGlobalArtifacts()` -- replace with `sanitizeJsonParse(readFileSync(settingsFilePath, "utf-8"))`

**Implementation:**

- Add `import { sanitizeJsonParse } from "../utils/sanitize"` to `vault-setup.ts` and `init.ts`
- For `deploy-global.ts` (outside packages/), import from the relative path: `import { sanitizeJsonParse } from "../packages/luca-framework/src/utils/sanitize"`
- Replace each `JSON.parse(...)` call with `sanitizeJsonParse(...) as Record<string, unknown>` (the cast is needed because sanitizeJsonParse returns `unknown`)
- Keep the surrounding try/catch blocks intact -- `sanitizeJsonParse` throws on invalid JSON just like `JSON.parse`

**Files to create/edit:**

- `packages/luca-framework/src/utils/vault-setup.ts`
- `packages/luca-framework/src/commands/init.ts`
- `scripts/deploy-global.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -rn "JSON.parse" packages/luca-framework/src/utils/vault-setup.ts packages/luca-framework/src/commands/init.ts scripts/deploy-global.ts` returns zero matches (all replaced)
- Import statements for `sanitizeJsonParse` are present in all three files

### 3. SEC-008: Guard copyDirForDeploy against symlink traversal

**Type:** auto
**TDD:** false
**Depends on:** none

Add symlink detection to `copyDirForDeploy()` in `init.ts` and `copyDirRecursive()` in `deploy-global.ts` to prevent symlink-based directory escape attacks during deployment.

**Implementation:**

- In `init.ts` `copyDirForDeploy()`:
  - Before `writeFileSync(tgtPath, readFileSync(srcPath))`, check `lstatSync(srcPath).isSymbolicLink()`
  - If it IS a symlink: resolve with `realpathSync(srcPath)` and verify the resolved path starts with the expected source root using `resolvedPath.startsWith(source)` (where `source` is the top-level source directory passed as parameter)
  - If the resolved path escapes the source tree: log a warning with the escaped path and skip the file (do NOT copy)
  - Import `lstatSync`, `realpathSync` from `node:fs` (some are already imported)
- In `deploy-global.ts` `copyDirRecursive()`:
  - Apply the same guard: `lstatSync(srcPath).isSymbolicLink()` check before copy
  - If symlink escapes source tree: `console.warn()` and skip
  - `lstatSync` is already imported in `deploy-global.ts`; add `realpathSync` to the import

**Files to create/edit:**

- `packages/luca-framework/src/commands/init.ts`
- `scripts/deploy-global.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `copyDirForDeploy()` in `init.ts` contains `lstatSync` + `isSymbolicLink()` check
- `copyDirRecursive()` in `deploy-global.ts` contains equivalent check
- Both log a warning when skipping an escaped symlink

## Verification

1. `bunx --bun tsc --noEmit` succeeds with no new type errors
2. Code review confirms:
   - PID file written with 0600 permissions
   - Process identity verified before signal dispatch
   - All `JSON.parse()` on file contents replaced with `sanitizeJsonParse()`
   - Symlink guards present in both `init.ts` and `deploy-global.ts` copy functions
3. No existing functionality regressed (service start/stop, settings merge, deploy flow)

## Success Criteria

- SEC-004: PID file has 0600 permissions; SIGTERM only sent after verifying process is muninndb
- SEC-005: Backup files created with 0600 permissions (completed in Plan 01 Task 3, verified here)
- SEC-006: `vault-setup.ts` uses `sanitizeJsonParse()` instead of `JSON.parse()`
- SEC-007: `init.ts` and `deploy-global.ts` use `sanitizeJsonParse()` instead of `JSON.parse()`
- SEC-008: `copyDirForDeploy` and `copyDirRecursive` skip symlinks that escape the source tree

## Output Specification

- Modified: `packages/luca-framework/src/utils/muninndb-service.ts` (SEC-004)
- Modified: `packages/luca-framework/src/utils/vault-setup.ts` (SEC-006)
- Modified: `packages/luca-framework/src/commands/init.ts` (SEC-007, SEC-008)
- Modified: `scripts/deploy-global.ts` (SEC-007, SEC-008)
