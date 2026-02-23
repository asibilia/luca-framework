/**
 * Security validation tests for sanitizeJsonParse and safeSanitizeJsonParse.
 *
 * Verifies prototype pollution protection, recursive stripping of dangerous
 * keys (__proto__, constructor, prototype), and correct handling of edge cases.
 */
import { describe, test, expect } from "bun:test";
import {
  sanitizeJsonParse,
  safeSanitizeJsonParse,
} from "../../../src/shared/validation-utils";

// ---------------------------------------------------------------------------
// sanitizeJsonParse (7 cases)
// ---------------------------------------------------------------------------

describe("sanitizeJsonParse", () => {
  test("parses valid JSON without dangerous keys unchanged", () => {
    const result = sanitizeJsonParse('{"name": "Luca", "version": 1}');
    expect(result).toEqual({ name: "Luca", version: 1 });
  });

  test("strips __proto__ key from top-level object", () => {
    const json = '{"name": "safe", "__proto__": {"admin": true}}';
    const result = sanitizeJsonParse(json) as Record<string, unknown>;
    expect(result).toEqual({ name: "safe" });
    expect(Object.keys(result)).not.toContain("__proto__");
    expect(result).not.toHaveProperty("__proto__", { admin: true });
  });

  test("strips constructor and prototype keys from top-level object", () => {
    const json =
      '{"data": 1, "constructor": {"polluted": true}, "prototype": {"hacked": true}}';
    const result = sanitizeJsonParse(json) as Record<string, unknown>;
    expect(result).toEqual({ data: 1 });
    expect(Object.keys(result)).not.toContain("constructor");
    expect(Object.keys(result)).not.toContain("prototype");
  });

  test("recursively strips dangerous keys from nested objects", () => {
    const json =
      '{"outer": {"inner": {"__proto__": {"admin": true}, "safe": "value"}, "constructor": {}}}';
    const result = sanitizeJsonParse(json);
    expect(result).toEqual({ outer: { inner: { safe: "value" } } });
  });

  test("strips dangerous keys from objects inside arrays", () => {
    const json =
      '[{"name": "a", "__proto__": {"x": 1}}, {"name": "b", "constructor": {}}]';
    const result = sanitizeJsonParse(json);
    expect(result).toEqual([{ name: "a" }, { name: "b" }]);
  });

  test("handles primitive JSON values (string, number, boolean, null)", () => {
    expect(sanitizeJsonParse('"hello"')).toBe("hello");
    expect(sanitizeJsonParse("42")).toBe(42);
    expect(sanitizeJsonParse("true")).toBe(true);
    expect(sanitizeJsonParse("null")).toBe(null);
  });

  test("throws SyntaxError on invalid JSON", () => {
    expect(() => sanitizeJsonParse("not valid json")).toThrow(SyntaxError);
    expect(() => sanitizeJsonParse("")).toThrow(SyntaxError);
  });
});

// ---------------------------------------------------------------------------
// safeSanitizeJsonParse (5 cases)
// ---------------------------------------------------------------------------

describe("safeSanitizeJsonParse", () => {
  test("returns success with sanitized data for valid JSON", () => {
    const result = safeSanitizeJsonParse('{"key": "value"}');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ key: "value" });
    }
    if (!result.success) {
      expect(result.error).toBeUndefined();
    }
  });

  test("strips dangerous keys and returns success", () => {
    const json =
      '{"safe": true, "__proto__": {"evil": true}, "constructor": {}}';
    const result = safeSanitizeJsonParse(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ safe: true });
    }
  });

  test("returns success: false with error for invalid JSON", () => {
    const result = safeSanitizeJsonParse("}{bad json");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  test("returns success: false with error for empty string", () => {
    const result = safeSanitizeJsonParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  test("handles deeply nested prototype pollution attempts", () => {
    const json = JSON.stringify({
      level1: {
        level2: {
          level3: {
            __proto__: { polluted: true },
            prototype: { hacked: true },
            safe: "deep",
          },
        },
      },
    });
    const result = safeSanitizeJsonParse(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        level1: { level2: { level3: { safe: "deep" } } },
      });
    }
  });
});
