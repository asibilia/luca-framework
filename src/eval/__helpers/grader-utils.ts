/**
 * Shared utility functions for eval graders.
 *
 * Provides factory functions for common GraderResult patterns
 * to eliminate duplication across code-grader, composite-grader,
 * and eval-runner.
 *
 * @module
 */

import type { GraderResult } from "../__schemas/eval.schemas";

/**
 * Create a failing GraderResult with score 0.0.
 *
 * Factory for the common `{ passed: false, score: 0.0, reason, metadata }` pattern
 * that appears throughout the grader codebase.
 *
 * @param reason - Human-readable explanation for the failure
 * @param metadata - Optional grader-specific metadata (defaults to empty object)
 * @returns GraderResult with passed=false and score=0.0
 *
 * @example
 * ```typescript
 * // Simple failure
 * return makeFailResult("No custom grading function provided");
 *
 * // Failure with metadata
 * return makeFailResult("Trial timed out after 30000ms", { timeout: true });
 * ```
 */
export function makeFailResult(
  reason: string,
  metadata: Record<string, unknown> = {},
): GraderResult {
  return {
    passed: false,
    score: 0.0,
    reason,
    metadata,
  };
}
