---
phase: 179
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 179 Plan 01: High-Severity Security Fixes (Binary Integrity + Credential Permissions + URL Validation)

## Objective

Fix the three highest-priority security findings from the v5.0.0 milestone audit: SEC-001 (binary download lacks checksum verification), SEC-002 (API key written with world-readable permissions), and SEC-003 (download base URL lacks scheme validation). These address the most exploitable attack surface in the global install flow.

## Context

@packages/luca-framework/src/utils/muninndb-download.ts -- SEC-001 (no checksum), SEC-003 (no URL scheme check)
@packages/luca-framework/src/utils/vault-setup.ts -- SEC-002 (world-readable .env)
@packages/luca-framework/src/utils/sanitize.ts -- Existing sanitizeJsonParse for reference
@packages/luca-framework/src/utils/deploy-manifest-writer.ts -- Existing hashFile() pattern to reuse
@.planning/phases/179-security-hardening/179-CONTEXT.md -- Gray Areas 1, 2, 4

## Tasks

### 1. SEC-003: Validate MUNINNDB_DOWNLOAD_BASE URL scheme

**Type:** auto
**TDD:** false
**Depends on:** none

Add HTTPS scheme validation to `buildDownloadUrl()` in `muninndb-download.ts`. When `MUNINNDB_DOWNLOAD_BASE` is overridden via env var, validate the constructed URL starts with `https://`. Reject `http://`, `file://`, and malformed URLs with a clear error.

**Implementation:**

- Add a `validateDownloadUrl()` function that uses `new URL(resolvedUrl)` and checks `.protocol === 'https:'`
- Call it in `buildDownloadUrl()` -- throw a descriptive error if validation fails
- Also call it in `downloadMuninndbBinary()` before fetching, returning a failure result instead of throwing
- The default GitHub URL is already HTTPS, so this only fires when the env var overrides it

**Files to create/edit:**

- `packages/luca-framework/src/utils/muninndb-download.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Manually inspect that `buildDownloadUrl()` rejects `http://` overrides
- Default URL (no env var) continues to work unchanged

### 2. SEC-001: Add SHA-256 checksum verification for binary downloads

**Type:** auto
**TDD:** false
**Depends on:** 1

Add checksum verification to `downloadMuninndbBinary()`. After downloading the binary, fetch the `.sha256` sidecar file from the same release URL, compute the SHA-256 hash of the downloaded binary, and compare. Reject on mismatch unless `--skip-checksum` or `MUNINNDB_SKIP_CHECKSUM` is set.

**Implementation:**

- Add `fetchChecksumSidecar(url: string): Promise<string | null>` that fetches `${binaryUrl}.sha256` and extracts the hex digest (first field, space-separated, matching `sha256sum` output format)
- Add `verifyBinaryChecksum(binaryPath: string, expectedHash: string): Promise<boolean>` using `Bun.CryptoHasher` (or `crypto.createHash('sha256')`) to compute the hash of the written file and compare
- In `downloadMuninndbBinary()`, after writing the binary:
  1. Fetch the sidecar file
  2. If sidecar unavailable (404): warn and continue only if `MUNINNDB_SKIP_CHECKSUM` env var is set, otherwise return failure result
  3. If sidecar available: verify checksum. On mismatch, delete the binary and return failure result
- Add `skipChecksum?: boolean` to `DownloadMuninndbOptions` interface
- Update JSDoc for the new behavior

**Files to create/edit:**

- `packages/luca-framework/src/utils/muninndb-download.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Function signature includes `skipChecksum` option
- Failure path deletes the binary on checksum mismatch (inspect code path)

### 3. SEC-002: Set restrictive permissions on .env files and sensitive directories

**Type:** auto
**TDD:** false
**Depends on:** none

Fix `writeApiKeyToEnv()` in `vault-setup.ts` to set 0600 permissions on the `.env` file after writing. Also update `ensureLucaHome()` in `luca-home.ts` to set 0700 on `backups/` and `manifests/` directories.

**Implementation:**

- In `vault-setup.ts` `writeApiKeyToEnv()`: after each `Bun.write()` call, run `chmodSync(envPath, 0o600)` (import from `node:fs`)
- In `luca-home.ts` `ensureLucaHome()`: after creating `backups/` and `manifests/` directories, set `chmodSync(path, 0o700)`
- In `backup-manager.ts` `backupSettings()`: after `Bun.write(backupPath, content)`, run `chmodSync(backupPath, 0o600)` to restrict backup file permissions

**Files to create/edit:**

- `packages/luca-framework/src/utils/vault-setup.ts`
- `packages/luca-framework/src/utils/luca-home.ts`
- `packages/luca-framework/src/utils/backup-manager.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- After running vault setup, `stat -f "%Lp" .env` shows `600`
- After running init, `stat -f "%Lp" ~/.luca/backups` shows `700`
- After creating a backup, `stat -f "%Lp" ~/.luca/backups/settings-*.json` shows `600`

## Verification

1. `bunx --bun tsc --noEmit` succeeds with no new type errors
2. Code review confirms:
   - URL validation rejects non-HTTPS schemes
   - Checksum verification fetches sidecar, compares hash, deletes on mismatch
   - File permissions are set to 0600/0700 as specified in the context
3. No existing functionality regressed (download flow, vault wizard, backup flow)

## Success Criteria

- SEC-001: Binary downloads are verified against SHA-256 sidecar, with clear error on mismatch
- SEC-002: `.env` files are created with 0600 permissions; backup dirs with 0700
- SEC-003: MUNINNDB_DOWNLOAD_BASE rejects non-HTTPS URLs

## Output Specification

- Modified: `packages/luca-framework/src/utils/muninndb-download.ts` (SEC-001, SEC-003)
- Modified: `packages/luca-framework/src/utils/vault-setup.ts` (SEC-002)
- Modified: `packages/luca-framework/src/utils/luca-home.ts` (SEC-002 directory permissions)
- Modified: `packages/luca-framework/src/utils/backup-manager.ts` (SEC-002 backup file permissions)
