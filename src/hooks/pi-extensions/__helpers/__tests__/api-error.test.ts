/**
 * Unit tests for API error parsing, deduplication, and rendering.
 *
 * Validates that nested JSON error payloads from providers like Gemini
 * are correctly parsed into clean, human-readable structures.
 */
import { describe, test, expect } from "bun:test";

import {
  parseApiError,
  deduplicateErrors,
  renderApiError,
} from "../widget-renderers";

import type { ApiErrorInfo, ApiErrorState } from "../widget-renderers";

describe("parseApiError", () => {
  test("parses double-nested Gemini 503 error", () => {
    const raw = `{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 503,\\n    \\"message\\": \\"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.\\",\\n    \\"status\\": \\"UNAVAILABLE\\"\\n  }\\n}\\n","code":503,"status":"Service Unavailable"}}`;

    const result = parseApiError(raw);

    expect(result).not.toBeNull();
    expect(result!.code).toBe(503);
    expect(result!.status).toBe("UNAVAILABLE");
    expect(result!.message).toContain("high demand");
    expect(result!.retryAttempts).toBeUndefined();
  });

  test("parses error with 'Error: ' prefix", () => {
    const raw = `Error: {"error":{"message":"Bad request","code":400,"status":"Bad Request"}}`;

    const result = parseApiError(raw);

    expect(result).not.toBeNull();
    expect(result!.code).toBe(400);
    expect(result!.status).toBe("Bad Request");
    expect(result!.message).toBe("Bad request");
  });

  test("parses retry wrapper", () => {
    const raw = `Retry failed after 3 attempts: {"error":{"message":"Rate limited","code":429,"status":"Too Many Requests"}}`;

    const result = parseApiError(raw);

    expect(result).not.toBeNull();
    expect(result!.code).toBe(429);
    expect(result!.retryAttempts).toBe(3);
  });

  test("parses combined Error prefix + retry wrapper", () => {
    const raw = `Error: Retry failed after 5 attempts: {"error":{"message":"Service down","code":503,"status":"Service Unavailable"}}`;

    const result = parseApiError(raw);

    expect(result).not.toBeNull();
    expect(result!.code).toBe(503);
    expect(result!.retryAttempts).toBe(5);
  });

  test("extracts inner error from nested JSON message", () => {
    const innerJson = JSON.stringify({
      error: {
        code: 503,
        message: "Model overloaded",
        status: "UNAVAILABLE",
      },
    });
    const raw = JSON.stringify({
      error: {
        message: innerJson,
        code: 503,
        status: "Service Unavailable",
      },
    });

    const result = parseApiError(raw);

    expect(result).not.toBeNull();
    // Should prefer inner error details
    expect(result!.message).toBe("Model overloaded");
    expect(result!.status).toBe("UNAVAILABLE");
  });

  test("handles flat (non-nested) error message", () => {
    const raw = JSON.stringify({
      error: {
        message: "Invalid API key",
        code: 401,
        status: "Unauthorized",
      },
    });

    const result = parseApiError(raw);

    expect(result).not.toBeNull();
    expect(result!.code).toBe(401);
    expect(result!.message).toBe("Invalid API key");
  });

  test("returns null for non-JSON input", () => {
    expect(parseApiError("just a plain error message")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseApiError("")).toBeNull();
  });

  test("returns null for null/undefined", () => {
    expect(parseApiError(null as any)).toBeNull();
    expect(parseApiError(undefined as any)).toBeNull();
  });

  test("returns null for JSON without error property", () => {
    expect(parseApiError('{"data":"something"}')).toBeNull();
  });

  test("handles PAT not supported error", () => {
    const raw = `Error: {"error":{"message":"Personal Access Tokens are not supported for this endpoint","code":400,"status":"Bad Request"}}`;

    const result = parseApiError(raw);

    expect(result).not.toBeNull();
    expect(result!.code).toBe(400);
    expect(result!.message).toBe(
      "Personal Access Tokens are not supported for this endpoint",
    );
  });
});

describe("deduplicateErrors", () => {
  test("groups consecutive identical errors", () => {
    const errors: ApiErrorInfo[] = [
      { code: 503, status: "UNAVAILABLE", message: "High demand" },
      { code: 503, status: "UNAVAILABLE", message: "High demand" },
      { code: 503, status: "UNAVAILABLE", message: "High demand" },
    ];

    const result = deduplicateErrors(errors);

    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(3);
    expect(result[0]!.code).toBe(503);
  });

  test("preserves retryAttempts from last duplicate", () => {
    const errors: ApiErrorInfo[] = [
      { code: 503, status: "UNAVAILABLE", message: "High demand" },
      { code: 503, status: "UNAVAILABLE", message: "High demand" },
      {
        code: 503,
        status: "UNAVAILABLE",
        message: "High demand",
        retryAttempts: 3,
      },
    ];

    const result = deduplicateErrors(errors);

    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(3);
    expect(result[0]!.retryAttempts).toBe(3);
  });

  test("separates different error types", () => {
    const errors: ApiErrorInfo[] = [
      { code: 503, status: "UNAVAILABLE", message: "High demand" },
      { code: 429, status: "TOO_MANY_REQUESTS", message: "Rate limited" },
      { code: 503, status: "UNAVAILABLE", message: "High demand" },
    ];

    const result = deduplicateErrors(errors);

    expect(result).toHaveLength(3);
    expect(result[0]!.code).toBe(503);
    expect(result[1]!.code).toBe(429);
    expect(result[2]!.code).toBe(503);
  });

  test("returns empty array for empty input", () => {
    expect(deduplicateErrors([])).toEqual([]);
  });

  test("single error gets count of 1", () => {
    const errors: ApiErrorInfo[] = [
      { code: 500, status: "INTERNAL", message: "Server error" },
    ];

    const result = deduplicateErrors(errors);

    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(1);
  });
});

describe("renderApiError", () => {
  test("returns null for null state", () => {
    expect(renderApiError(null)).toBeNull();
  });

  test("returns null for empty errors array", () => {
    const state: ApiErrorState = {
      errors: [],
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };
    expect(renderApiError(state)).toBeNull();
  });

  test("renders a single error as a bordered widget", () => {
    const state: ApiErrorState = {
      errors: [
        {
          code: 503,
          status: "UNAVAILABLE",
          message: "This model is currently experiencing high demand.",
        },
      ],
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };

    const component = renderApiError(state);

    expect(component).not.toBeNull();
    const lines = component!.render(60);

    // Should have bordered box structure
    expect(lines[0]).toContain("API Error");
    expect(lines[0]).toContain("\u250c"); // top-left corner
    expect(lines[lines.length - 1]).toContain("\u2518"); // bottom-right corner

    // Should contain error code and message
    const content = lines.join("\n");
    expect(content).toContain("503");
    expect(content).toContain("UNAVAILABLE");
    expect(content).toContain("high demand");
  });

  test("renders deduplicated count for repeated errors", () => {
    const state: ApiErrorState = {
      errors: [
        { code: 503, status: "UNAVAILABLE", message: "High demand" },
        { code: 503, status: "UNAVAILABLE", message: "High demand" },
        { code: 503, status: "UNAVAILABLE", message: "High demand" },
        { code: 503, status: "UNAVAILABLE", message: "High demand" },
      ],
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };

    const component = renderApiError(state);
    const lines = component!.render(60);
    const content = lines.join("\n");

    // Should show ×4 count
    expect(content).toContain("\u00d74"); // ×4
  });

  test("renders retry info", () => {
    const state: ApiErrorState = {
      errors: [
        {
          code: 503,
          status: "UNAVAILABLE",
          message: "High demand",
          retryAttempts: 3,
        },
      ],
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };

    const component = renderApiError(state);
    const lines = component!.render(60);
    const content = lines.join("\n");

    expect(content).toContain("Retry failed after 3 attempts");
  });

  test("shows timestamp", () => {
    const state: ApiErrorState = {
      errors: [{ code: 503, status: "UNAVAILABLE", message: "High demand" }],
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };

    const component = renderApiError(state);
    const lines = component!.render(60);
    const content = lines.join("\n");

    expect(content).toContain("First seen:");
  });

  test("has invalidate method", () => {
    const state: ApiErrorState = {
      errors: [{ code: 503, status: "UNAVAILABLE", message: "test" }],
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };

    const component = renderApiError(state);
    expect(component!.invalidate).toBeDefined();
    expect(typeof component!.invalidate).toBe("function");
  });
});
