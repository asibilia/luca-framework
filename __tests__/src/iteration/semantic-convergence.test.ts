import { describe, test, expect } from "bun:test";
import {
  computeSemanticOverlap,
  computeConvergenceSignals,
  assessConvergence,
} from "../../../src/iteration/__helpers/convergence";
import type { ClassifiedError } from "../../../src/iteration/__schemas/iteration.schemas";

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeError(overrides: Partial<ClassifiedError> = {}): ClassifiedError {
  return {
    fingerprint: "abc123",
    source: "test",
    classification: "correctable",
    iterations_seen: 1,
    message: "Type 'string' is not assignable to type 'number'",
    ...overrides,
  };
}

// ─── R11.1: computeSemanticOverlap ──────────────────────────────────────────

describe("computeSemanticOverlap", () => {
  test("returns 1.0 for identical error messages", () => {
    const messages = [
      "Type 'string' is not assignable to type 'number'",
      "Property 'foo' does not exist on type 'Bar'",
    ];

    const overlap = computeSemanticOverlap(messages, messages);
    expect(overlap).toBeCloseTo(1.0, 5);
  });

  test("returns 0.0 for completely different messages", () => {
    const current = ["Cannot find module react"];
    const previous = ["Syntax error unexpected token"];

    const overlap = computeSemanticOverlap(current, previous);
    // Should be very low but may not be exactly 0 due to common short words
    expect(overlap).toBeLessThan(0.3);
  });

  test("returns 0.0 when current is empty", () => {
    const overlap = computeSemanticOverlap([], ["Some error message"]);
    expect(overlap).toBe(0);
  });

  test("returns 0.0 when previous is empty", () => {
    const overlap = computeSemanticOverlap(["Some error message"], []);
    expect(overlap).toBe(0);
  });

  test("returns 0.0 when both are empty", () => {
    const overlap = computeSemanticOverlap([], []);
    expect(overlap).toBe(0);
  });

  test("detects high overlap for rewording of same error", () => {
    const current = [
      "Type 'string' is not assignable to type 'number' at line 42",
    ];
    const previous = [
      "Type 'string' is not assignable to type 'number' at line 99",
    ];

    // Same words except for the line numbers (which get tokenized differently)
    const overlap = computeSemanticOverlap(current, previous);
    expect(overlap).toBeGreaterThan(0.8);
  });

  test("detects moderate overlap for partially similar errors", () => {
    const current = [
      "Type 'string' is not assignable to type 'number'",
      "Cannot find module 'react'",
    ];
    const previous = [
      "Type 'boolean' is not assignable to type 'number'",
      "Module not found: 'lodash'",
    ];

    const overlap = computeSemanticOverlap(current, previous);
    // Shared terms: type, not, assignable, number, module
    expect(overlap).toBeGreaterThan(0.3);
    expect(overlap).toBeLessThan(1.0);
  });
});

// ─── R11.2: computeConvergenceSignals with semantic ─────────────────────────

describe("computeConvergenceSignals with semantic", () => {
  test("includes semantic_overlap when enableSemantic is true", () => {
    const current = [
      makeError({ message: "Type error at line 10", fingerprint: "fp1" }),
    ];
    const previous = [
      makeError({ message: "Type error at line 20", fingerprint: "fp2" }),
    ];

    const signals = computeConvergenceSignals(current, previous, 0, true);

    expect(signals.semantic_overlap).toBeDefined();
    expect(signals.semantic_overlap).toBeGreaterThan(0);
    expect(signals.semantic_overlap).toBeLessThanOrEqual(1.0);
  });

  test("omits semantic_overlap when enableSemantic is false (default)", () => {
    const current = [makeError({ fingerprint: "fp1" })];
    const previous = [makeError({ fingerprint: "fp2" })];

    const signals = computeConvergenceSignals(current, previous, 0);

    expect(signals.semantic_overlap).toBeUndefined();
  });

  test("semantic_overlap is 1.0 for identical error messages", () => {
    const errors = [
      makeError({
        message: "Cannot find module 'react'",
        fingerprint: "fp1",
      }),
    ];

    const signals = computeConvergenceSignals(errors, errors, 0, true);

    expect(signals.semantic_overlap).toBeCloseTo(1.0, 5);
  });

  test("excludes permanent errors from semantic computation", () => {
    const current = [
      makeError({
        message: "Permanent issue",
        fingerprint: "perm1",
        classification: "permanent",
      }),
      makeError({
        message: "Correctable issue",
        fingerprint: "fp1",
        classification: "correctable",
      }),
    ];
    const previous = [
      makeError({
        message: "Different permanent issue",
        fingerprint: "perm2",
        classification: "permanent",
      }),
      makeError({
        message: "Correctable issue",
        fingerprint: "fp2",
        classification: "correctable",
      }),
    ];

    const signals = computeConvergenceSignals(current, previous, 0, true);

    // Only "Correctable issue" messages compared — identical
    expect(signals.semantic_overlap).toBeCloseTo(1.0, 5);
  });
});

// ─── R11.3: assessConvergence with 4-signal detection ───────────────────────

describe("assessConvergence with semantic_overlap", () => {
  test("4th signal contributes to stale detection", () => {
    // error_count_delta=0 (stale), fingerprint_overlap=0.5 (not stale),
    // artifact_change_delta=5 (not stale), semantic_overlap=0.95 (stale)
    // 2-of-4 stale → stalled
    const signals = {
      error_count_delta: 0,
      fingerprint_overlap: 0.5,
      artifact_change_delta: 5,
      semantic_overlap: 0.95,
    };

    const result = assessConvergence(signals, 0);
    expect(result.status).toBe("stalled");
  });

  test("without semantic, same 3 base signals may not be stalled", () => {
    // Same base signals without semantic_overlap
    // error_count_delta=0 (stale), fingerprint_overlap=0.5 (not stale),
    // artifact_change_delta=5 (not stale)
    // 1-of-3 stale → improved
    const signals = {
      error_count_delta: 0,
      fingerprint_overlap: 0.5,
      artifact_change_delta: 5,
    };

    const result = assessConvergence(signals, 0);
    expect(result.status).toBe("improved");
  });

  test("semantic_overlap below threshold is not stale", () => {
    // error_count_delta=0 (stale), fingerprint_overlap=0.5 (not stale),
    // artifact_change_delta=5 (not stale), semantic_overlap=0.5 (not stale)
    // 1-of-4 stale → improved
    const signals = {
      error_count_delta: 0,
      fingerprint_overlap: 0.5,
      artifact_change_delta: 5,
      semantic_overlap: 0.5,
    };

    const result = assessConvergence(signals, 0);
    expect(result.status).toBe("improved");
  });

  test("regression still detected with semantic signal present", () => {
    const signals = {
      error_count_delta: 3,
      fingerprint_overlap: 0.5,
      artifact_change_delta: 2,
      semantic_overlap: 0.95,
    };

    const result = assessConvergence(signals, 0);
    expect(result.status).toBe("regressed");
  });

  test("halt recommended after consecutive stale with semantic", () => {
    const signals = {
      error_count_delta: 0,
      fingerprint_overlap: 0.9,
      artifact_change_delta: 0,
      semantic_overlap: 0.95,
    };

    // previousStaleCount=1, threshold=2 → consecutive_stale=2 → halt
    const result = assessConvergence(signals, 1, 2);
    expect(result.should_halt).toBe(true);
    expect(result.consecutive_stale).toBe(2);
  });
});

// ─── R11.4: Schema validates with and without semantic_overlap ──────────────

describe("convergenceSignalsSchema", () => {
  test("validates without semantic_overlap (backward compat)", () => {
    const {
      convergenceSignalsSchema,
    } = require("../../../src/iteration/__schemas/iteration.schemas");
    const result = convergenceSignalsSchema.safeParse({
      error_count_delta: -1,
      fingerprint_overlap: 0.5,
      artifact_change_delta: 3,
    });

    expect(result.success).toBe(true);
  });

  test("validates with semantic_overlap present", () => {
    const {
      convergenceSignalsSchema,
    } = require("../../../src/iteration/__schemas/iteration.schemas");
    const result = convergenceSignalsSchema.safeParse({
      error_count_delta: 0,
      fingerprint_overlap: 0.8,
      artifact_change_delta: 0,
      semantic_overlap: 0.92,
    });

    expect(result.success).toBe(true);
    expect(result.data.semantic_overlap).toBe(0.92);
  });

  test("rejects semantic_overlap outside 0-1 range", () => {
    const {
      convergenceSignalsSchema,
    } = require("../../../src/iteration/__schemas/iteration.schemas");
    const result = convergenceSignalsSchema.safeParse({
      error_count_delta: 0,
      fingerprint_overlap: 0.5,
      artifact_change_delta: 0,
      semantic_overlap: 1.5,
    });

    expect(result.success).toBe(false);
  });
});
