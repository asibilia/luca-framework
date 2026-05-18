/**
 * String sanitization helpers — log-injection defense (CWE-117).
 *
 * Centralises the CR/LF/tab stripping logic that was duplicated across
 * `src/tools/workflow-state.ts` and `src/state/telemetry.ts`. Per-action Zod
 * schemas already reject CR/LF/tab at the input boundary; these helpers are
 * defence-in-depth for values that flow into single-line `console.warn`
 * output or telemetry meta fields.
 *
 * All three helpers extract `.message` from `Error` instances before string
 * coercion so thrown-error logging shows the message, not `[object Object]`.
 */

/**
 * Coerce an unknown value to a string, strip CR/LF/tab → space, cap at 200
 * chars. Use for single-line `console.warn`/`console.error` messages where
 * legibility matters more than completeness.
 *
 * Do NOT use for telemetry meta fields with higher schema `.max()` —
 * truncation would silently drop schema-allowed content. Use
 * `sanitizeForStorage` for those.
 */
export function sanitizeForLog(value: unknown): string {
    return String(value instanceof Error ? value.message : value)
        .replace(/[\r\n\t]/g, ' ')
        .slice(0, 200)
}

/**
 * Coerce an unknown value to a string and strip CR/LF/tab → space WITHOUT
 * truncating. Use for telemetry meta fields where the per-action Zod
 * schema's `.max()` is the authoritative length cap (e.g. record-recall
 * `query` is `.max(512)`).
 */
export function sanitizeForStorage(value: unknown): string {
    return String(value instanceof Error ? value.message : value).replace(
        /[\r\n\t]/g,
        ' '
    )
}

/**
 * Coerce an unknown value to a string, strip CR/LF/tab → space, cap at the
 * caller-specified maximum length. Use when neither the 200-char log cap nor
 * the uncapped storage form is appropriate (e.g. UI display fields with
 * domain-specific length limits).
 */
export function displayBounded(value: unknown, max: number): string {
    return String(value instanceof Error ? value.message : value)
        .replace(/[\r\n\t]/g, ' ')
        .slice(0, max)
}
