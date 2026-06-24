---
id: "97-03"
title: "Observer-emitter tests in luca-framework"
phase: 97
wave: 1
complexity: SIMPLE
depends_on: []
tasks:
  - id: "97-03-1"
    title: "Create test file for observer-emitter.ts"
    goal: "Write comprehensive tests for the emitObserverEvent function"
    verify: "bun test __tests__/packages/luca-framework/src/state/observer-emitter.test.ts passes with all 5 test cases"
  - id: "97-03-2"
    title: "Verify test isolation and cleanup"
    goal: "Ensure tests properly restore globalThis.fetch and process.env after each test"
    verify: "Running tests multiple times produces consistent results; no test pollution"
---

# 97-03: Observer-Emitter Tests

## Goal

Write the first tests for the `packages/luca-framework/src/state/` domain by testing `observer-emitter.ts`. This file has a single exported function (`emitObserverEvent`) that is fire-and-forget with environment gating -- a good target for establishing state domain test patterns.

## Context

@packages/luca-framework/src/state/observer-emitter.ts -- Target file: single `emitObserverEvent()` function
@**tests**/packages/luca-framework/ -- Existing test directory for luca-framework
@packages/luca-framework/src/state/types.ts -- TransitionRecord schema (not directly used by emitter but related)

**Key behaviors to test:**

1. Returns immediately (no fetch) when `LUCA_OBSERVER_URL` is unset
2. POSTs correct payload to `${url}/api/events` when URL is set
3. Silently swallows fetch errors (fire-and-forget)
4. Includes ISO timestamp in payload
5. Uses `AbortSignal.timeout(2000)` for fetch timeout

**Mocking strategy:**

- Override `globalThis.fetch` to capture calls and assert payload
- Manipulate `process.env.LUCA_OBSERVER_URL` directly
- Restore both in `afterEach` to prevent test pollution

## Tasks

### Task 97-03-1: Create test file for observer-emitter.ts

Create a comprehensive test file covering all behaviors of `emitObserverEvent`.

**File:** `__tests__/packages/luca-framework/src/state/observer-emitter.test.ts`

**Steps:**

1. Create the directory if it does not exist:

   ```bash
   mkdir -p __tests__/packages/luca-framework/src/state
   ```

2. Write the test file with the following structure:

```typescript
/**
 * Tests for observer-emitter.ts — fire-and-forget event emission.
 *
 * Validates environment gating, payload construction, error swallowing,
 * and timeout behavior of the emitObserverEvent function.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

import { emitObserverEvent } from "../../../../../packages/luca-framework/src/state/observer-emitter";

// ─── Test State ─────────────────────────────────────────────────────────────

interface CapturedCall {
  url: string;
  init?: RequestInit;
}

let fetchCalls: CapturedCall[] = [];
const originalFetch = globalThis.fetch;
let originalUrl: string | undefined;

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  fetchCalls = [];
  originalUrl = process.env.LUCA_OBSERVER_URL;

  // Default mock: capture calls and resolve successfully
  globalThis.fetch = ((url: any, init?: any) => {
    fetchCalls.push({ url: String(url), init });
    return Promise.resolve(new Response("ok"));
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) {
    delete process.env.LUCA_OBSERVER_URL;
  } else {
    process.env.LUCA_OBSERVER_URL = originalUrl;
  }
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("emitObserverEvent", () => {
  describe("environment gating", () => {
    test("does not call fetch when LUCA_OBSERVER_URL is unset", () => {
      delete process.env.LUCA_OBSERVER_URL;
      emitObserverEvent("test.event");
      expect(fetchCalls).toHaveLength(0);
    });

    test("does not call fetch when LUCA_OBSERVER_URL is empty string", () => {
      process.env.LUCA_OBSERVER_URL = "";
      emitObserverEvent("test.event");
      expect(fetchCalls).toHaveLength(0);
    });
  });

  describe("payload construction", () => {
    test("sends POST to /api/events with correct payload", () => {
      process.env.LUCA_OBSERVER_URL = "http://localhost:3456";
      emitObserverEvent("state.transition", {
        session_id: "abc-123",
        payload: { from: "executing", to: "verifying" },
      });

      expect(fetchCalls).toHaveLength(1);

      const call = fetchCalls[0]!;
      expect(call.url).toBe("http://localhost:3456/api/events");
      expect(call.init?.method).toBe("POST");
      expect(call.init?.headers).toEqual({
        "Content-Type": "application/json",
      });

      const body = JSON.parse(call.init?.body as string);
      expect(body.event_type).toBe("state.transition");
      expect(body.session_id).toBe("abc-123");
      expect(body.payload).toEqual({ from: "executing", to: "verifying" });
    });

    test("includes ISO timestamp in payload", () => {
      process.env.LUCA_OBSERVER_URL = "http://localhost:3456";
      const before = new Date().toISOString();
      emitObserverEvent("test.event");
      const after = new Date().toISOString();

      expect(fetchCalls).toHaveLength(1);
      const body = JSON.parse(fetchCalls[0]!.init?.body as string);

      // Timestamp should be a valid ISO string between before and after
      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe("string");
      expect(body.timestamp >= before).toBe(true);
      expect(body.timestamp <= after).toBe(true);
    });
  });

  describe("error handling", () => {
    test("silently swallows fetch rejection without throwing", () => {
      process.env.LUCA_OBSERVER_URL = "http://localhost:3456";

      // Mock fetch to reject
      globalThis.fetch = ((url: any, init?: any) => {
        fetchCalls.push({ url: String(url), init });
        return Promise.reject(new Error("Connection refused"));
      }) as typeof fetch;

      // Should NOT throw -- fire-and-forget
      expect(() => {
        emitObserverEvent("test.event");
      }).not.toThrow();
    });
  });

  describe("timeout configuration", () => {
    test("passes AbortSignal.timeout(2000) in fetch options", () => {
      process.env.LUCA_OBSERVER_URL = "http://localhost:3456";
      emitObserverEvent("test.event");

      expect(fetchCalls).toHaveLength(1);
      const signal = fetchCalls[0]!.init?.signal;
      expect(signal).toBeDefined();
      // AbortSignal.timeout() creates an AbortSignal -- verify it exists
      expect(signal).toBeInstanceOf(AbortSignal);
    });
  });
});
```

3. Run the test:
   ```bash
   bun test __tests__/packages/luca-framework/src/state/observer-emitter.test.ts
   ```

**Verify:**

- [ ] Test file created at `__tests__/packages/luca-framework/src/state/observer-emitter.test.ts`
- [ ] All 5 test cases pass
- [ ] `bun test __tests__/packages/luca-framework/src/state/observer-emitter.test.ts` exits with code 0
- [ ] Tests use `bun:test` imports (not jest/vitest)

### Task 97-03-2: Verify test isolation and cleanup

Ensure the tests properly clean up `globalThis.fetch` and `process.env.LUCA_OBSERVER_URL` and can be run multiple times without pollution.

**Steps:**

1. Run the test file 3 times consecutively:

   ```bash
   bun test __tests__/packages/luca-framework/src/state/observer-emitter.test.ts
   bun test __tests__/packages/luca-framework/src/state/observer-emitter.test.ts
   bun test __tests__/packages/luca-framework/src/state/observer-emitter.test.ts
   ```

   All 3 runs must pass.

2. Run as part of the broader luca-framework test suite:

   ```bash
   bun test __tests__/packages/luca-framework/
   ```

   Verify no new failures introduced.

3. Run full root test suite:
   ```bash
   bun test
   ```
   Verify no regressions (pre-existing failures acceptable).

**Verify:**

- [ ] Tests pass on 3 consecutive runs
- [ ] No test pollution affecting other luca-framework tests
- [ ] Root `bun test` shows no new failures

## Success Criteria

- [ ] First tests for the `state/` domain in luca-framework
- [ ] 5 test cases covering all `emitObserverEvent` behaviors
- [ ] Environment gating, payload construction, error swallowing, and timeout all tested
- [ ] Tests are deterministic and isolated (no flaky behavior)
- [ ] `bun test __tests__/packages/luca-framework/src/state/observer-emitter.test.ts` passes
- [ ] No regressions in existing test suite
