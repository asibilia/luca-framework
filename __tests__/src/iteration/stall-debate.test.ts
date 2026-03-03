import { describe, test, expect } from "bun:test";
import {
  shouldAttemptDebate,
  evaluateStallDebate,
} from "../../../src/iteration/__helpers/stall-debate";
import type { ConvergenceResult } from "../../../src/iteration/__schemas/iteration.schemas";
import type { StallDebateInput } from "../../../src/iteration/__schemas/stall-debate.schemas";
import { stallDebateOutputSchema } from "../../../src/iteration/__schemas/stall-debate.schemas";

function makeConvergenceResult(
  overrides: Partial<ConvergenceResult> = {},
): ConvergenceResult {
  return {
    signals: {
      error_count_delta: 0,
      fingerprint_overlap: 0.95,
      artifact_change_delta: 0,
    },
    status: "stalled",
    consecutive_stale: 2,
    should_halt: true,
    ...overrides,
  };
}

function makeDebateInput(
  overrides: Partial<StallDebateInput> = {},
): StallDebateInput {
  return {
    convergence_result: makeConvergenceResult(),
    current_errors: [
      {
        fingerprint: "fp1",
        source: "test",
        classification: "correctable",
        iterations_seen: 3,
        message: "Type error in foo.ts",
      },
      {
        fingerprint: "fp2",
        source: "test",
        classification: "correctable",
        iterations_seen: 2,
        message: "Missing import in bar.ts",
      },
    ],
    budget_remaining: 1,
    loop_type: "harness",
    iteration_history: [
      {
        iteration: 1,
        error_count: 3,
        convergence_status: "improved",
        stale_count: 0,
      },
      {
        iteration: 2,
        error_count: 3,
        convergence_status: "stalled",
        stale_count: 1,
      },
      {
        iteration: 3,
        error_count: 3,
        convergence_status: "stalled",
        stale_count: 2,
      },
    ],
    context_tier: "T1",
    ...overrides,
  };
}

describe("shouldAttemptDebate", () => {
  test("returns true when should_halt and budget >= 1", () => {
    const result = makeConvergenceResult({ should_halt: true });
    expect(shouldAttemptDebate(result, 1)).toBe(true);
  });

  test("returns false when should_halt is false", () => {
    const result = makeConvergenceResult({ should_halt: false });
    expect(shouldAttemptDebate(result, 2)).toBe(false);
  });

  test("returns false when budget is 0", () => {
    const result = makeConvergenceResult({ should_halt: true });
    expect(shouldAttemptDebate(result, 0)).toBe(false);
  });

  test("returns true when budget is exactly 1", () => {
    const result = makeConvergenceResult({ should_halt: true });
    expect(shouldAttemptDebate(result, 1)).toBe(true);
  });
});

describe("evaluateStallDebate", () => {
  test("all outputs conform to schema", () => {
    const input = makeDebateInput();
    const output = evaluateStallDebate(input);
    const parsed = stallDebateOutputSchema.safeParse(output);
    expect(parsed.success).toBe(true);
  });

  test("Rule 1: budget_remaining <= 0 returns halt with confidence 1.0", () => {
    const input = makeDebateInput({ budget_remaining: 0 });
    const output = evaluateStallDebate(input);

    expect(output.recommended_strategy).toBe("halt");
    expect(output.confidence).toBe(1.0);
  });

  test("Rule 2: high fingerprint overlap + promotable tier returns context promotion", () => {
    const input = makeDebateInput({
      convergence_result: makeConvergenceResult({
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.95,
          artifact_change_delta: 0,
        },
      }),
      context_tier: "T1",
      budget_remaining: 2,
    });
    const output = evaluateStallDebate(input);

    expect(output.recommended_strategy).toBe("retry_with_context_promotion");
    expect(output.confidence).toBe(0.7);
    expect(output.strategy_params).toEqual({
      current_tier: "T1",
      target_tier: "T2",
    });
  });

  test("Rule 2: max tier (T3) does not trigger context promotion", () => {
    const input = makeDebateInput({
      convergence_result: makeConvergenceResult({
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.95,
          artifact_change_delta: 0,
        },
      }),
      context_tier: "T3",
      budget_remaining: 2,
      // Override errors to have >60% correctable for Rule 3 to kick in
      current_errors: [
        {
          fingerprint: "fp1",
          source: "test",
          classification: "correctable",
          iterations_seen: 3,
          message: "Error 1",
        },
      ],
    });
    const output = evaluateStallDebate(input);

    // Should NOT be context promotion since already at T3
    expect(output.recommended_strategy).not.toBe(
      "retry_with_context_promotion",
    );
  });

  test("Rule 3: majority correctable errors returns error focus", () => {
    const input = makeDebateInput({
      convergence_result: makeConvergenceResult({
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.5, // Low overlap to skip Rule 2
          artifact_change_delta: 0,
        },
      }),
      current_errors: [
        {
          fingerprint: "fp1",
          source: "test",
          classification: "correctable",
          iterations_seen: 2,
          message: "Type error",
          code: "TS2322",
        },
        {
          fingerprint: "fp2",
          source: "test",
          classification: "correctable",
          iterations_seen: 1,
          message: "Missing import",
          code: "TS2307",
        },
        {
          fingerprint: "fp3",
          source: "test",
          classification: "transient",
          iterations_seen: 1,
          message: "Build timeout",
        },
      ],
      context_tier: "T3", // Max tier to skip Rule 2
      budget_remaining: 2,
    });
    const output = evaluateStallDebate(input);

    expect(output.recommended_strategy).toBe("retry_with_error_focus");
    expect(output.confidence).toBe(0.6);
  });

  test("Rule 4: artifact changes but errors unchanged returns rollback", () => {
    const input = makeDebateInput({
      convergence_result: makeConvergenceResult({
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.5, // Low overlap to skip Rule 2
          artifact_change_delta: 5,
        },
      }),
      current_errors: [
        {
          fingerprint: "fp1",
          source: "test",
          classification: "permanent",
          iterations_seen: 5,
          message: "Permanent error",
        },
        {
          fingerprint: "fp2",
          source: "test",
          classification: "transient",
          iterations_seen: 1,
          message: "Transient error",
        },
      ],
      context_tier: "T3", // Max tier to skip Rule 2
      budget_remaining: 2,
    });
    const output = evaluateStallDebate(input);

    expect(output.recommended_strategy).toBe("retry_with_rollback");
    expect(output.confidence).toBe(0.5);
  });

  test("default: no heuristic matches returns halt with low confidence", () => {
    const input = makeDebateInput({
      convergence_result: makeConvergenceResult({
        signals: {
          error_count_delta: -1, // Negative to avoid Rule 4
          fingerprint_overlap: 0.5, // Low to skip Rule 2
          artifact_change_delta: 0,
        },
      }),
      current_errors: [
        {
          fingerprint: "fp1",
          source: "test",
          classification: "permanent",
          iterations_seen: 5,
          message: "Permanent error",
        },
      ],
      context_tier: "T3",
      budget_remaining: 2,
    });
    const output = evaluateStallDebate(input);

    expect(output.recommended_strategy).toBe("halt");
    expect(output.confidence).toBe(0.3);
  });

  test("rule priority: Rule 1 (budget) takes precedence over Rule 2 (promotion)", () => {
    const input = makeDebateInput({
      convergence_result: makeConvergenceResult({
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.95,
          artifact_change_delta: 0,
        },
      }),
      context_tier: "T1",
      budget_remaining: 0, // No budget
    });
    const output = evaluateStallDebate(input);

    // Budget exhaustion should win
    expect(output.recommended_strategy).toBe("halt");
    expect(output.confidence).toBe(1.0);
  });
});

describe("assessConvergence with debate", () => {
  const {
    assessConvergence,
  } = require("../../../src/iteration/__helpers/convergence");

  test("without debate options: existing behavior unchanged", () => {
    const result = assessConvergence(
      {
        error_count_delta: 0,
        fingerprint_overlap: 0.9,
        artifact_change_delta: 0,
      },
      1, // previous stale = 1, so consecutive_stale = 2 >= threshold
      2,
    );
    expect(result.should_halt).toBe(true);
    expect(result.debate_result).toBeUndefined();
  });

  test("with debate disabled: no debate result", () => {
    const result = assessConvergence(
      {
        error_count_delta: 0,
        fingerprint_overlap: 0.9,
        artifact_change_delta: 0,
      },
      1,
      2,
      { debate_enabled: false },
    );
    expect(result.should_halt).toBe(true);
    expect(result.debate_result).toBeUndefined();
  });

  test("with debate enabled and stall detected: debate result attached", () => {
    const debateInput: StallDebateInput = {
      convergence_result: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.95,
          artifact_change_delta: 0,
        },
        status: "stalled",
        consecutive_stale: 2,
        should_halt: true,
      },
      current_errors: [
        {
          fingerprint: "fp1",
          source: "test",
          classification: "correctable",
          iterations_seen: 2,
          message: "Error",
        },
      ],
      budget_remaining: 2,
      loop_type: "harness",
      iteration_history: [],
      context_tier: "T1",
    };

    const result = assessConvergence(
      {
        error_count_delta: 0,
        fingerprint_overlap: 0.95,
        artifact_change_delta: 0,
      },
      1,
      2,
      { debate_enabled: true, debate_input: debateInput },
    );

    // Debate should recommend context promotion (T1 → T2)
    expect(result.debate_result).toBeDefined();
    expect(result.debate_result!.recommended_strategy).toBe(
      "retry_with_context_promotion",
    );
    // should_halt overridden to false by debate
    expect(result.should_halt).toBe(false);
  });

  test("debate halt recommendation does not override should_halt", () => {
    const debateInput: StallDebateInput = {
      convergence_result: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.5,
          artifact_change_delta: 0,
        },
        status: "stalled",
        consecutive_stale: 2,
        should_halt: true,
      },
      current_errors: [
        {
          fingerprint: "fp1",
          source: "test",
          classification: "permanent",
          iterations_seen: 5,
          message: "Permanent",
        },
      ],
      budget_remaining: 0, // No budget → Rule 1 → halt
      loop_type: "harness",
      iteration_history: [],
      context_tier: "T3",
    };

    const result = assessConvergence(
      {
        error_count_delta: 0,
        fingerprint_overlap: 0.5,
        artifact_change_delta: 0,
      },
      1,
      2,
      { debate_enabled: true, debate_input: debateInput },
    );

    // Budget 0 → shouldAttemptDebate returns false → no debate
    expect(result.should_halt).toBe(true);
  });
});
