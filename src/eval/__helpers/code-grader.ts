import get from "lodash/get";

import type {
  GraderResult,
  CodeGraderConfig,
  CustomGraderFn,
} from "../__schemas/eval.schemas";
import { makeFailResult } from "./grader-utils";

// Re-export CustomGraderFn for backward compatibility (moved to __schemas/)
export type { CustomGraderFn } from "../__schemas/eval.schemas";

/**
 * Extract the value to grade from the raw output.
 *
 * If `outputPath` is set, uses lodash `get` to extract a nested value.
 * Otherwise returns the raw output directly.
 *
 * @param output - Raw output from the agent/component
 * @param outputPath - Optional dot-notation path for value extraction
 * @returns The extracted value
 */
function extractValue(output: unknown, outputPath?: string): unknown {
  if (outputPath) {
    return get(output, outputPath);
  }
  return output;
}

/**
 * Grade using exact_match strategy.
 *
 * Compares extracted value with expected_value using JSON.stringify for deep equality.
 * Score is 1.0 on match, 0.0 on mismatch.
 */
function gradeExactMatch(
  extracted: unknown,
  config: CodeGraderConfig,
): GraderResult {
  const expected = JSON.stringify(config.expected_value);
  const actual = JSON.stringify(extracted);
  const passed = actual === expected;

  return {
    passed,
    score: passed ? 1.0 : 0.0,
    reason: passed
      ? `Exact match: ${actual}`
      : `Mismatch: expected ${expected}, got ${actual}`,
    metadata: {},
  };
}

/**
 * Grade using contains strategy.
 *
 * Checks that String(extractedValue) includes every string in expected_substrings.
 * Score is (matched_count / total_count). Passes when score is 1.0.
 */
function gradeContains(
  extracted: unknown,
  config: CodeGraderConfig,
): GraderResult {
  const substrings = config.expected_substrings ?? [];
  if (substrings.length === 0) {
    return makeFailResult("No expected substrings provided");
  }

  const text = String(extracted);
  const matched = substrings.filter((s) => text.includes(s));
  const score = matched.length / substrings.length;
  const passed = score === 1.0;

  return {
    passed,
    score,
    reason: passed
      ? `All ${substrings.length} substrings found`
      : `Found ${matched.length}/${substrings.length} substrings`,
    metadata: {},
  };
}

/**
 * Grade using regex strategy.
 *
 * Tests String(extractedValue) against the configured pattern.
 * Score is 1.0 on match, 0.0 on no match.
 */
function gradeRegex(
  extracted: unknown,
  config: CodeGraderConfig,
): GraderResult {
  if (!config.pattern) {
    return makeFailResult("No regex pattern provided");
  }

  const text = String(extracted);
  const regex = new RegExp(config.pattern);
  const passed = regex.test(text);

  return {
    passed,
    score: passed ? 1.0 : 0.0,
    reason: passed
      ? `Regex matched: /${config.pattern}/`
      : `Regex did not match: /${config.pattern}/ against "${text}"`,
    metadata: {},
  };
}

/**
 * Grade using set_membership strategy.
 *
 * Checks if extracted value is in allowed_values using JSON.stringify comparison.
 * Score is 1.0 if member, 0.0 if not. Reason includes the allowed set for debugging.
 */
function gradeSetMembership(
  extracted: unknown,
  config: CodeGraderConfig,
): GraderResult {
  const allowedValues = config.allowed_values ?? [];
  const serialized = JSON.stringify(extracted);
  const passed = allowedValues.some((v) => JSON.stringify(v) === serialized);

  return {
    passed,
    score: passed ? 1.0 : 0.0,
    reason: passed
      ? `Value ${serialized} is in allowed set`
      : `Value ${serialized} not in allowed set: [${allowedValues.map((v) => JSON.stringify(v)).join(", ")}]`,
    metadata: {},
  };
}

/**
 * Grade using threshold strategy.
 *
 * Extracts a numeric value and checks min <= value <= max (either bound optional).
 * Score is 1.0 if within range, 0.0 if outside.
 * If value is not a number, score 0.0 with reason "Output is not a number".
 */
function gradeThreshold(
  extracted: unknown,
  config: CodeGraderConfig,
): GraderResult {
  const value = Number(extracted);
  if (Number.isNaN(value)) {
    return makeFailResult("Output is not a number");
  }

  const aboveMin = config.min === undefined || value >= config.min;
  const belowMax = config.max === undefined || value <= config.max;
  const passed = aboveMin && belowMax;

  const rangeDesc = [
    config.min !== undefined ? `min=${config.min}` : null,
    config.max !== undefined ? `max=${config.max}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    passed,
    score: passed ? 1.0 : 0.0,
    reason: passed
      ? `Value ${value} within range [${rangeDesc}]`
      : `Value ${value} outside range [${rangeDesc}]`,
    metadata: {},
  };
}

/**
 * Grade an eval case output using a deterministic code-based strategy.
 *
 * Extracts the value to grade using `config.output_path` (via lodash get)
 * or uses the raw output if no path is specified. Then applies the
 * configured strategy.
 *
 * @param output - Raw output from the agent/component being evaluated
 * @param config - Code grader configuration specifying strategy and parameters
 * @param customFn - Optional custom grading function (required when strategy is "custom")
 * @returns GraderResult with pass/fail, score, reason, and metadata
 *
 * @example
 * ```typescript
 * const result = gradeWithCode(
 *   { complexity: "MODERATE" },
 *   { strategy: "exact_match", expected_value: "MODERATE", output_path: "complexity" },
 * );
 * // { passed: true, score: 1.0, reason: "Exact match: ...", metadata: {} }
 * ```
 */
export function gradeWithCode(
  output: unknown,
  config: CodeGraderConfig,
  customFn?: CustomGraderFn,
): GraderResult {
  const extracted = extractValue(output, config.output_path);

  switch (config.strategy) {
    case "exact_match":
      return gradeExactMatch(extracted, config);
    case "contains":
      return gradeContains(extracted, config);
    case "regex":
      return gradeRegex(extracted, config);
    case "set_membership":
      return gradeSetMembership(extracted, config);
    case "threshold":
      return gradeThreshold(extracted, config);
    case "custom": {
      if (!customFn) {
        return makeFailResult("No custom grading function provided");
      }
      return customFn(extracted, undefined);
    }
    default:
      return makeFailResult(`Unknown strategy: ${config.strategy}`);
  }
}
