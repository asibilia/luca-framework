import { createHash } from "crypto";

import type { ParsedError } from "~/harness/__schemas/harness.schemas";
import type {
  ErrorFingerprint,
  ConvergenceSignals,
  ConvergenceResult,
  ConvergenceStatus,
  ClassifiedError,
} from "../__schemas/iteration.schemas";
import { classifiedErrorSchema } from "../__schemas/iteration.schemas";

/**
 * Create a stable fingerprint for a ParsedError.
 *
 * Normalizes the error message by replacing all digit sequences with "N"
 * to handle line-number and count variations. Combines file, line, code,
 * and normalized message into a SHA-256 hash (first 16 hex chars).
 *
 * @param error - A ParsedError from the harness
 * @returns A 16-character hex fingerprint string
 *
 * @example
 * ```typescript
 * const fp = createFingerprint({
 *   file: "src/foo.ts",
 *   line: 42,
 *   message: "Type 'string' is not assignable to type 'number'",
 *   code: "TS2322",
 *   severity: "error",
 * });
 * // fp: "a1b2c3d4e5f6a7b8"
 * ```
 */
export function createFingerprint(error: ParsedError): ErrorFingerprint {
  const normalizedMessage = error.message.replace(/\d+/g, "N").trim();
  const key = `${error.file}:${error.line ?? 0}:${error.code ?? ""}:${normalizedMessage}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/**
 * Compute the Jaccard similarity between two fingerprint sets.
 *
 * Returns 0.0 if the sets are completely disjoint (all new errors),
 * and 1.0 if the sets are identical (no change).
 * Returns 0.0 if both sets are empty (no errors = no overlap).
 *
 * @param current - Fingerprints from current iteration
 * @param previous - Fingerprints from previous iteration
 * @returns Jaccard similarity coefficient (0.0 to 1.0)
 */
export function computeFingerprintOverlap(
  current: ErrorFingerprint[],
  previous: ErrorFingerprint[],
): number {
  if (current.length === 0 && previous.length === 0) return 0;

  const currentSet = new Set(current);
  const previousSet = new Set(previous);

  let intersectionSize = 0;
  for (const fp of currentSet) {
    if (previousSet.has(fp)) intersectionSize++;
  }

  const unionSize = new Set([...current, ...previous]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Compute the three convergence signals from classified error arrays.
 *
 * Excludes permanent errors from signal computation -- only active
 * (transient + correctable) errors contribute to convergence assessment.
 *
 * @param currentErrors - Classified errors from current iteration
 * @param previousErrors - Classified errors from previous iteration
 * @param artifactDelta - Number of files changed (from git diff --stat)
 * @returns The three convergence signals
 */
export function computeConvergenceSignals(
  currentErrors: ClassifiedError[],
  previousErrors: ClassifiedError[],
  artifactDelta: number,
): ConvergenceSignals {
  const currentActive = currentErrors.filter(
    (e) => e.classification !== "permanent",
  );
  const previousActive = previousErrors.filter(
    (e) => e.classification !== "permanent",
  );

  return {
    error_count_delta: currentActive.length - previousActive.length,
    fingerprint_overlap: computeFingerprintOverlap(
      currentActive.map((e) => e.fingerprint),
      previousActive.map((e) => e.fingerprint),
    ),
    artifact_change_delta: artifactDelta,
  };
}

/**
 * Assess convergence status from signals using the 2-of-3 composite rule.
 *
 * A signal is considered "stale" when:
 * - error_count_delta >= 0 (no improvement or regression)
 * - fingerprint_overlap >= 0.8 (80%+ of errors are the same)
 * - artifact_change_delta === 0 (no files changed)
 *
 * If 2 of 3 signals are stale, the iteration is declared stalled.
 * If error_count_delta > 0 and any other signal is also stale, it is regressed.
 * Otherwise it is improved.
 *
 * @param signals - The three convergence signals
 * @param previousStaleCount - Number of consecutive stale iterations before this one
 * @param staleThreshold - How many consecutive stale before halting (default 2)
 * @returns Full convergence assessment with halt recommendation
 */
export function assessConvergence(
  signals: ConvergenceSignals,
  previousStaleCount: number,
  staleThreshold: number = 2,
): ConvergenceResult {
  const staleSignals = [
    signals.error_count_delta >= 0,
    signals.fingerprint_overlap >= 0.8,
    signals.artifact_change_delta === 0,
  ];
  const staleCount = staleSignals.filter(Boolean).length;

  let status: ConvergenceStatus;
  if (signals.error_count_delta > 0) {
    status = "regressed";
  } else if (staleCount >= 2) {
    status = "stalled";
  } else {
    status = "improved";
  }

  const consecutiveStale =
    status === "stalled" || status === "regressed" ? previousStaleCount + 1 : 0;

  return {
    signals,
    status,
    consecutive_stale: consecutiveStale,
    should_halt: consecutiveStale >= staleThreshold,
  };
}

/**
 * CLI entry point for convergence detection.
 *
 * Usage:
 *   bun run src/iteration/convergence.ts \
 *     --current='[{"fingerprint":"fp1","classification":"correctable",...}]' \
 *     --previous='[{"fingerprint":"fp2","classification":"correctable",...}]' \
 *     --artifact-delta=3 \
 *     --previous-stale-count=0 \
 *     --stale-threshold=2
 *
 * Outputs JSON ConvergenceResult to stdout.
 */
if (import.meta.main) {
  const args = Bun.argv.slice(2);

  function getArg(name: string, defaultValue: string = ""): string {
    const prefix = `--${name}=`;
    const arg = args.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : defaultValue;
  }

  try {
    const currentRaw = getArg("current", "[]");
    const previousRaw = getArg("previous", "[]");
    const artifactDelta = parseInt(getArg("artifact-delta", "0"), 10);
    const previousStaleCount = parseInt(
      getArg("previous-stale-count", "0"),
      10,
    );
    const staleThreshold = parseInt(getArg("stale-threshold", "2"), 10);

    const currentParsed = classifiedErrorSchema
      .array()
      .parse(JSON.parse(currentRaw));
    const previousParsed = classifiedErrorSchema
      .array()
      .parse(JSON.parse(previousRaw));

    const signals = computeConvergenceSignals(
      currentParsed,
      previousParsed,
      artifactDelta,
    );
    const result = assessConvergence(
      signals,
      previousStaleCount,
      staleThreshold,
    );

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.should_halt ? 1 : 0);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}
