import { describe, test, expect } from "bun:test";

import { createTextResponse, createJsonResponse } from "../response";

import type { ToolResponse } from "../response";

describe("response helpers", () => {
  describe("createTextResponse", () => {
    test("wraps plain text in Pi tool response structure", () => {
      const result = createTextResponse("Harness is disabled in config");
      expect(result).toEqual({
        content: [{ type: "text", text: "Harness is disabled in config" }],
      });
    });

    test("handles empty string", () => {
      const result = createTextResponse("");
      expect(result).toEqual({
        content: [{ type: "text", text: "" }],
      });
    });

    test("handles multiline text", () => {
      const result = createTextResponse("line 1\nline 2\nline 3");
      expect(result.content[0]!.text).toBe("line 1\nline 2\nline 3");
    });

    test("handles special characters", () => {
      const result = createTextResponse('Role "admin" has <special> & chars');
      expect(result.content[0]!.text).toBe(
        'Role "admin" has <special> & chars',
      );
    });

    test("returns correct ToolResponse structure", () => {
      const result: ToolResponse = createTextResponse("test");
      expect(result.content).toBeArray();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
      expect(typeof result.content[0]!.text).toBe("string");
    });
  });

  describe("createJsonResponse", () => {
    test("serializes object with 2-space indent", () => {
      const data = { status: "passed", count: 3 };
      const result = createJsonResponse(data);
      expect(result.content[0]!.text).toBe(JSON.stringify(data, null, 2));
    });

    test("handles empty object", () => {
      const result = createJsonResponse({});
      expect(result.content[0]!.text).toBe("{}");
    });

    test("handles nested objects", () => {
      const data = {
        checks: [
          { name: "test", status: "passed" },
          { name: "typecheck", status: "failed" },
        ],
        total_duration: 1500,
      };
      const result = createJsonResponse(data);
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed).toEqual(data);
    });

    test("handles null data", () => {
      const result = createJsonResponse(null);
      expect(result.content[0]!.text).toBe("null");
    });

    test("handles array data", () => {
      const data = [1, 2, 3];
      const result = createJsonResponse(data);
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed).toEqual([1, 2, 3]);
    });

    test("handles string data", () => {
      const result = createJsonResponse("hello");
      expect(result.content[0]!.text).toBe('"hello"');
    });

    test("handles number data", () => {
      const result = createJsonResponse(42);
      expect(result.content[0]!.text).toBe("42");
    });

    test("handles boolean data", () => {
      const result = createJsonResponse(true);
      expect(result.content[0]!.text).toBe("true");
    });

    test("handles deeply nested objects", () => {
      const data = {
        level1: {
          level2: {
            level3: {
              value: "deep",
            },
          },
        },
      };
      const result = createJsonResponse(data);
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.level1.level2.level3.value).toBe("deep");
    });

    test("returns correct ToolResponse structure", () => {
      const result: ToolResponse = createJsonResponse({ test: true });
      expect(result.content).toBeArray();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
    });
  });
});
