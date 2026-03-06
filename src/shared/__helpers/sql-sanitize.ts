/**
 * SQL sanitization utilities for safe string interpolation in SQL queries.
 *
 * Provides functions for escaping SQL strings and validating filter values
 * before query interpolation. Used by ledger.ts and audit-findings.ts.
 *
 * NOTE: This module is imported by luca-state package which cannot cross-import
 * from src/shared. The same patterns are duplicated in:
 * - packages/luca-framework/src/state/sanitize.ts (for luca-state)
 * - src/shared/__helpers/sql-sanitize.ts (for framework)
 *
 * @module sql-sanitize
 */

/**
 * Escape a string for safe SQL string interpolation.
 *
 * Escapes single quotes by doubling them (SQL standard).
 * This is a defense-in-depth measure; primary validation should use
 * allowlist patterns or regex validation before this is called.
 *
 * @param value - The string value to escape
 * @returns The escaped string safe for SQL
 *
 * @example
 * ```typescript
 * const escaped = escapeSqlString("user's input");
 * // Returns: "user''s input"
 * ```
 */
export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Validate and escape a string filter value for SQL interpolation.
 *
 * Combines regex validation with escaping for defense-in-depth.
 *
 * @param value - The value to validate and escape
 * @param regex - The regex pattern to validate against
 * @param fieldName - The field name for error messages
 * @returns The validated and escaped string
 * @throws Error if the value doesn't match the regex
 */
export function validateAndEscapeSqlString(
  value: string,
  regex: RegExp,
  fieldName: string,
): string {
  if (!regex.test(value)) {
    throw new Error(
      `Invalid ${fieldName} format: ${value.slice(0, 50)}${value.length > 50 ? "..." : ""}`,
    );
  }
  return escapeSqlString(value);
}

/**
 * Default regex for safe string filter values: alphanumeric, hyphens, underscores,
 * dots, slashes, spaces, and colons. Max length 512 characters.
 *
 * Use this with `validateAndEscapeSqlString` for common filter validation.
 * For custom patterns, use `validateAndEscapeSqlString` with your own regex.
 */
export const SAFE_STRING_RE = /^[a-zA-Z0-9_\-./: ]+$/;

/**
 * Validate a generic string filter value for safe SQL interpolation.
 *
 * Combines the default SAFE_STRING_RE regex validation with SQL escaping
 * in a single defense-in-depth measure. For custom validation patterns,
 * use `validateAndEscapeSqlString` with a custom regex.
 *
 * @param value - The value to validate
 * @param fieldName - The field name for error messages
 * @param maxLength - Maximum allowed length (default: 512)
 * @returns The validated string (escaped for SQL)
 * @throws If the value contains unsafe characters or exceeds max length
 *
 * @example
 * ```typescript
 * const safe = validateFilterString("session-abc-123", "session_id");
 * ```
 */
export function validateFilterString(
  value: string,
  fieldName: string,
  maxLength: number = 512,
): string {
  if (value.length > maxLength || !SAFE_STRING_RE.test(value)) {
    throw new Error(
      `Invalid ${fieldName} format: ${value.slice(0, 50)}${value.length > 50 ? "..." : ""}`,
    );
  }
  return escapeSqlString(value);
}
