import { describe, test, expect } from "bun:test";
import {
  isDebateComplexity,
  DEBATE_QUALIFYING_COMPLEXITIES,
} from "../../../src/complexity/__helpers/complexity-gate";

describe("DEBATE_QUALIFYING_COMPLEXITIES", () => {
  test("contains exactly COMPLEX and CRITICAL", () => {
    expect(DEBATE_QUALIFYING_COMPLEXITIES).toEqual(["COMPLEX", "CRITICAL"]);
  });

  test("is readonly (tuple of two elements)", () => {
    expect(DEBATE_QUALIFYING_COMPLEXITIES).toHaveLength(2);
  });
});

describe("isDebateComplexity", () => {
  // --- Qualifying levels ---

  test("returns true for COMPLEX", () => {
    expect(isDebateComplexity("COMPLEX")).toBe(true);
  });

  test("returns true for CRITICAL", () => {
    expect(isDebateComplexity("CRITICAL")).toBe(true);
  });

  // --- Non-qualifying levels ---

  test("returns false for TRIVIAL", () => {
    expect(isDebateComplexity("TRIVIAL")).toBe(false);
  });

  test("returns false for SIMPLE", () => {
    expect(isDebateComplexity("SIMPLE")).toBe(false);
  });

  test("returns false for MODERATE", () => {
    expect(isDebateComplexity("MODERATE")).toBe(false);
  });

  // --- Case insensitivity ---

  test("is case-insensitive: lowercase 'complex'", () => {
    expect(isDebateComplexity("complex")).toBe(true);
  });

  test("is case-insensitive: lowercase 'critical'", () => {
    expect(isDebateComplexity("critical")).toBe(true);
  });

  test("is case-insensitive: mixed case 'Complex'", () => {
    expect(isDebateComplexity("Complex")).toBe(true);
  });

  test("is case-insensitive: mixed case 'Critical'", () => {
    expect(isDebateComplexity("Critical")).toBe(true);
  });

  test("is case-insensitive: mixed case 'cRiTiCaL'", () => {
    expect(isDebateComplexity("cRiTiCaL")).toBe(true);
  });

  test("is case-insensitive: lowercase non-qualifying 'moderate'", () => {
    expect(isDebateComplexity("moderate")).toBe(false);
  });

  // --- Edge cases ---

  test("returns false for empty string", () => {
    expect(isDebateComplexity("")).toBe(false);
  });

  test("returns false for unknown value", () => {
    expect(isDebateComplexity("unknown")).toBe(false);
  });

  test("returns false for whitespace-padded input", () => {
    expect(isDebateComplexity(" COMPLEX ")).toBe(false);
  });

  test("returns false for partial match 'COMP'", () => {
    expect(isDebateComplexity("COMP")).toBe(false);
  });

  test("returns false for superset 'COMPLEXX'", () => {
    expect(isDebateComplexity("COMPLEXX")).toBe(false);
  });
});
