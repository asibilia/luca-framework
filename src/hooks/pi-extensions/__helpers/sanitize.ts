/**
 * Shared sanitization utilities for Pi extension input validation.
 *
 * Provides functions to escape, sanitize, and validate user-supplied input
 * before it is used in RegExp construction, template interpolation, file
 * path resolution, or identifier storage.
 *
 * Source: src/hooks/pi-extensions/__helpers/sanitize.ts
 */

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
