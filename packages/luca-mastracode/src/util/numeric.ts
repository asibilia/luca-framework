/**
 * Numeric guards — NaN-safe coercion for telemetry and storage layers.
 *
 * Centralises the duration / token-count validation logic that was duplicated
 * as module-private helpers in `src/tools/workflow-state.ts`. Unguarded NaN
 * silently drops the entire enclosing record during Zod validation
 * (Copilot PR #239 review #3228846363, #3228846383); these helpers normalise
 * `NaN`, `Infinity`, and negatives to `null` so the surrounding event still
 * persists.
 */

/**
 * Return `n` when it is a finite, non-negative number; otherwise `null`.
 *
 * Used by telemetry recording paths where a missing / unparseable duration
 * must not abort the whole event. Treats `NaN`, `±Infinity`, negative values,
 * and non-`number` inputs (including `null` / `undefined`) as missing.
 */
export function finiteOrNull(n: number | null | undefined): number | null {
    if (typeof n !== 'number') return null
    if (!Number.isFinite(n)) return null
    if (n < 0) return null
    return n
}

/**
 * Clamp a token count to a safe integer or `null`.
 *
 * Rejects non-finite, negative, or unreasonably large values (default ceiling
 * 10_000_000 — chosen to comfortably bound any single LLM call while still
 * flagging accidental scientific-notation overflows). Floors fractional
 * inputs to the nearest integer so downstream sums stay integer-typed.
 */
export function clampTokens(
    n: number | null | undefined,
    max: number = 10_000_000
): number | null {
    if (typeof n !== 'number') return null
    if (!Number.isFinite(n)) return null
    if (n < 0) return null
    if (n > max) return null
    return Math.floor(n)
}
