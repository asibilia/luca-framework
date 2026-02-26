/**
 * Unit tests for validateFormat
 *
 * Tests the standalone validateFormat function from the functional compiler module.
 */
import { describe, test, expect } from "bun:test";
import {
  validateFormat,
  type SupportedFormat,
} from "../../../src/compilers/__helpers/compile";

describe("validateFormat", () => {
  test("accepts CURSOR format without throwing", () => {
    expect(() => validateFormat("CURSOR")).not.toThrow();
  });

  test("accepts CLAUDE format without throwing", () => {
    expect(() => validateFormat("CLAUDE")).not.toThrow();
  });

  test("accepts PLUGIN format without throwing", () => {
    expect(() => validateFormat("PLUGIN")).not.toThrow();
  });

  test("rejects unsupported format with descriptive error", () => {
    expect(() => validateFormat("UNKNOWN" as SupportedFormat)).toThrow(
      "Unsupported format: UNKNOWN",
    );
  });
});
