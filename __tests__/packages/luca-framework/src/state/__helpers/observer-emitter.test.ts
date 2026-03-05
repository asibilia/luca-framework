/**
 * Tests for observer-emitter.ts -- fire-and-forget event emission via SpacetimeDB.
 *
 * Validates URL resolution, reducer call construction, SSRF protection,
 * error swallowing, and timeout behavior.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

import {
  emitObserverEvent,
  callReducer,
  isLocalhostUrl,
} from "../../../../../../packages/luca-framework/src/state/__helpers/observer-emitter";

// --- Test State ----------------------------------------------------------------

interface CapturedCall {
  url: string;
  init?: RequestInit;
}

let fetchCalls: CapturedCall[] = [];
const originalFetch = globalThis.fetch;
let envBackup: Record<string, string | undefined> = {};

// --- Setup / Teardown ----------------------------------------------------------

beforeEach(() => {
  fetchCalls = [];
  envBackup = {
    LUCA_SPACETIMEDB_URL: process.env.LUCA_SPACETIMEDB_URL,
    LUCA_OBSERVER_URL: process.env.LUCA_OBSERVER_URL,
  };

  // Default mock: capture calls and resolve successfully
  globalThis.fetch = ((url: any, init?: any) => {
    fetchCalls.push({ url: String(url), init });
    return Promise.resolve(new Response("ok"));
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

// --- Tests ---------------------------------------------------------------------

describe("callReducer", () => {
  describe("URL resolution", () => {
    test("uses default localhost:3000 when no env vars set", () => {
      delete process.env.LUCA_SPACETIMEDB_URL;
      delete process.env.LUCA_OBSERVER_URL;

      callReducer("test_reducer", { key: "value" });

      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0]!.url).toBe(
        "http://localhost:3000/v1/database/luca-observer/call/test_reducer",
      );
    });

    test("prefers LUCA_SPACETIMEDB_URL over LUCA_OBSERVER_URL", () => {
      process.env.LUCA_SPACETIMEDB_URL = "http://localhost:4000";
      process.env.LUCA_OBSERVER_URL = "http://localhost:5000";

      callReducer("test_reducer", {});

      expect(fetchCalls[0]!.url).toStartWith("http://localhost:4000/");
    });

    test("falls back to LUCA_OBSERVER_URL", () => {
      delete process.env.LUCA_SPACETIMEDB_URL;
      process.env.LUCA_OBSERVER_URL = "http://localhost:5000";

      callReducer("test_reducer", {});

      expect(fetchCalls[0]!.url).toStartWith("http://localhost:5000/");
    });
  });

  describe("request construction", () => {
    test("sends POST with JSON body containing flat args (no wrapper)", () => {
      delete process.env.LUCA_SPACETIMEDB_URL;
      process.env.LUCA_OBSERVER_URL = "http://localhost:3456";

      callReducer("ingest_event", { eventType: "test", sessionId: "abc" });

      expect(fetchCalls).toHaveLength(1);
      const call = fetchCalls[0]!;
      expect(call.url).toBe(
        "http://localhost:3456/v1/database/luca-observer/call/ingest_event",
      );
      expect(call.init?.method).toBe("POST");
      expect(call.init?.headers).toEqual({
        "Content-Type": "application/json",
      });

      const body = JSON.parse(call.init?.body as string);
      expect(body.eventType).toBe("test");
      expect(body.sessionId).toBe("abc");
    });
  });
});

describe("emitObserverEvent", () => {
  describe("payload construction", () => {
    test("calls ingest_event reducer with correct payload", () => {
      process.env.LUCA_OBSERVER_URL = "http://localhost:3456";
      emitObserverEvent("state.transition", {
        session_id: "abc-123",
      });

      expect(fetchCalls).toHaveLength(1);

      const call = fetchCalls[0]!;
      expect(call.url).toBe(
        "http://localhost:3456/v1/database/luca-observer/call/ingest_event",
      );
      expect(call.init?.method).toBe("POST");

      const body = JSON.parse(call.init?.body as string);
      expect(body.eventType).toBe("state.transition");
      expect(body.sessionId).toBe("abc-123");
    });

    test("includes numeric timestamp in payload", () => {
      process.env.LUCA_OBSERVER_URL = "http://localhost:3456";
      const before = Date.now();
      emitObserverEvent("test.event");
      const after = Date.now();

      expect(fetchCalls).toHaveLength(1);
      const body = JSON.parse(fetchCalls[0]!.init?.body as string);

      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe("number");
      expect(body.timestamp >= before).toBe(true);
      expect(body.timestamp <= after).toBe(true);
    });

    test("serializes event data to eventData JSON string", () => {
      process.env.LUCA_OBSERVER_URL = "http://localhost:3456";
      emitObserverEvent("test.event", {
        extra: "data",
        nested: { key: "value" },
      });

      const body = JSON.parse(fetchCalls[0]!.init?.body as string);
      const eventData = JSON.parse(body.eventData);
      expect(eventData.extra).toBe("data");
      expect(eventData.nested).toEqual({ key: "value" });
    });
  });

  describe("error handling", () => {
    test("silently swallows fetch rejection without throwing", () => {
      process.env.LUCA_OBSERVER_URL = "http://localhost:3456";

      globalThis.fetch = ((url: any, init?: any) => {
        fetchCalls.push({ url: String(url), init });
        return Promise.reject(new Error("Connection refused"));
      }) as typeof fetch;

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
      expect(signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("SSRF protection", () => {
    test("refuses to emit to non-localhost URL", () => {
      process.env.LUCA_SPACETIMEDB_URL = "http://evil.com:3456";
      delete process.env.LUCA_OBSERVER_URL;
      emitObserverEvent("test.event");
      expect(fetchCalls).toHaveLength(0);
    });

    test("refuses to emit to remote IP address", () => {
      process.env.LUCA_SPACETIMEDB_URL = "http://203.0.113.1:3456";
      delete process.env.LUCA_OBSERVER_URL;
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
      process.env.LUCA_SPACETIMEDB_URL = "not-a-valid-url";
      delete process.env.LUCA_OBSERVER_URL;
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

  test("returns true for http://0.0.0.0:3000", () => {
    expect(isLocalhostUrl("http://0.0.0.0:3000")).toBe(true);
  });

  test("returns true for zero-padded 127.000.000.001", () => {
    expect(isLocalhostUrl("http://127.000.000.001:3000")).toBe(true);
  });

  test("returns false for 127.0.0.1.evil.com (subdomain trick)", () => {
    expect(isLocalhostUrl("http://127.0.0.1.evil.com:3000")).toBe(false);
  });
});
