/**
 * Template sanitization utilities for prompt construction.
 *
 * Strips template injection characters from strings before they are
 * interpolated into prompt template literals. This prevents AI-generated
 * free-text fields (root causes, evidence summaries, reasoning) from
 * accidentally or maliciously breaking template boundaries.
 *
 * This is the T0 (shared) copy of the sanitizer. The canonical logic
 * also exists in T3 (hooks/pi-extensions/__helpers/sanitize.ts) but
 * T2/T0 domains cannot import from T3 per module boundary rules.
 *
 * Source: src/shared/__helpers/sanitize-template.ts
 */

/**
 * Strip template injection characters from strings before prompt interpolation.
 *
 * Removes backticks, `${...}` sequences, newlines, and control characters
 * to prevent template literal injection in prompt construction.
 *
 * @param str - The raw string to sanitize
 * @returns A string safe for template literal interpolation
 *
 * @example
 * ```typescript
 * sanitizeForTemplate("hello `world` ${injected}")
 * // "hello world "
 *
 * sanitizeForTemplate("line1\nline2\rline3")
 * // "line1 line2 line3"
 *
 * sanitizeForTemplate("normal text")
 * // "normal text"
 *
 * sanitizeForTemplate("text \u202Ewith bidi\u202C chars")
 * // "text with bidi chars"
 * ```
 */
export function sanitizeForTemplate(str: string): string {
  return str
    .replace(/`/g, "")
    .replace(/\$\{[^}]*\}/g, "") // Remove complete ${...} sequences
    .replace(/\$\{/g, "") // Remove any remaining unclosed ${
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "") // Strip bidi control chars
    .replace(/[\n\r]/g, " ")
    .replace(/[\x00-\x1f\x7f]/g, "");
}
