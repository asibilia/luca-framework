/**
 * Shared test utilities for luca-observer tests.
 *
 * Provides reusable mock patterns for fetch, environment variables,
 * and common test setup/teardown helpers.
 *
 * Uses manual mocking patterns (globalThis overrides) since Bun's
 * built-in mock() cannot intercept module-level global references.
 */

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
