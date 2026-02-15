/**
 * Shared CLI argument parsing utilities.
 *
 * Extracted from state-machine/bridge.ts, state-machine/cli.ts, and
 * memory/bridge.ts to eliminate duplication across bridge/CLI modules.
 *
 * @module shared/cli-utils
 */

/**
 * Extract a named argument from CLI args array.
 *
 * Searches for `--name=value` pattern and returns the value portion.
 *
 * @param args - Array of CLI argument strings
 * @param name - Argument name (without -- prefix)
 * @param defaultValue - Value to return if argument is not found
 * @returns The argument value, or defaultValue if not found
 *
 * @example
 * ```typescript
 * const tags = getArg(["--tags=a,b", "--limit=5"], "tags");
 * // "a,b"
 *
 * const missing = getArg(["--tags=a,b"], "limit", "10");
 * // "10"
 * ```
 */
export function getArg(
  args: string[],
  name: string,
  defaultValue: string = "",
): string {
  const prefix = `--${name}=`;
  const arg = args.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : defaultValue;
}

/**
 * Check if a boolean flag is present in CLI args.
 *
 * Searches for `--name` (without value) in the args array.
 *
 * @param args - Array of CLI argument strings
 * @param name - Flag name (without -- prefix)
 * @returns true if the flag is present
 *
 * @example
 * ```typescript
 * const force = hasFlag(["--force", "--verbose"], "force");
 * // true
 *
 * const quiet = hasFlag(["--force"], "quiet");
 * // false
 * ```
 */
export function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

/**
 * Escape special regex characters in a string.
 *
 * Used for safe inclusion in RegExp constructors when the string
 * may contain characters with special meaning in regular expressions.
 *
 * @param str - String to escape
 * @returns Escaped string safe for use in RegExp
 *
 * @example
 * ```typescript
 * const escaped = escapeRegex("foo.bar (baz)");
 * // "foo\\.bar \\(baz\\)"
 *
 * const pattern = new RegExp(`^## ${escapeRegex(header)}\\s*$`, "m");
 * ```
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
