/**
 * Shared sanitization utilities for Pi extension input validation.
 *
 * Provides functions to escape, sanitize, and validate user-supplied input
 * before it is used in RegExp construction, template interpolation, file
 * path resolution, or identifier storage.
 *
 * Source: src/hooks/pi-extensions/__helpers/sanitize.ts
 */
import { resolve } from "path";

// Zero-width and invisible Unicode characters to strip during normalization
const ZERO_WIDTH_CHARS = /[\u200B\u200C\u200D\uFEFF]/g;

/**
 * Escape regex special characters in a string.
 * Prevents unsafe RegExp construction from user input.
 *
 * @param str - The raw string to escape
 * @returns The string with all regex metacharacters backslash-escaped
 *
 * @example
 * ```typescript
 * escapeRegExp("foo.bar+baz") // "foo\\.bar\\+baz"
 * ```
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sanitize a name for use in file paths and identifiers.
 * Only allows alphanumeric, hyphens, and underscores.
 *
 * @param name - The raw name to sanitize
 * @param maxLength - Maximum allowed length (default: 64)
 * @returns A sanitized string safe for file paths and identifiers
 *
 * @example
 * ```typescript
 * sanitizeName("my session!@#name") // "my-session-name"
 * sanitizeName("--leading--") // "leading"
 * ```
 */
export function sanitizeName(name: string, maxLength: number = 64): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength);
}

/**
 * Strip template injection characters from strings before interpolation.
 * Removes backticks, ${...} sequences, newlines, and control characters.
 *
 * @param str - The raw string to sanitize
 * @returns A string safe for template literal interpolation
 *
 * @example
 * ```typescript
 * sanitizeForTemplate("hello `world` ${injected}") // "hello world injected}"
 * ```
 */
export function sanitizeForTemplate(str: string): string {
  return str
    .replace(/`/g, "")
    .replace(/\$\{/g, "")
    .replace(/[\n\r]/g, " ")
    .replace(/[\x00-\x1f\x7f]/g, "");
}

/**
 * Validate a script path for hook references.
 * Rejects traversal, absolute paths, and null bytes.
 *
 * @param scriptPath - The path to validate
 * @returns true if the path is safe, false otherwise
 *
 * @example
 * ```typescript
 * validateScriptPath("hooks/pre-commit.sh") // true
 * validateScriptPath("../../../etc/passwd") // false
 * validateScriptPath("/absolute/path") // false
 * ```
 */
export function validateScriptPath(scriptPath: string): boolean {
  if (
    !scriptPath ||
    scriptPath.includes("..") ||
    scriptPath.startsWith("/") ||
    scriptPath.includes("\0")
  ) {
    return false;
  }
  return /^[a-zA-Z0-9_\-./]+$/.test(scriptPath);
}

/**
 * Check if a string is a valid identifier (alphanumeric, hyphens, underscores).
 *
 * @param str - The string to validate
 * @returns true if the string is a valid identifier
 *
 * @example
 * ```typescript
 * isValidIdentifier("lu-router") // true
 * isValidIdentifier("my_agent") // true
 * isValidIdentifier("bad agent!") // false
 * ```
 */
export function isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(str);
}

/**
 * Normalize a tool name for restriction checks.
 * Trims whitespace, removes zero-width/invisible Unicode characters,
 * converts to lowercase, and collapses internal whitespace.
 *
 * Used by luca-roles to prevent tool restriction bypass via whitespace,
 * invisible characters, or case variations.
 *
 * @param name - The raw tool name to normalize
 * @returns The normalized tool name
 *
 * @example
 * ```typescript
 * normalizeToolName("  luca_verify  ") // "luca_verify"
 * normalizeToolName("luca\u200B_verify") // "luca_verify"
 * normalizeToolName("LUCA_VERIFY") // "luca_verify"
 * ```
 */
export function normalizeToolName(name: string): string {
  return name
    .trim()
    .replace(ZERO_WIDTH_CHARS, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Check if a resolved file path is within a base directory.
 * Prevents path traversal attacks by resolving both paths to absolute
 * and verifying containment.
 *
 * @param filePath - The file path to validate
 * @param baseDir - The base directory that must contain the file
 * @returns true if filePath is within baseDir, false otherwise
 *
 * @example
 * ```typescript
 * isWithinDirectory("/project/.planning/BRAIN.md", "/project/.planning") // true
 * isWithinDirectory("/project/.planning/../etc/passwd", "/project/.planning") // false
 * isWithinDirectory("/etc/passwd", "/project/.planning") // false
 * ```
 */
export function isWithinDirectory(filePath: string, baseDir: string): boolean {
  const resolvedFile = resolve(filePath);
  const resolvedBase = resolve(baseDir);
  // Ensure the resolved file starts with the base directory followed by /
  // Also allow exact match (the directory itself)
  return (
    resolvedFile === resolvedBase || resolvedFile.startsWith(resolvedBase + "/")
  );
}

/**
 * Normalize a context or purpose string for comparison.
 * Trims whitespace, converts to lowercase, collapses internal whitespace,
 * and returns empty string for null/undefined inputs.
 *
 * Used by luca-purpose-gating to prevent bypasses via whitespace,
 * empty strings, or case inconsistencies.
 *
 * @param str - The raw context/purpose string to normalize (may be null/undefined)
 * @returns The normalized string, or empty string for null/undefined
 *
 * @example
 * ```typescript
 * normalizeContext("  Research  ") // "research"
 * normalizeContext("EXECUTION") // "execution"
 * normalizeContext("  ") // ""
 * normalizeContext(null) // ""
 * ```
 */
export function normalizeContext(str: string | null | undefined): string {
  if (str == null) return "";
  return str.trim().replace(/\s+/g, " ").toLowerCase();
}
