# Phase 179 Plan 01 Summary: High-Severity Security Fixes

## Status: COMPLETE

## Objective

Fix three highest-priority security findings from the v5.0.0 audit: binary download integrity (SEC-001), credential file permissions (SEC-002), and download URL validation (SEC-003).

## Tasks Completed

### Task 1: SEC-003 -- HTTPS URL Validation

- Added `validateDownloadUrl()` function that parses URLs with `new URL()` and rejects non-HTTPS protocols
- Integrated validation into `buildDownloadUrl()` (throws on invalid scheme) and `downloadMuninndbBinary()` (catches and returns failure result)
- Default GitHub URL is already HTTPS, so this only fires when `MUNINNDB_DOWNLOAD_BASE` env var overrides it

### Task 2: SEC-001 -- SHA-256 Checksum Verification

- Added `fetchChecksumSidecar()` to download `{binaryUrl}.sha256` and parse the sha256sum-format digest
- Added `verifyBinaryChecksum()` using `crypto.createHash('sha256')` to compute and compare hashes
- Integrated into `downloadMuninndbBinary()`: after writing binary, fetches sidecar, verifies hash
- On checksum mismatch: deletes the binary and returns failure
- When sidecar unavailable: fails unless `MUNINNDB_SKIP_CHECKSUM=1` or `skipChecksum: true`
- Added `skipChecksum` option to `DownloadMuninndbOptions` interface

### Task 3: SEC-002 -- Restrictive File Permissions

- `writeApiKeyToEnv()`: sets `0600` on `.env` file after every write
- `ensureLucaHome()`: sets `0700` on `backups/` and `manifests/` directories
- `backupSettings()`: sets `0600` on each backup file after creation

## Commits

| Hash       | Description                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `35b4c048` | fix(security): add HTTPS URL validation and SHA-256 checksum verification for binary downloads |
| `dede8990` | fix(security): set restrictive permissions on .env files and sensitive directories             |

## Files Modified

- `packages/luca-framework/src/utils/muninndb-download.ts` -- SEC-001 (checksum), SEC-003 (URL validation)
- `packages/luca-framework/src/utils/vault-setup.ts` -- SEC-002 (.env permissions)
- `packages/luca-framework/src/utils/luca-home.ts` -- SEC-002 (directory permissions)
- `packages/luca-framework/src/utils/backup-manager.ts` -- SEC-002 (backup file permissions)

## Verification

- `bunx --bun tsc --noEmit` passes (4 pre-existing errors in `dist/plugin/scripts/` unrelated to changes)
- URL validation rejects `http://`, `file://`, and malformed URLs via `new URL()` parsing + protocol check
- Checksum verification fetches sidecar, compares SHA-256 hash, deletes binary on mismatch
- File permissions: `.env` gets 0600, `backups/` and `manifests/` get 0700, backup files get 0600
- No existing functionality regressed (default HTTPS URL passes validation; download flow, vault wizard, backup flow unchanged)

## Deviations

None. All tasks executed as specified in the plan.

## Success Criteria Met

- [x] SEC-001: Binary downloads are verified against SHA-256 sidecar, with clear error on mismatch
- [x] SEC-002: `.env` files are created with 0600 permissions; backup dirs with 0700; backup files with 0600
- [x] SEC-003: MUNINNDB_DOWNLOAD_BASE rejects non-HTTPS URLs
