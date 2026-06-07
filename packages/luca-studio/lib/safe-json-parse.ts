/**
 * Safely parse a JSON string with a typed fallback value.
 *
 * Replaces 6 identical try/catch JSON.parse blocks across observer hooks.
 * Returns the fallback on any parse error instead of throwing.
 *
 * @param json - The JSON string to parse (may be null/undefined/empty)
 * @param fallback - Value to return on parse failure
 * @returns Parsed value or fallback
 *
 * @example
 * ```typescript
 * const data = safeJsonParse(row.detailsJson, {});
 * const items = safeJsonParse(row.checksJson, []);
 * const plan = safeJsonParse<SessionPlan | null>(row.planJson, null);
 * ```
 */
export function safeJsonParse<T>(
    json: string | null | undefined,
    fallback: T
): T {
    if (!json) return fallback
    try {
        return JSON.parse(json) as T
    } catch {
        return fallback
    }
}
