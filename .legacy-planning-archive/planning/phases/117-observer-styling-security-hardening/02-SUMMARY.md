# SUMMARY: PLAN-117-02 — Security Hardening: SSRF Allowlist, CSP Fixes, and Shell Injection Prevention

## Status: COMPLETE

## Changes Made

### Task 1: Extend SSRF allowlist with additional loopback representations

- **File:** `packages/luca-framework/src/state/__helpers/observer-emitter.ts`
- Added `0.0.0.0` to `ALLOWED_HOSTS` set
- Added `normalizeHostname()` function that strips leading zeros from dotted-decimal octets (e.g., `127.000.000.001` -> `127.0.0.1`)
- Updated `isLocalhostUrl()` to normalize hostnames before allowlist lookup
- **Test file:** `__tests__/packages/luca-framework/src/state/__helpers/observer-emitter.test.ts`
- Added 3 new test cases: `0.0.0.0` acceptance, zero-padded IP normalization, subdomain trick rejection

### Task 2: Fix production CSP connect-src to use dynamic URL

- **File:** `packages/luca-observer/next.config.ts`
- Replaced hardcoded `ws://localhost:3000 wss://localhost:3000` in both dev and prod CSP `connect-src` with values derived from `NEXT_PUBLIC_SPACETIMEDB_URI` environment variable
- Defaults to `ws://localhost:3000` when env var is not set (backward compatible)
- Generates both `ws://` and `wss://` variants automatically

### Task 3: Document unsafe-inline style-src as accepted exception

- **File:** `packages/luca-observer/next.config.ts`
- Added accepted-exception comment above production `style-src` explaining why `'unsafe-inline'` is required (Tailwind CSS / Next.js style injection) with link to Next.js CSP documentation

### Task 4: Harden shell injection in luca-observer.js open command

- **File:** `packages/luca-observer/bin/luca-observer.js`
- Replaced `execSync` with `execFileSync` to avoid shell interpretation
- Added numeric port validation before URL construction
- Changed import from `execSync` to `execFileSync`
- URL passed as array argument instead of string interpolation

## Verification

- All 27 observer-emitter tests pass (including 3 new ones)
- TypeScript type-check passes for both modified packages
- No functional regressions

## Commits

1. `285f6dc` — fix(luca-framework): extend SSRF allowlist with 0.0.0.0 and normalize zero-padded IPs
2. `8662b36` — fix(luca-observer): use dynamic CSP connect-src from env and document unsafe-inline
3. `3f41cb6` — fix(luca-observer): prevent shell injection in CLI open command
