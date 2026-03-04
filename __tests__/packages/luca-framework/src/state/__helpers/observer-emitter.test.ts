/**
 * Tests for observer-emitter.ts -- fire-and-forget event emission.
 *
 * Validates environment gating, payload construction, error swallowing,
 * and timeout behavior of the emitObserverEvent function.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

import {
  emitObserverEvent,
  isLocalhostUrl,
} from "../../../../../../packages/luca-framework/src/state/__helpers/observer-emitter";

// --- Test State ----------------------------------------------------------------

interface CapturedCall {
  url: string;
  init?: RequestInit;
}

let fetchCalls: CapturedCall[] = [];
const originalFetch = globalThis.fetch;
let originalUrl: string | undefined;

// --- Setup / Teardown ----------------------------------------------------------

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

// --- Tests ---------------------------------------------------------------------

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

  describe("SSRF protection", () => {
    test("refuses to emit to non-localhost URL", () => {
      process.env.LUCA_OBSERVER_URL = "http://evil.com:3456";
      emitObserverEvent("test.event");
      expect(fetchCalls).toHaveLength(0);
    });

    test("refuses to emit to remote IP address", () => {
      process.env.LUCA_OBSERVER_URL = "http://203.0.113.1:3456";
      emitObserverEvent("test.event");
      expect(fetchCalls).toHaveLength(0);
    });

    test("allows emission to localhost", () => {
      process.env.LUCA_OBSERVER_URL = "http://localhost:3456";
      emitObserverEvent("test.event");
      expect(fetchCalls).toHaveLength(1);
    });

    test("allows emission to 127.0.0.1", () => {
      process.env.LUCA_OBSERVER_URL = "http://127.0.0.1:3456";
      emitObserverEvent("test.event");
      expect(fetchCalls).toHaveLength(1);
    });

    test("allows emission to [::1]", () => {
      process.env.LUCA_OBSERVER_URL = "http://[::1]:3456";
      emitObserverEvent("test.event");
      expect(fetchCalls).toHaveLength(1);
    });

    test("refuses to emit when URL is malformed", () => {
      process.env.LUCA_OBSERVER_URL = "not-a-valid-url";
      emitObserverEvent("test.event");
      expect(fetchCalls).toHaveLength(0);
    });
  });
});

// --- isLocalhostUrl unit tests -------------------------------------------------

describe("isLocalhostUrl", () => {
  test("returns true for http://localhost:3000", () => {
    expect(isLocalhostUrl("http://localhost:3000")).toBe(true);
  });

  test("returns true for http://127.0.0.1:3000", () => {
    expect(isLocalhostUrl("http://127.0.0.1:3000")).toBe(true);
  });

  test("returns true for http://[::1]:3000", () => {
    expect(isLocalhostUrl("http://[::1]:3000")).toBe(true);
  });

  test("returns true for https://localhost:443", () => {
    expect(isLocalhostUrl("https://localhost:443")).toBe(true);
  });

  test("returns false for http://evil.com", () => {
    expect(isLocalhostUrl("http://evil.com")).toBe(false);
  });

  test("returns false for http://203.0.113.1:3000", () => {
    expect(isLocalhostUrl("http://203.0.113.1:3000")).toBe(false);
  });

  test("returns false for malformed URL", () => {
    expect(isLocalhostUrl("not-a-url")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isLocalhostUrl("")).toBe(false);
  });

  test("returns false for localhost without scheme", () => {
    expect(isLocalhostUrl("localhost:3000")).toBe(false);
  });
});
