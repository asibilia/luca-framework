/**
 * Shared helper for merging form-field overrides back into rawConfigText.
 *
 * Extracted from `use-agent-save.ts` to enable reuse across entity save hooks
 * (agents, skills, rules) without duplicating the regex-based field replacement
 * logic.
 *
 * Each entity type passes its own `fieldKeyMap` describing which draft fields
 * map to which config key(s) in the raw TypeScript source text.
 *
 * @module merge-field-overrides
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Maps draft field names to the config property names used in rawConfigText.
 *
 * Each entry carries an array of key variants (e.g., both snake_case and
 * camelCase) since entity config files may use either convention.
 *
 * @example
 * ```ts
 * const AGENT_FIELD_KEY_MAP: FieldKeyMap = {
 *   description: ["description"],
 *   modelTier: ["model_tier", "modelTier"],
 *   purpose: ["purpose"],
 *   stage: ["stage"],
 * };
 * ```
 */
export type FieldKeyMap = Record<string, string[]>

// ---------------------------------------------------------------------------
// Field replacement helpers
// ---------------------------------------------------------------------------

/**
 * Escape special characters in a string before injecting into a quoted
 * TypeScript string literal. Prevents broken syntax from backslashes,
 * double quotes, and newlines in user-provided values.
 *
 * @param value - Raw string to escape
 * @returns Escaped string safe for embedding in double-quoted literals
 */
function escapeForQuotedString(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
}

/**
 * Replace a quoted string value for a given key in raw config text.
 *
 * Matches `key: "value"`, `key: 'value'`, or `key: \`value\`` with optional
 * whitespace. Returns the original text if no match is found.
 *
 * Special characters in `newValue` (backslashes, double quotes, newlines)
 * are escaped before injection to prevent syntax corruption.
 *
 * @param text     - The raw config text
 * @param key      - The config key to match
 * @param newValue - The replacement value (will be double-quoted)
 * @returns Updated text, or original if no match found
 */
export function replaceStringField(
    text: string,
    key: string,
    newValue: string
): string {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(${escaped}\\s*:\\s*)["'\`]([^"'\`]*?)["'\`]`)
    if (pattern.test(text)) {
        const safeValue = escapeForQuotedString(newValue)
        return text.replace(pattern, `$1"${safeValue}"`)
    }
    return text
}

/**
 * Replace a boolean value for a given key in raw config text.
 *
 * Matches `key: true` or `key: false` with optional whitespace.
 * Returns the original text if no match is found.
 *
 * @param text     - The raw config text
 * @param key      - The config key to match
 * @param newValue - The replacement boolean
 * @returns Updated text, or original if no match found
 */
export function replaceBoolField(
    text: string,
    key: string,
    newValue: boolean
): string {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(${escaped}\\s*:\\s*)(true|false)`)
    if (pattern.test(text)) {
        return text.replace(pattern, `$1${String(newValue)}`)
    }
    return text
}

// ---------------------------------------------------------------------------
// Main merge function
// ---------------------------------------------------------------------------

/**
 * Merge form-field overrides from the draft atom into rawConfigText.
 *
 * For each field in `fieldKeyMap` that has been set on the draft (not
 * undefined), applies a targeted regex replacement. Fields not changed by
 * the user (still undefined in the draft) are left untouched.
 *
 * The `enabled` boolean field is always handled if present on the draft,
 * regardless of the fieldKeyMap -- it is a universal entity field.
 *
 * @param draft       - The entity draft object containing rawConfigText and field overrides
 * @param fieldKeyMap - Mapping of draft field names to config key variants
 * @returns The patched rawConfigText string
 *
 * @example
 * ```ts
 * const AGENT_FIELD_KEY_MAP: FieldKeyMap = {
 *   description: ["description"],
 *   modelTier: ["model_tier", "modelTier"],
 * };
 * const patched = mergeFieldOverrides(draft, AGENT_FIELD_KEY_MAP);
 * ```
 */
export function mergeFieldOverrides(
    draft: Record<string, unknown>,
    fieldKeyMap: FieldKeyMap
): string {
    let text = (draft.rawConfigText as string) ?? ''

    // String fields from the field key map
    for (const [field, keys] of Object.entries(fieldKeyMap)) {
        const value = draft[field]
        if (value === undefined) continue
        for (const key of keys) {
            text = replaceStringField(text, key, String(value))
        }
    }

    // Boolean: enabled (universal entity field)
    if (draft.enabled !== undefined) {
        text = replaceBoolField(text, 'enabled', Boolean(draft.enabled))
    }

    return text
}
