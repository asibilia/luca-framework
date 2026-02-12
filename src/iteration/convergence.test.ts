import { describe, test, expect } from "bun:test";
import type { ParsedError } from "../harness/types";
import type { ClassifiedError } from "./types";
import {
  createFingerprint,
  computeFingerprintOverlap,
  computeConvergenceSignals,
  assessConvergence,
} from "./convergence";

describe("createFingerprint", () => {
  test("same error produces same fingerprint", () => {
    const error: ParsedError = {
      file: "src/foo.ts",
      line: 42,
      message: "Type 'string' is not assignable to type 'number'",
      code: "TS2322",
      severity: "error",
    };
    const fp1 = createFingerprint(error);
    const fp2 = createFingerprint(error);
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(16);
  });

  test("different errors produce different fingerprints", () => {
    const error1: ParsedError = {
      file: "src/foo.ts",
      line: 42,
      message: "Type 'string' is not assignable",
      severity: "error",
    };
    const error2: ParsedError = {
      file: "src/bar.ts",
      line: 10,
      message: "Cannot find name 'x'",
      severity: "error",
    };
    expect(createFingerprint(error1)).not.toBe(createFingerprint(error2));
  });

  test("numeric normalization: errors differing only in numbers produce same fingerprint", () => {
    const error1: ParsedError = {
      file: "src/foo.ts",
      line: 42,
      message: "Expected 5 arguments, but got 3",
      severity: "error",
    };
    const error2: ParsedError = {
      file: "src/foo.ts",
      line: 42,
      message: "Expected 10 arguments, but got 7",
      severity: "error",
    };
    expect(createFingerprint(error1)).toBe(createFingerprint(error2));
  });

  test("missing optional fields produce valid fingerprint", () => {
    const error: ParsedError = {
      file: "src/foo.ts",
      message: "Some error",
      severity: "error",
    };
    const fp = createFingerprint(error);
    expect(fp).toHaveLength(16);
    expect(typeof fp).toBe("string");
  });
});

describe("computeFingerprintOverlap", () => {
  test("identical sets return 1.0", () => {
    const fps = ["fp1", "fp2", "fp3"];
    expect(computeFingerprintOverlap(fps, fps)).toBe(1.0);
  });

  test("completely disjoint sets return 0.0", () => {
    expect(computeFingerprintOverlap(["fp1", "fp2"], ["fp3", "fp4"])).toBe(0.0);
  });

  test("partial overlap returns correct Jaccard coefficient", () => {
    // Intersection: {fp2} = 1, Union: {fp1, fp2, fp3} = 3
    const overlap = computeFingerprintOverlap(["fp1", "fp2"], ["fp2", "fp3"]);
    expect(overlap).toBeCloseTo(1 / 3, 5);
  });

  test("both empty sets return 0.0", () => {
    expect(computeFingerprintOverlap([], [])).toBe(0);
  });

  test("one empty, one non-empty returns 0.0", () => {
    expect(computeFingerprintOverlap([], ["fp1"])).toBe(0);
    expect(computeFingerprintOverlap(["fp1"], [])).toBe(0);
  });
});

describe("computeConvergenceSignals", () => {
  function makeClassified(
    fingerprint: string,
    classification: "transient" | "correctable" | "permanent" = "correctable",
  ): ClassifiedError {
    return {
      fingerprint,
      source: "test",
      classification,
      iterations_seen: 1,
      message: "error",
    };
  }

  test("filters out permanent errors before computing signals", () => {
    const current = [
      makeClassified("fp1", "correctable"),
      makeClassified("fp2", "permanent"),
    ];
    const previous = [
      makeClassified("fp1", "correctable"),
      makeClassified("fp3", "correctable"),
    ];
    const signals = computeConvergenceSignals(current, previous, 2);
    // Current active: 1 (fp1), Previous active: 2 (fp1, fp3)
    expect(signals.error_count_delta).toBe(-1); // 1 - 2
  });

  test("correctly computes error_count_delta", () => {
    const current = [makeClassified("fp1"), makeClassified("fp2")];
    const previous = [
      makeClassified("fp3"),
      makeClassified("fp4"),
      makeClassified("fp5"),
    ];
    const signals = computeConvergenceSignals(current, previous, 0);
    expect(signals.error_count_delta).toBe(-1); // 2 - 3
  });

  test("artifact_change_delta passed through correctly", () => {
    const signals = computeConvergenceSignals([], [], 7);
    expect(signals.artifact_change_delta).toBe(7);
  });
});

describe("assessConvergence", () => {
  test("all signals improving: status = improved, stale resets to 0", () => {
    const result = assessConvergence(
      {
        error_count_delta: -3,
        fingerprint_overlap: 0.2,
        artifact_change_delta: 5,
      },
      1,
    );
    expect(result.status).toBe("improved");
    expect(result.consecutive_stale).toBe(0);
    expect(result.should_halt).toBe(false);
  });

  test("2-of-3 stale signals: status = stalled", () => {
    const result = assessConvergence(
      {
        error_count_delta: 0,
        fingerprint_overlap: 0.9,
        artifact_change_delta: 5,
      },
      0,
    );
    expect(result.status).toBe("stalled");
    expect(result.consecutive_stale).toBe(1);
  });

  test("error count increased: status = regressed", () => {
    const result = assessConvergence(
      {
        error_count_delta: 2,
        fingerprint_overlap: 0.5,
        artifact_change_delta: 3,
      },
      0,
    );
    expect(result.status).toBe("regressed");
  });

  test("2 consecutive stale: should_halt = true (with staleThreshold=2)", () => {
    const result = assessConvergence(
      {
        error_count_delta: 0,
        fingerprint_overlap: 0.9,
        artifact_change_delta: 0,
      },
      1, // previous was 1, now will be 2
      2, // threshold
    );
    expect(result.consecutive_stale).toBe(2);
    expect(result.should_halt).toBe(true);
  });

  test("improvement after stale: consecutive resets to 0", () => {
    const result = assessConvergence(
      {
        error_count_delta: -2,
        fingerprint_overlap: 0.3,
        artifact_change_delta: 4,
      },
      3, // was 3 consecutive stale
    );
    expect(result.status).toBe("improved");
    expect(result.consecutive_stale).toBe(0);
    expect(result.should_halt).toBe(false);
  });

  test("staleThreshold=3 requires 3 consecutive stale to halt", () => {
    const result = assessConvergence(
      {
        error_count_delta: 0,
        fingerprint_overlap: 0.85,
        artifact_change_delta: 0,
      },
      1,
      3, // threshold=3
    );
    expect(result.consecutive_stale).toBe(2);
    expect(result.should_halt).toBe(false); // 2 < 3
  });
});
