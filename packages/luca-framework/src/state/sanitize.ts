/**
 * JSON parsing with prototype pollution protection for luca-state.
 *
 * NOTE: This function is intentionally duplicated from
 * packages/luca-framework/src/utils/sanitize.ts.
 * The two packages are isolated by design and cannot cross-import.
 * If you modify this function, update the other copies as well.
 *
 * Copies exist in:
 * - packages/luca-framework/src/utils/sanitize.ts
 * - packages/luca-framework/src/state/sanitize.ts (this file)
 * - src/shared/__helpers/validation-utils.ts
 *
 * @module luca-state/sanitize
 */

/** Keys that can be exploited for prototype pollution attacks */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively strip prototype pollution keys from a parsed JSON value.
 *
 * @param obj - The value to sanitize
 * @returns A new value with dangerous keys removed
 */
function stripPrototypeKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(stripPrototypeKeys);
  }

  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (!DANGEROUS_KEYS.has(key)) {
      cleaned[key] = stripPrototypeKeys((obj as Record<string, unknown>)[key]);
    }
  }
  return cleaned;
}

/**
 * Parse JSON and strip prototype pollution keys.
 *
 * @param json - The JSON string to parse
 * @returns Parsed and sanitized value
 * @throws {SyntaxError} If the input is not valid JSON
 */
export function sanitizeJsonParse(json: string): unknown {
  const parsed = JSON.parse(json);
  return stripPrototypeKeys(parsed);
}
