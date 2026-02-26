import type {
  CheckResult,
  ParsedError,
} from "~/harness/__schemas/harness.schemas";
import type {
  ClassifiedError,
  ErrorClass,
} from "../__schemas/iteration.schemas";
import { createFingerprint } from "./convergence";

/**
 * Rule-based classification lookup table.
 * Maps harness check name to default error class.
 */
const SOURCE_CLASSIFICATION: Record<string, ErrorClass> = {
  test: "correctable",
  typecheck: "correctable",
  lint: "correctable",
  build: "transient",
};

/**
 * Pattern-based overrides applied after source classification.
 * Patterns matched against error.message (case-insensitive).
 */
const PERMANENT_PATTERNS = [
  "cannot find module",
  "circular dependency",
  "circular import",
];

const TRANSIENT_PATTERNS = [
  "econnrefused",
  "etimedout",
  "econnreset",
  "epipe",
  "enotfound",
];

/**
 * Classify a single ParsedError using rule-based classification.
 *
 * Classification priority:
 * 1. Pattern-based overrides (permanent/transient patterns in message)
 * 2. Promotion: correctable -> permanent after promotionThreshold iterations
 * 3. Source-based default (check name -> class)
 *
 * @param error - The parsed error from harness output
 * @param checkName - The harness check that produced this error
 * @param fingerprintLedger - Map of fingerprint -> iteration count
 * @param promotionThreshold - Iterations before correctable promotes to permanent (default 3)
 * @returns ClassifiedError with fingerprint and classification
 */
export function classifySingleError(
  error: ParsedError,
  checkName: string,
  fingerprintLedger: Record<string, number>,
  promotionThreshold: number = 3,
): ClassifiedError {
  const fp = createFingerprint(error);
  const iterationsSeen = (fingerprintLedger[fp] ?? 0) + 1;

  // Start with source-based classification
  let classification: ErrorClass =
    SOURCE_CLASSIFICATION[checkName] ?? "correctable";

  // Pattern-based overrides
  const messageLower = error.message.toLowerCase();

  if (PERMANENT_PATTERNS.some((p) => messageLower.includes(p))) {
    classification = "permanent";
  } else if (TRANSIENT_PATTERNS.some((p) => messageLower.includes(p))) {
    classification = "transient";
  }

  // Promotion: correctable -> permanent after threshold iterations
  if (
    classification === "correctable" &&
    iterationsSeen >= promotionThreshold
  ) {
    classification = "permanent";
  }

  return {
    fingerprint: fp,
    source: checkName,
    classification,
    iterations_seen: iterationsSeen,
    message: error.message,
    file: error.file,
    line: error.line,
    code: error.code,
  };
}

/**
 * Classify all errors from a HarnessResult's check results.
 *
 * Processes all errors from all checks, updates the fingerprint ledger,
 * and returns the classified errors plus the updated ledger.
 *
 * @param checkResults - Array of CheckResult from harness run
 * @param fingerprintLedger - Current fingerprint -> iteration count map
 * @param promotionThreshold - Iterations before promotion (default 3)
 * @returns Object with classified errors and updated ledger
 */
export function classifyErrors(
  checkResults: CheckResult[],
  fingerprintLedger: Record<string, number>,
  promotionThreshold: number = 3,
): {
  classified: ClassifiedError[];
  updated_ledger: Record<string, number>;
} {
  const updatedLedger = { ...fingerprintLedger };
  const classified: ClassifiedError[] = [];

  for (const check of checkResults) {
    for (const error of check.errors) {
      const ce = classifySingleError(
        error,
        check.name,
        updatedLedger,
        promotionThreshold,
      );
      classified.push(ce);
      updatedLedger[ce.fingerprint] = ce.iterations_seen;
    }
  }

  return { classified, updated_ledger: updatedLedger };
}

/**
 * Partition classified errors by classification.
 *
 * @param errors - Array of classified errors
 * @returns Object with transient, correctable, and permanent arrays
 */
export function partitionByClass(errors: ClassifiedError[]): {
  transient: ClassifiedError[];
  correctable: ClassifiedError[];
  permanent: ClassifiedError[];
} {
  return {
    transient: errors.filter((e) => e.classification === "transient"),
    correctable: errors.filter((e) => e.classification === "correctable"),
    permanent: errors.filter((e) => e.classification === "permanent"),
  };
}

/**
 * CLI entry point for error classification.
 *
 * Usage:
 *   bun run src/iteration/classifier.ts \
 *     --harness-result='{"checks":[...]}' \
 *     --ledger='{"fp1":2}' \
 *     --promotion-threshold=3
 *
 * Outputs JSON { classified, updated_ledger } to stdout.
 */
if (import.meta.main) {
  const args = Bun.argv.slice(2);

  function getArg(name: string, defaultValue: string = ""): string {
    const prefix = `--${name}=`;
    const arg = args.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : defaultValue;
  }

  try {
    const harnessResultRaw = getArg("harness-result", '{"checks":[]}');
    const ledgerRaw = getArg("ledger", "{}");
    const promotionThreshold = parseInt(getArg("promotion-threshold", "3"), 10);

    const harnessResult = JSON.parse(harnessResultRaw);
    const ledger = JSON.parse(ledgerRaw) as Record<string, number>;

    const result = classifyErrors(
      harnessResult.checks ?? [],
      ledger,
      promotionThreshold,
    );

    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}
