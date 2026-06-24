---
id: "97-02"
title: "Observer test infrastructure setup"
phase: 97
wave: 1
complexity: SIMPLE
depends_on: []
tasks:
  - id: "97-02-1"
    title: "Create observer-local bunfig.toml for test configuration"
    goal: "Configure Bun test runner for the observer package with isolated settings"
    verify: "packages/luca-observer/bunfig.toml exists with [test] section"
  - id: "97-02-2"
    title: "Create __tests__/ directory structure"
    goal: "Scaffold the test directory layout mirroring observer source structure"
    verify: "__tests__/ directory exists with lib/, hooks/, stores/, components/ subdirs"
  - id: "97-02-3"
    title: "Add test:observer script to root package.json"
    goal: "Enable running observer tests separately from root test suite"
    verify: "bun run test:observer runs without errors (even with zero tests)"
  - id: "97-02-4"
    title: "Create test utilities and mock patterns"
    goal: "Establish reusable mock patterns for fetch, SSE, and file system operations"
    verify: "Test utility file exists and exports mock helpers"
---

# 97-02: Observer Test Infrastructure Setup

## Goal

Establish the test infrastructure for `packages/luca-observer/` including package-local Bun test configuration, directory structure, and reusable mock patterns. This enables all subsequent observer testing without DOM dependencies (happy-dom deferred to a future phase for React component tests).

## Context

@bunfig.toml -- Root test config: `root = "."`, 80% coverage, no preload
@packages/luca-observer/tsconfig.json -- Standalone tsconfig with DOM lib, `~/` -> `./src/*`
@tsconfig.json -- Root tsconfig excludes `packages/luca-observer`
@package.json -- Root build script already excludes observer via `--filter '!@alecsibilia/luca-observer'`
@**tests**/packages/luca-framework/ -- Existing test patterns using `bun:test`

**Key decisions:**

- Observer tests live inside `packages/luca-observer/__tests__/` (package-local, not root `__tests__/`)
- Phase 97 focuses on non-DOM tests only (lib utilities, stores, API routes)
- Observer tests run via `bun run test:observer` separately from root `bun test`
- No happy-dom preload needed yet (React component tests deferred)

## Tasks

### Task 97-02-1: Create observer-local bunfig.toml

Create a Bun test configuration specific to the observer package. This keeps observer tests isolated from the root test runner.

**File:** `packages/luca-observer/bunfig.toml`

**Content:**

```toml
[test]
root = "."
coverage = true
coverageDir = "coverage"
coverageReporter = ["text", "lcov"]
coverageThreshold = { line = 70 }
```

**Notes:**

- Coverage threshold starts at 70% (lower than root's 80%) since this is a new package
- No `preload` needed yet -- happy-dom will be added when React component tests are introduced
- `root = "."` scopes test discovery to the observer package directory

**Verify:**

- [ ] `packages/luca-observer/bunfig.toml` exists
- [ ] Contains `[test]` section with coverage settings
- [ ] Does NOT include preload scripts (no DOM testing in Phase 97)

### Task 97-02-2: Create **tests**/ directory structure

Scaffold the test directory layout that mirrors the observer source structure. Create placeholder `.gitkeep` files so the structure is committed.

**Steps:**

1. Create directory structure:

   ```bash
   mkdir -p packages/luca-observer/__tests__/lib
   mkdir -p packages/luca-observer/__tests__/hooks
   mkdir -p packages/luca-observer/__tests__/stores
   mkdir -p packages/luca-observer/__tests__/api
   mkdir -p packages/luca-observer/__tests__/utils
   ```

2. Create a `.gitkeep` in empty directories that don't yet have test files:
   ```bash
   touch packages/luca-observer/__tests__/hooks/.gitkeep
   touch packages/luca-observer/__tests__/api/.gitkeep
   ```

**Structure rationale:**

- `lib/` -- Tests for `src/lib/` utilities (db.ts, sse.ts, file-watcher.ts, types.ts)
- `hooks/` -- Tests for React hooks (deferred to future phase, needs happy-dom)
- `stores/` -- Tests for Jotai atom stores (sidebar.ts, session.ts, filters.ts)
- `api/` -- Tests for Next.js API route handlers (deferred, needs request mocking)
- `utils/` -- Shared test utilities and mock helpers

**Verify:**

- [ ] `packages/luca-observer/__tests__/` directory exists
- [ ] Subdirectories `lib/`, `hooks/`, `stores/`, `api/`, `utils/` exist

### Task 97-02-3: Add test:observer script to root package.json

Add a script to run observer tests separately from the main test suite.

**Steps:**

1. Edit root `package.json`, add to the `"scripts"` section:

   ```json
   "test:observer": "cd packages/luca-observer && bun test"
   ```

2. Verify it runs without errors (no tests yet is fine -- Bun exits 0 when no test files found):
   ```bash
   bun run test:observer
   ```

**Verify:**

- [ ] `"test:observer"` script exists in root `package.json`
- [ ] `bun run test:observer` executes without crashing
- [ ] Root `bun test` still works and does not fail on observer files

### Task 97-02-4: Create test utilities and mock patterns

Create a shared test utilities file with reusable mock patterns for the observer package. These patterns avoid the need for a mocking framework.

**File:** `packages/luca-observer/__tests__/utils/test-helpers.ts`

**Content:**

````typescript
/**
 * Shared test utilities for luca-observer tests.
 *
 * Provides reusable mock patterns for fetch, environment variables,
 * and common test setup/teardown helpers.
 *
 * Uses manual mocking patterns (globalThis overrides) since Bun's
 * built-in mock() cannot intercept module-level global references.
 */
import { beforeEach, afterEach } from "bun:test";

// ─── Fetch Mock ─────────────────────────────────────────────────────────────

/** Captured fetch call for assertion */
export interface CapturedFetchCall {
  url: string;
  init?: RequestInit;
}

/**
 * Create a fetch mock that captures all calls and returns a configurable response.
 *
 * @param responseBody - The body to return from fetch (default: "ok")
 * @param responseInit - Optional Response init (status, headers, etc.)
 * @returns Object with captured calls array and cleanup function
 *
 * @example
 * ```typescript
 * const { calls, cleanup } = createFetchMock('{"status":"ok"}');
 * // ... run code that calls fetch ...
 * expect(calls).toHaveLength(1);
 * expect(calls[0].url).toContain("/api/events");
 * cleanup();
 * ```
 */
export function createFetchMock(
  responseBody: string = "ok",
  responseInit?: ResponseInit,
) {
  const calls: CapturedFetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((url: any, init?: any) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(new Response(responseBody, responseInit));
  }) as typeof fetch;

  return {
    calls,
    cleanup: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

/**
 * Create a fetch mock that rejects with an error.
 *
 * @param error - The error to reject with (default: new Error("Network error"))
 * @returns Object with calls array and cleanup function
 */
export function createFailingFetchMock(error?: Error) {
  const calls: CapturedFetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((url: any, init?: any) => {
    calls.push({ url: String(url), init });
    return Promise.reject(error ?? new Error("Network error"));
  }) as typeof fetch;

  return {
    calls,
    cleanup: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

// ─── Environment Variable Helpers ───────────────────────────────────────────

/**
 * Temporarily set environment variables for a test, restoring originals after.
 *
 * @param vars - Key-value pairs of env vars to set
 * @returns Cleanup function that restores original values
 *
 * @example
 * ```typescript
 * const cleanup = setTestEnv({ LUCA_OBSERVER_URL: "http://localhost:3456" });
 * // ... run test ...
 * cleanup();
 * ```
 */
export function setTestEnv(vars: Record<string, string | undefined>) {
  const originals: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(vars)) {
    originals[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
````

**Verify:**

- [ ] File exists at `packages/luca-observer/__tests__/utils/test-helpers.ts`
- [ ] Exports `createFetchMock`, `createFailingFetchMock`, `setTestEnv`
- [ ] No classes used (functional patterns only)
- [ ] JSDoc documentation on all exported functions
- [ ] Compiles without type errors: `cd packages/luca-observer && bunx --bun tsc --noEmit` (may need tsconfig adjustment to include `__tests__/`)

## Success Criteria

- [ ] Observer-local `bunfig.toml` configured for isolated test runs
- [ ] `__tests__/` directory structure scaffolded
- [ ] `bun run test:observer` script works from repo root
- [ ] Reusable test utilities created with fetch mock and env helpers
- [ ] Root `bun test` unaffected by observer test infrastructure
