/**
 * Coerce an unknown value to a single-line string for `console.warn` output:
 * extract `.message` from `Error` instances, strip CR / LF / tab → space, and
 * cap at 200 characters. Log-injection defense (CWE-117).
 *
 * Ported from luca-mastracode `util/sanitize.ts` (`sanitizeForLog`).
 */
export function sanitizeForLog(value: unknown): string {
    return String(value instanceof Error ? value.message : value)
        .replace(/[\r\n\t]/g, ' ')
        .slice(0, 200)
}
