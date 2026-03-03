import { createHash } from "node:crypto";

import filter from "lodash/filter";

import type { ParsedError } from "~/harness/__schemas/harness.schemas";
import { getArg, hasFlag } from "~/shared/__helpers/cli-utils";
import type {
  ErrorFingerprint,
  ConvergenceSignals,
  ConvergenceResult,
  ConvergenceStatus,
  ClassifiedError,
} from "../__schemas/iteration.schemas";
import { classifiedErrorSchema } from "../__schemas/iteration.schemas";
import type { StallDebateInput } from "../__schemas/stall-debate.schemas";
import {
  shouldAttemptDebate as shouldDebateGate,
  evaluateStallDebate,
} from "./stall-debate";

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
 * Tokenize an array of error messages into a term frequency map.
 *
 * Normalizes text to lowercase, strips non-alphanumeric characters,
 * and filters single-character tokens. Returns a Map of term → count.
 *
 * @param messages - Array of error message strings
 * @returns Map of term to frequency count
 */
function tokenize(messages: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const msg of messages) {
    const terms = msg
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    for (const term of terms) {
      freq.set(term, (freq.get(term) ?? 0) + 1);
    }
  }
  return freq;
}

/**
 * Compute semantic overlap between two sets of error messages
 * using cosine similarity of term frequency vectors.
 *
 * Returns 0.0 if either set is empty or the messages are completely
 * different. Returns 1.0 if the messages are identical in content.
 *
 * @param currentMessages - Error messages from current iteration
 * @param previousMessages - Error messages from previous iteration
 * @returns Cosine similarity coefficient (0.0 to 1.0)
 */
export function computeSemanticOverlap(
  currentMessages: string[],
  previousMessages: string[],
): number {
  if (currentMessages.length === 0 || previousMessages.length === 0) return 0;

  const currentTf = tokenize(currentMessages);
  const previousTf = tokenize(previousMessages);

  // Build vocabulary from both sets
  const vocab = new Set([...currentTf.keys(), ...previousTf.keys()]);
  if (vocab.size === 0) return 0;

  // Cosine similarity of TF vectors
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term of vocab) {
    const a = currentTf.get(term) ?? 0;
    const b = previousTf.get(term) ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Compute convergence signals from classified error arrays.
 *
 * Excludes permanent errors from signal computation -- only active
 * (transient + correctable) errors contribute to convergence assessment.
 *
 * Returns 3 signals by default. When `enableSemantic` is true (or the
 * `--semantic` CLI flag is set), also computes and includes the optional
 * `semantic_overlap` signal.
 *
 * @param currentErrors - Classified errors from current iteration
 * @param previousErrors - Classified errors from previous iteration
 * @param artifactDelta - Number of files changed (from git diff --stat)
 * @param enableSemantic - Whether to compute the optional semantic_overlap signal
 * @returns Convergence signals (3 or 4 depending on enableSemantic)
 */
export function computeConvergenceSignals(
  currentErrors: ClassifiedError[],
  previousErrors: ClassifiedError[],
  artifactDelta: number,
  enableSemantic: boolean = false,
): ConvergenceSignals {
  const currentActive = filter(
    currentErrors,
    (e) => e.classification !== "permanent",
  );
  const previousActive = filter(
    previousErrors,
    (e) => e.classification !== "permanent",
  );

  const signals: ConvergenceSignals = {
    error_count_delta: currentActive.length - previousActive.length,
    fingerprint_overlap: computeFingerprintOverlap(
      currentActive.map((e) => e.fingerprint),
      previousActive.map((e) => e.fingerprint),
    ),
    artifact_change_delta: artifactDelta,
  };

  if (enableSemantic) {
    signals.semantic_overlap = computeSemanticOverlap(
      currentActive.map((e) => e.message),
      previousActive.map((e) => e.message),
    );
  }

  return signals;
}

/**
 * Options for debate-aware convergence assessment.
 */
export interface ConvergenceDebateOptions {
  /** Whether stall debate is enabled */
  debate_enabled: boolean;
  /** Stall debate input data (required when debate_enabled is true) */
  debate_input?: StallDebateInput;
}

/**
 * Assess convergence status from signals using the composite stale rule.
 *
 * A signal is considered "stale" when:
 * - error_count_delta >= 0 (no improvement or regression)
 * - fingerprint_overlap >= 0.8 (80%+ of errors are the same)
 * - artifact_change_delta === 0 (no files changed)
 * - semantic_overlap >= 0.9 (90%+ of error content is equivalent) — when present
 *
 * With 3 signals (no semantic_overlap): 2-of-3 stale → stalled.
 * With 4 signals (semantic_overlap present): 2-of-4 stale → stalled.
 * The 4th signal provides additional stale detection for rewording errors.
 *
 * If error_count_delta > 0, the status is always "regressed".
 * Otherwise, if stale threshold met, "stalled". Else "improved".
 *
 * When `debateOptions.debate_enabled` is true and a stall is detected,
 * the stall debate evaluator runs. If it recommends a non-halt strategy,
 * `should_halt` is overridden to false and the debate result is attached.
 *
 * @param signals - Convergence signals (3 or 4)
 * @param previousStaleCount - Number of consecutive stale iterations before this one
 * @param staleThreshold - How many consecutive stale before halting (default 2)
 * @param debateOptions - Optional debate configuration (default: debate disabled)
 * @returns Full convergence assessment with halt recommendation and optional debate result
 */
export function assessConvergence(
  signals: ConvergenceSignals,
  previousStaleCount: number,
  staleThreshold: number = 2,
  debateOptions?: ConvergenceDebateOptions,
): ConvergenceResult {
  const staleSignals = [
    signals.error_count_delta >= 0,
    signals.fingerprint_overlap >= 0.8,
    signals.artifact_change_delta === 0,
  ];

  // Add 4th signal when semantic_overlap is present
  if (signals.semantic_overlap !== undefined) {
    staleSignals.push(signals.semantic_overlap >= 0.9);
  }

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

  let shouldHalt = consecutiveStale >= staleThreshold;

  // Run stall debate when enabled and halt is recommended
  let debateResult: ConvergenceResult["debate_result"] | undefined;

  if (
    shouldHalt &&
    debateOptions?.debate_enabled &&
    debateOptions.debate_input
  ) {
    if (
      shouldDebateGate(
        {
          signals,
          status,
          consecutive_stale: consecutiveStale,
          should_halt: shouldHalt,
        },
        debateOptions.debate_input.budget_remaining,
      )
    ) {
      const result = evaluateStallDebate(debateOptions.debate_input);
      debateResult = result;

      // Override halt if debate recommends retry
      if (result.recommended_strategy !== "halt") {
        shouldHalt = false;
      }
    }
  }

  return {
    signals,
    status,
    consecutive_stale: consecutiveStale,
    should_halt: shouldHalt,
    ...(debateResult ? { debate_result: debateResult } : {}),
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
 *     --stale-threshold=2 \
 *     --semantic
 *
 * Outputs JSON ConvergenceResult to stdout.
 */
if (import.meta.main) {
  const args = Bun.argv.slice(2);

  try {
    const currentRaw = getArg(args, "current", "[]");
    const previousRaw = getArg(args, "previous", "[]");
    const artifactDelta = parseInt(getArg(args, "artifact-delta", "0"), 10);
    const previousStaleCount = parseInt(
      getArg(args, "previous-stale-count", "0"),
      10,
    );
    const staleThreshold = parseInt(getArg(args, "stale-threshold", "2"), 10);
    const enableSemantic = hasFlag(args, "semantic");

    const currentResult = classifiedErrorSchema
      .array()
      .safeParse(JSON.parse(currentRaw));
    if (!currentResult.success) {
      console.error(
        `[convergence] Invalid --current JSON: ${currentResult.error.message}`,
      );
      process.exit(2);
    }
    const currentParsed = currentResult.data;

    const previousResult = classifiedErrorSchema
      .array()
      .safeParse(JSON.parse(previousRaw));
    if (!previousResult.success) {
      console.error(
        `[convergence] Invalid --previous JSON: ${previousResult.error.message}`,
      );
      process.exit(2);
    }
    const previousParsed = previousResult.data;

    const signals = computeConvergenceSignals(
      currentParsed,
      previousParsed,
      artifactDelta,
      enableSemantic,
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
