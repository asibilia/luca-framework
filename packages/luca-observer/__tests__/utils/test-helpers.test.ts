/**
 * Tests for shared test utilities.
 *
 * Validates that fetch mocks, failing fetch mocks, and environment variable
 * helpers work correctly. Serves as both verification of the test infrastructure
 * and documentation of the mock patterns.
 */
import { describe, test, expect, afterEach } from "bun:test";
import {
  createFetchMock,
  createFailingFetchMock,
  setTestEnv,
} from "./test-helpers";

// ─── createFetchMock ────────────────────────────────────────────────────────

describe("createFetchMock", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  test("captures fetch calls and returns configured response", async () => {
    const mock = createFetchMock('{"status":"ok"}', { status: 200 });
    cleanup = mock.cleanup;

    const response = await fetch("http://localhost:3456/api/events", {
      method: "POST",
      body: JSON.stringify({ type: "test" }),
    });

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].url).toBe("http://localhost:3456/api/events");
    expect(mock.calls[0].init?.method).toBe("POST");

    const body = await response.text();
    expect(body).toBe('{"status":"ok"}');
    expect(response.status).toBe(200);
  });

  test("defaults to 'ok' response body", async () => {
    const mock = createFetchMock();
    cleanup = mock.cleanup;

    const response = await fetch("http://example.com");
    const body = await response.text();

    expect(body).toBe("ok");
    expect(mock.calls).toHaveLength(1);
  });

  test("tracks multiple calls", async () => {
    const mock = createFetchMock();
    cleanup = mock.cleanup;

    await fetch("http://example.com/a");
    await fetch("http://example.com/b");
    await fetch("http://example.com/c");

    expect(mock.calls).toHaveLength(3);
    expect(mock.calls[0].url).toBe("http://example.com/a");
    expect(mock.calls[1].url).toBe("http://example.com/b");
    expect(mock.calls[2].url).toBe("http://example.com/c");
  });

  test("restores original fetch on cleanup", async () => {
    const originalFetch = globalThis.fetch;
    const mock = createFetchMock();

    expect(globalThis.fetch).not.toBe(originalFetch);
    mock.cleanup();
    expect(globalThis.fetch).toBe(originalFetch);

    // Prevent afterEach double-cleanup
    cleanup = undefined;
  });
});

// ─── createFailingFetchMock ─────────────────────────────────────────────────

describe("createFailingFetchMock", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  test("rejects with default network error", async () => {
    const mock = createFailingFetchMock();
    cleanup = mock.cleanup;

    try {
      await fetch("http://example.com/fail");
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Network error");
    }

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].url).toBe("http://example.com/fail");
  });

  test("rejects with custom error", async () => {
    const customError = new Error("Server timeout");
    const mock = createFailingFetchMock(customError);
    cleanup = mock.cleanup;

    try {
      await fetch("http://example.com/timeout");
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBe(customError);
      expect((error as Error).message).toBe("Server timeout");
    }
  });
});

// ─── setTestEnv ─────────────────────────────────────────────────────────────

describe("setTestEnv", () => {
  test("sets environment variables and restores on cleanup", () => {
    const originalValue = process.env["TEST_HELPERS_VAR_A"];

    const cleanup = setTestEnv({
      TEST_HELPERS_VAR_A: "test-value-1",
      TEST_HELPERS_VAR_B: "test-value-2",
    });

    expect(process.env["TEST_HELPERS_VAR_A"]).toBe("test-value-1");
    expect(process.env["TEST_HELPERS_VAR_B"]).toBe("test-value-2");

    cleanup();

    expect(process.env["TEST_HELPERS_VAR_A"]).toBe(originalValue);
    expect(process.env["TEST_HELPERS_VAR_B"]).toBeUndefined();
  });

  test("handles undefined to delete env vars", () => {
    process.env["TEST_HELPERS_DELETE_ME"] = "exists";

    const cleanup = setTestEnv({
      TEST_HELPERS_DELETE_ME: undefined,
    });

    expect(process.env["TEST_HELPERS_DELETE_ME"]).toBeUndefined();

    cleanup();

    expect(process.env["TEST_HELPERS_DELETE_ME"]).toBe("exists");

    // Final cleanup
    delete process.env["TEST_HELPERS_DELETE_ME"];
  });

  test("restores previously undefined vars correctly", () => {
    // Ensure var does not exist
    delete process.env["TEST_HELPERS_NEVER_SET"];

    const cleanup = setTestEnv({
      TEST_HELPERS_NEVER_SET: "temporary",
    });

    expect(process.env["TEST_HELPERS_NEVER_SET"]).toBe("temporary");

    cleanup();

    expect(process.env["TEST_HELPERS_NEVER_SET"]).toBeUndefined();
  });
});
