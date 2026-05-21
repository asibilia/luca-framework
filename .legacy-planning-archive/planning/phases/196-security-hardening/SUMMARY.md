# Phase 196: Security Hardening -- Execution Summary

## Objective

Execute 5 targeted security fixes from the v5.3.0 milestone audit covering path traversal, command injection, input allowlisting, prototype pollution, and subprocess hygiene.

## Changes

### SEC-001: Validate hook command string paths

**File:** `packages/luca-framework/src/commands/init.ts`

- Added `SAFE_PATH_RE` constant (`/^[\w/.\-]+$/`) to validate path characters
- `buildProposedHooksFromDeployed()` now throws if `globalHooksDir` contains unsafe characters
- Inside the deployed scripts loop, filenames that fail `SAFE_PATH_RE` are silently skipped
- Prevents command injection via crafted directory or script names interpolated into `command` strings

### SEC-002: Path containment guard on template writes

**Files:** `packages/luca-framework/src/commands/init.ts`, `scripts/build-deploy.ts`

- In `init.ts`: after computing `absPath = join(globalDir, relPath)`, asserts `resolve(absPath).startsWith(resolve(globalDir) + "/")`
- In `build-deploy.ts`: same guard using `path.resolve(absPath).startsWith(path.resolve(claudeDir) + "/")`
- Both throw `Error("Path traversal detected: ...")` on violation
- Prevents a malicious template relative path (e.g., `../../../etc/passwd`) from writing outside the target directory

### SEC-003: Branding key allowlist in resolve-templates.ts

**File:** `packages/luca-framework/src/utils/resolve-templates.ts`

- Added `ALLOWED_BRANDING_KEYS` Set containing the 8 valid branding keys
- `resolvePathSegment()` now checks `ALLOWED_BRANDING_KEYS.has(key)` before substitution
- Unknown keys log a warning and leave the placeholder unresolved (no substitution)
- Prevents injection of arbitrary object properties via crafted `__branding.X__` placeholders

### SEC-004: Use sanitizeJsonParse in build-deploy.ts

**File:** `scripts/build-deploy.ts`

- Added import: `sanitizeJsonParse` from `../packages/luca-framework/src/utils/sanitize`
- Replaced raw `JSON.parse(await configFile.text())` in `loadBrandingContext()` with `sanitizeJsonParse()`
- Protects against prototype pollution when parsing `.planning/config.json`

### SEC-005: Replace Bun.spawnSync chmod with chmodSync

**File:** `scripts/build-deploy.ts`

- Added import: `chmodSync` from `node:fs`
- Replaced `Bun.spawnSync(["chmod", "+x", scriptPath])` with `chmodSync(scriptPath, 0o755)`
- Eliminates subprocess spawn for a simple filesystem operation, reducing attack surface and improving performance

## Verification

- `bunx --bun tsc --noEmit` passes (pre-existing errors in `dist/plugin/` are unrelated build artifacts)
- All 5 fixes are targeted, minimal, and do not change existing behavior for valid inputs

## Deviations

- None. All 5 fixes implemented as specified.

## Files Modified

| File                                                     | SEC                       |
| -------------------------------------------------------- | ------------------------- |
| `packages/luca-framework/src/commands/init.ts`           | SEC-001, SEC-002          |
| `scripts/build-deploy.ts`                                | SEC-002, SEC-004, SEC-005 |
| `packages/luca-framework/src/utils/resolve-templates.ts` | SEC-003                   |
