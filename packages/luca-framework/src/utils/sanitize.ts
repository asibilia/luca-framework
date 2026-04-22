/**
 * JSON parsing utilities with prototype pollution protection.
 *
 * Provides safe alternatives to JSON.parse that strip dangerous keys
 * (__proto__, constructor, prototype) to prevent prototype pollution attacks.
 *
 * @module utils/sanitize
 */

/** Keys that can be exploited for prototype pollution attacks */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Recursively strip prototype pollution keys from a parsed JSON value.
 *
 * @param obj - The value to sanitize
 * @returns A new value with dangerous keys removed
 */
function stripPrototypeKeys(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
        return obj
    }

    if (Array.isArray(obj)) {
        return obj.map(stripPrototypeKeys)
    }

    const cleaned: Record<string, unknown> = {}
    for (const key of Object.keys(obj as Record<string, unknown>)) {
        if (!DANGEROUS_KEYS.has(key)) {
            cleaned[key] = stripPrototypeKeys(
                (obj as Record<string, unknown>)[key]
            )
        }
    }
    return cleaned
}

/**
 * Parse JSON and strip prototype pollution keys.
 *
 * @param json - The JSON string to parse
 * @returns Parsed and sanitized value
 * @throws {SyntaxError} If the input is not valid JSON
 */
export function sanitizeJsonParse(json: string): unknown {
    const parsed = JSON.parse(json)
    return stripPrototypeKeys(parsed)
}
