import { describe, test, expect } from "bun:test";
import {
  COMPLEXITY_CLASSIFICATIONS,
  DEFAULT_COMPLEXITY_MATRIX,
  DEFAULT_COMPLEXITY_CONFIG,
  COMPLEXITY_LEVELS,
} from "../../../src/complexity";

describe("complexity classifications", () => {
  test("has classifications for all 5 levels", () => {
    for (const level of COMPLEXITY_LEVELS) {
      expect(COMPLEXITY_CLASSIFICATIONS).toHaveProperty(level);
    }
  });

  test("each classification has required fields", () => {
    for (const level of COMPLEXITY_LEVELS) {
      const c = COMPLEXITY_CLASSIFICATIONS[level];
      expect(c.level).toBe(level);
      expect(typeof c.fileCount).toBe("string");
      expect(typeof c.scope).toBe("string");
      expect(typeof c.risk).toBe("string");
      expect(typeof c.estimatedTime).toBe("string");
      expect(c.examples.length).toBeGreaterThan(0);
    }
  });
});

describe("default complexity matrix", () => {
  test("has entries for all 5 levels", () => {
    for (const level of COMPLEXITY_LEVELS) {
      expect(DEFAULT_COMPLEXITY_MATRIX).toHaveProperty(level);
    }
  });

  test("TRIVIAL skips most optional steps", () => {
    const gate = DEFAULT_COMPLEXITY_MATRIX.TRIVIAL;
    expect(gate.research).toBe("skip");
    expect(gate.discussion).toBe("skip");
    expect(gate.planVerificationIterations).toBe(0);
    expect(gate.codeReviewAgents).toEqual([]);
    expect(gate.uat).toBe("skip");
    expect(gate.learningCapture).toBe("skip");
    expect(gate.cognitivePreflight).toBe("lite");
  });

  test("MODERATE has standard settings", () => {
    const gate = DEFAULT_COMPLEXITY_MATRIX.MODERATE;
    expect(gate.research).toBe("optional");
    expect(gate.verificationMode).toBe("standard");
    expect(gate.planVerificationIterations).toBe(1);
    expect(gate.codeReviewAgents.length).toBeGreaterThan(0);
    expect(gate.cognitivePreflight).toBe("full");
  });

  test("CRITICAL enables everything with max settings", () => {
    const gate = DEFAULT_COMPLEXITY_MATRIX.CRITICAL;
    expect(gate.research).toBe("required");
    expect(gate.discussion).toBe("required");
    expect(gate.planVerificationIterations).toBe(3);
    expect(gate.harnessFixIterations).toBe(3);
    expect(gate.verificationMode).toBe("full+human");
    expect(gate.codeReviewAgents).toContain("security-auditor");
    expect(gate.uat).toBe("required+thorough");
    expect(gate.learningCapture).toBe("full+debrief");
  });

  test("harness fix iterations scale with complexity", () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.TRIVIAL.harnessFixIterations).toBe(1);
    expect(DEFAULT_COMPLEXITY_MATRIX.SIMPLE.harnessFixIterations).toBe(2);
    expect(DEFAULT_COMPLEXITY_MATRIX.MODERATE.harnessFixIterations).toBe(2);
    expect(DEFAULT_COMPLEXITY_MATRIX.COMPLEX.harnessFixIterations).toBe(2);
    expect(DEFAULT_COMPLEXITY_MATRIX.CRITICAL.harnessFixIterations).toBe(3);
  });
});

describe("default complexity config", () => {
  test("defaultLevel is auto", () => {
    expect(DEFAULT_COMPLEXITY_CONFIG.defaultLevel).toBe("auto");
  });

  test("contains the full matrix", () => {
    expect(Object.keys(DEFAULT_COMPLEXITY_CONFIG.matrix)).toHaveLength(5);
  });
});
