---
id: "02"
title: "Security Hardening: SSRF Allowlist, CSP Fixes, and Shell Injection Prevention"
phase: 117
wave: 1
depends_on: []
---

# PLAN-117-02: Security Hardening: SSRF Allowlist, CSP Fixes, and Shell Injection Prevention

## Objective

Close four security hardening gaps identified in the milestone audit: extend the SSRF allowlist to cover additional loopback representations, fix production CSP to use dynamic connect-src instead of hardcoded localhost, document the `unsafe-inline` style-src exception, and harden the shell injection surface in the observer CLI's `open` command.

Source: `.planning/v2.7.0-MILESTONE-AUDIT.md` -- HIGH #10 (SSRF allowlist), MEDIUM security recommendations (CSP, shell injection).

## Context

@file packages/luca-framework/src/state/\_\_helpers/observer-emitter.ts -- Contains `ALLOWED_HOSTS` Set and `isLocalhostUrl()` SSRF guard. Currently allows `localhost`, `127.0.0.1`, `[::1]`. Missing `0.0.0.0` and numeric IP bypass representations.

@file packages/luca-observer/next.config.ts -- Production CSP has `style-src 'self' 'unsafe-inline'` (line 44) and hardcoded `ws://localhost:3000 wss://localhost:3000` in connect-src (line 45).

@file packages/luca-observer/lib/spacetimedb-config.ts -- Exports `SPACETIMEDB_URI` from `NEXT_PUBLIC_SPACETIMEDB_URI` env var, defaulting to `ws://localhost:3000`.

@file packages/luca-observer/bin/luca-observer.js -- Uses `execSync(\`open ${url}\`)`at line 87, passing the`url`variable directly into a shell command. The`url`is constructed from`port` which comes from user CLI args, creating a shell injection vector.

@file **tests**/packages/luca-framework/src/state/\_\_helpers/observer-emitter.test.ts -- Existing test file for observer-emitter. New SSRF test cases should be added here.

## Tasks

### Task 1: Extend SSRF allowlist with additional loopback representations

**Goal:** Add `0.0.0.0` and normalize numeric IP representations to prevent SSRF bypasses.

**File:** `packages/luca-framework/src/state/__helpers/observer-emitter.ts`

**Current code (line 24):**

```typescript
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
```

**Target code:**

```typescript
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

/**
 * Normalize a hostname to catch numeric IP bypass attempts.
 *
 * Handles representations like:
 * - `0x7f000001` (hex)
 * - `2130706433` (decimal)
 * - `0177.0.0.1` (octal)
 * - `127.000.000.001` (zero-padded)
 *
 * Uses URL parsing to resolve these to canonical form.
 */
function normalizeHostname(hostname: string): string {
  // URL parser already resolves most numeric representations.
  // For dotted representations with leading zeros (e.g. 127.000.000.001),
  // strip leading zeros from each octet and compare.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    const normalized = hostname
      .split(".")
      .map((octet) => String(parseInt(octet, 10)))
      .join(".");
    return normalized;
  }
  return hostname;
}
```

**Update `isLocalhostUrl` to use normalization:**

```typescript
export function isLocalhostUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const hostname = normalizeHostname(parsed.hostname);
    return ALLOWED_HOSTS.has(hostname);
  } catch {
    return false;
  }
}
```

**Test file:** `__tests__/packages/luca-framework/src/state/__helpers/observer-emitter.test.ts`

**New test cases to add:**

```typescript
// 0.0.0.0 should be allowed
expect(isLocalhostUrl("http://0.0.0.0:3000")).toBe(true);

// Zero-padded octets should normalize to 127.0.0.1
expect(isLocalhostUrl("http://127.000.000.001:3000")).toBe(true);

// External hosts must still be rejected
expect(isLocalhostUrl("http://evil.com:3000")).toBe(false);
expect(isLocalhostUrl("http://127.0.0.1.evil.com:3000")).toBe(false);
```

**Verification:**

```bash
bun test __tests__/packages/luca-framework/src/state/__helpers/observer-emitter.test.ts
```

### Task 2: Fix production CSP connect-src to use dynamic URL

**Goal:** Replace hardcoded `ws://localhost:3000` in production CSP with a value derived from the `NEXT_PUBLIC_SPACETIMEDB_URI` environment variable.

**File:** `packages/luca-observer/next.config.ts`

**Current code (line 45):**

```typescript
"connect-src 'self' ws://localhost:3000 wss://localhost:3000",
```

**Target code:**

```typescript
// At the top of the file, derive WebSocket CSP values from env
const spacetimedbUri =
  process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "ws://localhost:3000";
// Ensure both ws and wss variants are allowed
const wsUri = spacetimedbUri.startsWith("wss://")
  ? spacetimedbUri
  : spacetimedbUri.replace(/^https?:\/\//, "ws://");
const wssUri = wsUri.replace(/^ws:\/\//, "wss://");
```

Then in both dev and prod CSP:

```typescript
`connect-src 'self' ${wsUri} ${wssUri}`,
```

This ensures the CSP always matches the configured SpacetimeDB URI rather than assuming localhost:3000.

**Verification:**

- `bunx --bun tsc --noEmit` passes (next.config.ts types check)
- Setting `NEXT_PUBLIC_SPACETIMEDB_URI=ws://custom:5000` produces CSP with `ws://custom:5000 wss://custom:5000`

### Task 3: Document unsafe-inline style-src as accepted exception

**Goal:** Add a code comment explaining why `'unsafe-inline'` remains in production `style-src` and that it is an accepted exception.

**File:** `packages/luca-observer/next.config.ts`

**Rationale:** Next.js with Tailwind CSS injects inline styles at runtime. Removing `'unsafe-inline'` from `style-src` would break all Tailwind-generated styles in production. Next.js does not yet support nonce-based style injection. This is a known, accepted trade-off documented by the Next.js team.

**Target:** Add comment above the production CSP `style-src` line:

```typescript
// ACCEPTED EXCEPTION: 'unsafe-inline' is required for Tailwind CSS / Next.js
// style injection. Next.js does not support nonce-based style-src.
// See: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
"style-src 'self' 'unsafe-inline'",
```

**Verification:** Comment present, no functional change.

### Task 4: Harden shell injection in luca-observer.js open command

**Goal:** Prevent shell injection via the `open` command by validating the URL before passing it to `execSync`.

**File:** `packages/luca-observer/bin/luca-observer.js`

**Current code (lines 84-97):**

```javascript
setTimeout(() => {
  const url = `http://localhost:${port}`;
  try {
    execSync(`open ${url}`, { stdio: "ignore" });
  } catch {
    try {
      execSync(`xdg-open ${url}`, { stdio: "ignore" });
    } catch {
      console.log(`  Open: ${url}`);
    }
  }
}, 2000);
```

**Issue:** The `port` variable comes from `parseArgs` which reads user CLI input. While `port` is typed as `string`, a malicious value like `"3000; rm -rf /"` would be executed in the shell.

**Target code:**

```javascript
setTimeout(() => {
  // Validate port is numeric to prevent shell injection
  const sanitizedPort = String(parseInt(port, 10));
  if (sanitizedPort !== port || isNaN(parseInt(port, 10))) {
    console.error(`  Invalid port: ${port}`);
    return;
  }
  const url = `http://localhost:${sanitizedPort}`;
  try {
    // Use spawn instead of execSync to avoid shell interpretation
    const { execFileSync } = require("node:child_process");
    execFileSync("open", [url], { stdio: "ignore" });
  } catch {
    try {
      execFileSync("xdg-open", [url], { stdio: "ignore" });
    } catch {
      console.log(`  Open: ${url}`);
    }
  }
}, 2000);
```

Key changes:

1. Validate that `port` is a valid numeric string before use
2. Replace `execSync` (shell interpretation) with `execFileSync` (direct exec, no shell) -- already imported via `spawn` from `node:child_process`, just need to also import `execFileSync`
3. Pass URL as an array argument rather than string interpolation

**Verification:**

```bash
# Type check
cd packages/luca-observer && bunx --bun tsc --noEmit

# Manual: run `luca-observer --port "3000; echo pwned"` and confirm it prints error, not executing injection
```

## Success Criteria

1. SSRF allowlist includes `0.0.0.0` and normalizes zero-padded IPs
2. New SSRF test cases pass for `0.0.0.0` and numeric IP variants
3. Production CSP `connect-src` dynamically reads `NEXT_PUBLIC_SPACETIMEDB_URI` instead of hardcoding localhost
4. `unsafe-inline` in `style-src` documented as accepted exception with rationale
5. Shell injection in `open` command prevented via input validation and `execFileSync`
6. All existing observer-emitter tests continue to pass
7. TypeScript type-check passes for all modified files

## Verification

```bash
# Run observer-emitter tests (includes new SSRF cases)
bun test __tests__/packages/luca-framework/src/state/__helpers/observer-emitter.test.ts

# Type check luca-framework
cd packages/luca-framework && bunx --bun tsc --noEmit

# Type check luca-observer
cd packages/luca-observer && bunx --bun tsc --noEmit

# Confirm no hardcoded ws://localhost in production CSP
grep -n 'ws://localhost' packages/luca-observer/next.config.ts && echo "WARN: check if these are in fallback default only" || echo "PASS: no hardcoded ws://localhost"

# Confirm execSync is not used with string interpolation for open command
grep -n 'execSync.*open' packages/luca-observer/bin/luca-observer.js && echo "FAIL: execSync still used for open" || echo "PASS: execSync removed from open command"
```
