import { describe, test, expect } from "bun:test";
import {
  detectStall,
  areFingerprintsIdentical,
} from "../../../src/iteration/__helpers/stall-detector";
import type { ConvergenceSignals } from "~/iteration/__schemas/iteration.schemas";

describe("detectStall", () => {
  test("no stall when all signals show improvement", () => {
    const signals: ConvergenceSignals = {
      error_count_delta: -3,
      fingerprint_overlap: 0.2,
      artifact_change_delta: 5,
    };
    const result = detectStall(signals, 0);
    expect(result.stalled).toBe(false);
    expect(result.stale_count).toBe(0);
    expect(result.should_halt).toBe(false);
    expect(result.reason).toBe("");
  });

  test("stall detected when 2-of-3 indicators fire", () => {
    const signals: ConvergenceSignals = {
      error_count_delta: 0,
      fingerprint_overlap: 0.9,
      artifact_change_delta: 5,
    };
    const result = detectStall(signals, 0);
    expect(result.stalled).toBe(true);
    expect(result.stale_count).toBe(1);
    expect(result.should_halt).toBe(false);
    expect(result.indicators.no_error_improvement).toBe(true);
    expect(result.indicators.fingerprints_unchanged).toBe(true);
    expect(result.indicators.no_artifact_changes).toBe(false);
  });

  test("stall detected when all 3 indicators fire", () => {
    const signals: ConvergenceSignals = {
      error_count_delta: 0,
      fingerprint_overlap: 0.85,
      artifact_change_delta: 0,
    };
    const result = detectStall(signals, 0);
    expect(result.stalled).toBe(true);
    expect(result.indicators.no_error_improvement).toBe(true);
    expect(result.indicators.fingerprints_unchanged).toBe(true);
    expect(result.indicators.no_artifact_changes).toBe(true);
  });

  test("should_halt after reaching stale_threshold (default 2)", () => {
    const signals: ConvergenceSignals = {
      error_count_delta: 0,
      fingerprint_overlap: 0.9,
      artifact_change_delta: 0,
    };
    const result = detectStall(signals, 1);
    expect(result.stalled).toBe(true);
    expect(result.stale_count).toBe(2);
    expect(result.should_halt).toBe(true);
  });

  test("configurable stale_threshold", () => {
    const signals: ConvergenceSignals = {
      error_count_delta: 0,
      fingerprint_overlap: 0.9,
      artifact_change_delta: 0,
    };
    const result = detectStall(signals, 1, { stale_threshold: 3 });
    expect(result.stale_count).toBe(2);
    expect(result.should_halt).toBe(false);

    const result2 = detectStall(signals, 2, { stale_threshold: 3 });
    expect(result2.stale_count).toBe(3);
    expect(result2.should_halt).toBe(true);
  });

  test("consecutive stale resets on improvement", () => {
    const improvedSignals: ConvergenceSignals = {
      error_count_delta: -2,
      fingerprint_overlap: 0.3,
      artifact_change_delta: 4,
    };
    const result = detectStall(improvedSignals, 3);
    expect(result.stalled).toBe(false);
    expect(result.stale_count).toBe(0);
    expect(result.should_halt).toBe(false);
  });

  test("semantic overlap used as 4th signal when present", () => {
    const signals: ConvergenceSignals = {
      error_count_delta: -1,
      fingerprint_overlap: 0.5,
      artifact_change_delta: 3,
      semantic_overlap: 0.95,
    };
    // Only 1 indicator fires (semantic), so not stalled
    const result = detectStall(signals, 0);
    expect(result.stalled).toBe(false);
    expect(result.indicators.semantic_unchanged).toBe(true);
  });

  test("semantic overlap contributes to stall when combined", () => {
    const signals: ConvergenceSignals = {
      error_count_delta: 0,
      fingerprint_overlap: 0.5,
      artifact_change_delta: 3,
      semantic_overlap: 0.95,
    };
    // 2 indicators fire: no_error_improvement + semantic_unchanged
    const result = detectStall(signals, 0);
    expect(result.stalled).toBe(true);
  });

  test("semantic_unchanged is null when semantic_overlap not present", () => {
    const signals: ConvergenceSignals = {
      error_count_delta: -1,
      fingerprint_overlap: 0.3,
      artifact_change_delta: 2,
    };
    const result = detectStall(signals, 0);
    expect(result.indicators.semantic_unchanged).toBeNull();
  });

  test("custom fingerprint_threshold", () => {
    const signals: ConvergenceSignals = {
      error_count_delta: 0,
      fingerprint_overlap: 0.7,
      artifact_change_delta: 0,
    };
    // Default threshold 0.8 -> fingerprints NOT unchanged
    const result = detectStall(signals, 0);
    expect(result.indicators.fingerprints_unchanged).toBe(false);

    // Lower threshold 0.6 -> fingerprints unchanged
    const result2 = detectStall(signals, 0, { fingerprint_threshold: 0.6 });
    expect(result2.indicators.fingerprints_unchanged).toBe(true);
  });

  test("reason string describes fired indicators", () => {
    const signals: ConvergenceSignals = {
      error_count_delta: 0,
      fingerprint_overlap: 0.9,
      artifact_change_delta: 0,
    };
    const result = detectStall(signals, 0);
    expect(result.reason).toContain("fingerprint overlap");
    expect(result.reason).toContain("no artifact changes");
    expect(result.reason).toContain("error count delta");
  });
});

describe("areFingerprintsIdentical", () => {
  test("identical sets return true", () => {
    expect(areFingerprintsIdentical(["fp1", "fp2"], ["fp1", "fp2"])).toBe(true);
  });

  test("identical sets in different order return true", () => {
    expect(areFingerprintsIdentical(["fp1", "fp2"], ["fp2", "fp1"])).toBe(true);
  });

  test("different lengths return false", () => {
    expect(areFingerprintsIdentical(["fp1", "fp2"], ["fp1"])).toBe(false);
  });

  test("different fingerprints return false", () => {
    expect(areFingerprintsIdentical(["fp1", "fp2"], ["fp1", "fp3"])).toBe(
      false,
    );
  });

  test("both empty return true", () => {
    expect(areFingerprintsIdentical([], [])).toBe(true);
  });
});
