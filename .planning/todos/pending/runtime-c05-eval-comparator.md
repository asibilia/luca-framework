---
title: "Runtime C05: Eval comparator"
area: eval
created: 2026-03-24
source: docs/runtime-architecture/research/agent-evaluation.md
depends_on: [C01, C04]
phase: runtime-c
estimated_files: 1
---

## Context

The eval comparator detects regressions and improvements between two eval runs (a baseline and a current run) for the same suite. It computes delta metrics and produces a verdict suitable for CI gating.

## Files to Create

### 1. `src/eval/__helpers/eval-comparator.ts`

```typescript
import type {
  EvalReport,
  EvalResult,
  EvalComparison,
  ComparisonVerdict,
  EvalDeltas,
} from "../__schemas/eval.schemas";
import { EvalComparisonSchema } from "../__schemas/eval.schemas";
import { loadLatestReport } from "./eval-reporter";

/**
 * Compare two eval runs and detect regressions/improvements.
 *
 * A case is considered "regressed" if it passed in the baseline (pass@1 = true)
 * but fails in the current run (pass@1 = false). A case is "improved" if the
 * reverse is true. Cases present in only one run are excluded from comparison.
 *
 * Verdict logic:
 * - "fail": Any case regressed AND avg_score_delta < -significance_threshold
 * - "warn": Any case regressed BUT avg_score_delta >= -significance_threshold
 * - "pass": No cases regressed
 *
 * @param baseline - The baseline eval report to compare against
 * @param current - The current eval report
 * @param significanceThreshold - Minimum score delta to flag as meaningful (default 0.05)
 * @returns EvalComparison with regressions, improvements, deltas, and verdict
 *
 * @example
 * ```typescript
 * const comparison = compareEvalRuns(baselineReport, currentReport, 0.05);
 * if (comparison.verdict === "fail") {
 *   console.error(`${comparison.regressions.length} regressions detected`);
 *   process.exit(2);
 * }
 * ```
 */
export function compareEvalRuns(
  baseline: EvalReport,
  current: EvalReport,
  significanceThreshold?: number,
): EvalComparison { /* implementation */ }

/**
 * Load the latest baseline for a component and compare against a current run.
 *
 * Convenience function that combines loadLatestReport + compareEvalRuns.
 * Returns null if no baseline exists for the component.
 *
 * @param current - The current eval report to compare
 * @param significanceThreshold - Minimum score delta to flag as meaningful (default 0.05)
 * @returns EvalComparison or null if no baseline exists
 *
 * @example
 * ```typescript
 * const comparison = await compareWithLatestBaseline(currentReport);
 * if (comparison === null) {
 *   console.log("No baseline found, saving current as baseline");
 * } else if (comparison.verdict === "fail") {
 *   console.error("Regressions detected!");
 * }
 * ```
 */
export async function compareWithLatestBaseline(
  current: EvalReport,
  significanceThreshold?: number,
): Promise<EvalComparison | null> { /* implementation */ }
```

**`compareEvalRuns` implementation:**

1. **Default threshold**: `significanceThreshold ?? 0.05`

2. **Build per-case pass@1 maps**: For each report, group `results` by `case_id`. For each case, compute pass@1 (at least one trial passed). Result: `Map<string, boolean>` for baseline and current.

3. **Build per-case average score maps**: For each report, group `results` by `case_id`. For each case, compute average score across trials. Result: `Map<string, number>` for baseline and current.

4. **Find common case IDs**: Intersection of baseline and current case ID sets. Cases only in one set are excluded.

5. **Classify cases**:
   - `regressions`: case passed in baseline AND failed in current
   - `improvements`: case failed in baseline AND passed in current
   - `unchanged`: neither regressed nor improved

6. **Compute deltas**:
   ```typescript
   const deltas: EvalDeltas = {
     pass_at_1_delta: current.pass_at_1 - baseline.pass_at_1,
     pass_at_k_delta: current.pass_at_k - baseline.pass_at_k,
     avg_score_delta: current.avg_score - baseline.avg_score,
     cost_delta: current.total_cost_usd - baseline.total_cost_usd,
     latency_delta: current.total_latency_ms - baseline.total_latency_ms,
   };
   ```

7. **Determine verdict**:
   ```typescript
   let verdict: ComparisonVerdict;
   if (regressions.length > 0 && deltas.avg_score_delta < -significanceThreshold) {
     verdict = "fail";
   } else if (regressions.length > 0) {
     verdict = "warn";
   } else {
     verdict = "pass";
   }
   ```

8. **Build result**: Construct `EvalComparison` and validate with `EvalComparisonSchema.safeParse`. Log warning if validation fails.

**`compareWithLatestBaseline` implementation:**

1. Call `loadLatestReport(current.component)`.
2. If null, return null.
3. Call `compareEvalRuns(baseline, current, significanceThreshold)`.

## Update `src/eval/index.ts`

Add to the barrel:

```typescript
// ─── Helpers: Comparator ─────────────────────────────────────────────────
export {
  compareEvalRuns,
  compareWithLatestBaseline,
} from "./__helpers/eval-comparator";
```

## Verification

```bash
bunx --bun tsc --noEmit
```

## Notes

- The comparator is purely computational -- no LLM calls, no file I/O except loading the baseline report.
- The significance threshold prevents noisy "warn" verdicts from minor score fluctuations. At 0.05 (5%), a single case regressing among 25 cases would typically produce a ~4% score drop, which falls under the threshold and produces "warn" not "fail".
- Cases that appear in only one run (added or removed cases) are silently excluded from comparison. This is intentional: if the eval suite evolves between runs, we only compare overlapping cases.
