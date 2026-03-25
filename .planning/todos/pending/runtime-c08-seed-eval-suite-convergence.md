---
title: "Runtime C08: Seed eval suite for convergence detector"
area: eval
created: 2026-03-24
source: docs/runtime-architecture/research/agent-evaluation.md
depends_on: [C01]
phase: runtime-c
estimated_files: 1
---

## Context

Create 25 eval cases for convergence/stall detection. The convergence detector (implemented in `src/iteration/__helpers/convergence.ts` and `src/iteration/__helpers/stall-detector.ts`) determines whether a verification loop is making progress, stalled, or regressed.

**Convergence detector input contract** (from `src/iteration/__schemas/iteration.schemas.ts`):

- Input: `ConvergenceSignals` object with `error_count_delta`, `fingerprint_overlap`, `artifact_change_delta`, and optionally `semantic_overlap`
- Plus: `previousStaleCount` (number), `staleThreshold` (number, default 2)
- Output: `ConvergenceResult` with `status` (`improved | stalled | regressed`), `consecutive_stale`, `should_halt`

For eval, the input is a record with:

- `signals`: ConvergenceSignals object
- `previous_stale_count`: number
- `stale_threshold`: number

The expected output is:

- `status`: `"improved" | "stalled" | "regressed"`
- `should_halt`: boolean

All cases use `code` grading since convergence detection is deterministic.

## Files to Create

### 1. `src/eval/suites/convergence.eval.ts`

```typescript
import type { EvalSuite } from "../__schemas/eval.schemas";

/**
 * Seed eval suite for convergence/stall detection.
 *
 * Tests whether the convergence detector correctly classifies iteration
 * states into improved/stalled/regressed and recommends halt when appropriate.
 *
 * 25 cases total:
 * - 5 healthy convergence (errors decreasing, should be "improved")
 * - 5 clear stalls (same errors repeating, "stalled")
 * - 5 oscillating stalls (errors fix and re-break, "stalled" or "regressed")
 * - 5 slow-but-real progress (should NOT flag as stalled)
 * - 5 budget exhaustion / threshold edge cases
 */
export const convergenceEvalSuite: EvalSuite = {
  id: "convergence-stall-detection",
  component: "convergence-detector",
  description: "Stall detection accuracy for convergence detector",
  config: {
    judge_model: "claude-haiku-4-5-20250514",
    timeout_ms: 10_000,
    sampling_rate: 1.0,
    use_batch_api: false,
  },
  cases: [
    // ─── HEALTHY CONVERGENCE (5 cases) ──────────────────────────────────
    // Errors decreasing, files changing, fingerprints shifting -> "improved"

    {
      id: "conv-healthy-001",
      component: "convergence-detector",
      description:
        "Strong improvement: error count drops significantly, new fingerprints",
      input: {
        signals: {
          error_count_delta: -5,
          fingerprint_overlap: 0.3,
          artifact_change_delta: 4,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["smoke", "healthy"],
      trials: 1,
    },

    {
      id: "conv-healthy-002",
      component: "convergence-detector",
      description:
        "Moderate improvement: error count drops by 1, files changed",
      input: {
        signals: {
          error_count_delta: -1,
          fingerprint_overlap: 0.6,
          artifact_change_delta: 2,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["healthy"],
      trials: 1,
    },

    {
      id: "conv-healthy-003",
      component: "convergence-detector",
      description: "Improvement after previous stall: resets stale count",
      input: {
        signals: {
          error_count_delta: -3,
          fingerprint_overlap: 0.2,
          artifact_change_delta: 5,
        },
        previous_stale_count: 1,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["healthy"],
      trials: 1,
    },

    {
      id: "conv-healthy-004",
      component: "convergence-detector",
      description:
        "All errors resolved: delta negative, zero overlap, files changed",
      input: {
        signals: {
          error_count_delta: -8,
          fingerprint_overlap: 0.0,
          artifact_change_delta: 3,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["healthy"],
      trials: 1,
    },

    {
      id: "conv-healthy-005",
      component: "convergence-detector",
      description: "Improvement with semantic overlap included (4-signal mode)",
      input: {
        signals: {
          error_count_delta: -2,
          fingerprint_overlap: 0.4,
          artifact_change_delta: 3,
          semantic_overlap: 0.3,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["healthy"],
      trials: 1,
    },

    // ─── CLEAR STALLS (5 cases) ─────────────────────────────────────────
    // Same errors, no file changes, no improvement -> "stalled"

    {
      id: "conv-stall-001",
      component: "convergence-detector",
      description:
        "Classic stall: same errors, no changes, no improvement (first stale)",
      input: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.95,
          artifact_change_delta: 0,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "stalled", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "stalled",
        output_path: "status",
      },
      tags: ["smoke", "stall"],
      trials: 1,
    },

    {
      id: "conv-stall-002",
      component: "convergence-detector",
      description: "Stall at threshold: second consecutive stale triggers halt",
      input: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.9,
          artifact_change_delta: 0,
        },
        previous_stale_count: 1,
        stale_threshold: 2,
      },
      expected: { status: "stalled", should_halt: true },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: true,
        output_path: "should_halt",
      },
      tags: ["stall"],
      trials: 1,
    },

    {
      id: "conv-stall-003",
      component: "convergence-detector",
      description:
        "Stall with higher threshold: 2 stale but threshold is 3 -> no halt",
      input: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.85,
          artifact_change_delta: 0,
        },
        previous_stale_count: 1,
        stale_threshold: 3,
      },
      expected: { status: "stalled", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: false,
        output_path: "should_halt",
      },
      tags: ["stall"],
      trials: 1,
    },

    {
      id: "conv-stall-004",
      component: "convergence-detector",
      description:
        "Stall with identical fingerprints but error count increased slightly",
      input: {
        signals: {
          error_count_delta: 1,
          fingerprint_overlap: 1.0,
          artifact_change_delta: 0,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "regressed", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "regressed",
        output_path: "status",
      },
      tags: ["stall"],
      trials: 1,
    },

    {
      id: "conv-stall-005",
      component: "convergence-detector",
      description:
        "Stall with semantic overlap signal (4-signal mode, all stale)",
      input: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.9,
          artifact_change_delta: 0,
          semantic_overlap: 0.95,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "stalled", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "stalled",
        output_path: "status",
      },
      tags: ["stall"],
      trials: 1,
    },

    // ─── OSCILLATING STALLS (5 cases) ────────────────────────────────────
    // Errors fix and re-break cyclically

    {
      id: "conv-oscillate-001",
      component: "convergence-detector",
      description: "Oscillation: errors increased (regression), overlap high",
      input: {
        signals: {
          error_count_delta: 3,
          fingerprint_overlap: 0.7,
          artifact_change_delta: 2,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "regressed", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "regressed",
        output_path: "status",
      },
      tags: ["oscillate"],
      trials: 1,
    },

    {
      id: "conv-oscillate-002",
      component: "convergence-detector",
      description: "Oscillation regression at threshold: triggers halt",
      input: {
        signals: {
          error_count_delta: 2,
          fingerprint_overlap: 0.85,
          artifact_change_delta: 1,
        },
        previous_stale_count: 1,
        stale_threshold: 2,
      },
      expected: { status: "regressed", should_halt: true },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: true,
        output_path: "should_halt",
      },
      tags: ["oscillate"],
      trials: 1,
    },

    {
      id: "conv-oscillate-003",
      component: "convergence-detector",
      description:
        "Oscillation: error count same but different errors (low overlap)",
      input: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.3,
          artifact_change_delta: 3,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["oscillate"],
      trials: 1,
    },

    {
      id: "conv-oscillate-004",
      component: "convergence-detector",
      description:
        "Oscillation: large error increase with some new fingerprints",
      input: {
        signals: {
          error_count_delta: 5,
          fingerprint_overlap: 0.5,
          artifact_change_delta: 4,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "regressed", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "regressed",
        output_path: "status",
      },
      tags: ["oscillate"],
      trials: 1,
    },

    {
      id: "conv-oscillate-005",
      component: "convergence-detector",
      description:
        "Oscillation with semantic divergence: errors reworded but same meaning",
      input: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.4,
          artifact_change_delta: 2,
          semantic_overlap: 0.92,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "stalled", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "stalled",
        output_path: "status",
      },
      tags: ["oscillate"],
      trials: 1,
    },

    // ─── SLOW BUT REAL PROGRESS (5 cases) ────────────────────────────────
    // Should NOT be flagged as stalled

    {
      id: "conv-slow-001",
      component: "convergence-detector",
      description:
        "Slow progress: error count decreased by 1, high overlap but files changed",
      input: {
        signals: {
          error_count_delta: -1,
          fingerprint_overlap: 0.85,
          artifact_change_delta: 1,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["slow-progress"],
      trials: 1,
    },

    {
      id: "conv-slow-002",
      component: "convergence-detector",
      description:
        "Slow progress: error count same but new fingerprints (different errors)",
      input: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.5,
          artifact_change_delta: 2,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["slow-progress"],
      trials: 1,
    },

    {
      id: "conv-slow-003",
      component: "convergence-detector",
      description:
        "Slow progress: error count same, overlap borderline (0.79 < 0.8 threshold)",
      input: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.79,
          artifact_change_delta: 1,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["slow-progress"],
      trials: 1,
    },

    {
      id: "conv-slow-004",
      component: "convergence-detector",
      description: "Slow progress: minimal decrease with some artifact changes",
      input: {
        signals: {
          error_count_delta: -1,
          fingerprint_overlap: 0.9,
          artifact_change_delta: 1,
        },
        previous_stale_count: 1,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["slow-progress"],
      trials: 1,
    },

    {
      id: "conv-slow-005",
      component: "convergence-detector",
      description:
        "Slow progress with semantic: low semantic overlap despite high fingerprint overlap",
      input: {
        signals: {
          error_count_delta: -1,
          fingerprint_overlap: 0.82,
          artifact_change_delta: 1,
          semantic_overlap: 0.5,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["slow-progress"],
      trials: 1,
    },

    // ─── BUDGET/THRESHOLD EDGE CASES (5 cases) ──────────────────────────

    {
      id: "conv-edge-001",
      component: "convergence-detector",
      description:
        "Edge: exactly at fingerprint threshold (0.8) - should be stale signal",
      input: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.8,
          artifact_change_delta: 0,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "stalled", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "stalled",
        output_path: "status",
      },
      tags: ["edge-case"],
      trials: 1,
    },

    {
      id: "conv-edge-002",
      component: "convergence-detector",
      description: "Edge: zero errors in both iterations (both sets empty)",
      input: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.0,
          artifact_change_delta: 0,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "stalled", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "stalled",
        output_path: "status",
      },
      tags: ["edge-case"],
      trials: 1,
    },

    {
      id: "conv-edge-003",
      component: "convergence-detector",
      description: "Edge: stale threshold of 1 - first stall immediately halts",
      input: {
        signals: {
          error_count_delta: 0,
          fingerprint_overlap: 0.9,
          artifact_change_delta: 0,
        },
        previous_stale_count: 0,
        stale_threshold: 1,
      },
      expected: { status: "stalled", should_halt: true },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: true,
        output_path: "should_halt",
      },
      tags: ["edge-case"],
      trials: 1,
    },

    {
      id: "conv-edge-004",
      component: "convergence-detector",
      description:
        "Edge: semantic exactly at threshold (0.9) - counts as stale",
      input: {
        signals: {
          error_count_delta: -1,
          fingerprint_overlap: 0.5,
          artifact_change_delta: 1,
          semantic_overlap: 0.9,
        },
        previous_stale_count: 0,
        stale_threshold: 2,
      },
      expected: { status: "improved", should_halt: false },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "improved",
        output_path: "status",
      },
      tags: ["edge-case"],
      trials: 1,
    },

    {
      id: "conv-edge-005",
      component: "convergence-detector",
      description: "Edge: regression always increments stale count",
      input: {
        signals: {
          error_count_delta: 1,
          fingerprint_overlap: 0.3,
          artifact_change_delta: 5,
        },
        previous_stale_count: 1,
        stale_threshold: 2,
      },
      expected: { status: "regressed", should_halt: true },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: true,
        output_path: "should_halt",
      },
      tags: ["edge-case"],
      trials: 1,
    },
  ],
};
```

## Update `src/eval/index.ts`

Add to the barrel:

```typescript
export { convergenceEvalSuite } from "./suites/convergence.eval";
```

## Verification

```bash
bunx --bun tsc --noEmit
```

## Notes

- All cases use `trials: 1` because convergence detection is fully deterministic -- no LLM involved, so multiple trials add no information.
- The convergence signals map directly to `ConvergenceSignals` from `src/iteration/__schemas/iteration.schemas.ts`.
- The `assessConvergence` function in `src/iteration/__helpers/convergence.ts` implements the 2-of-3 (or 2-of-4 with semantic) stale rule. These eval cases validate that logic.
- Edge case `conv-edge-002` tests the zero-errors scenario where `computeFingerprintOverlap` returns 0 (both sets empty). The stale signals for this case are: `error_count_delta >= 0` (true), `fingerprint_overlap >= 0.8` (false, 0.0), `artifact_change_delta === 0` (true). That is 2-of-3 stale signals, so status is "stalled".
