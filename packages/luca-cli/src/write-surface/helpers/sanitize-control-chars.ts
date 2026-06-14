/**
 * Replace ASCII control characters (C0 range, ESC/ANSI, DEL) with their
 * `\xNN` escapes so echoed payload fragments — `--file` paths, criterion ids,
 * follow-up sources, parser error messages — cannot inject newlines or
 * terminal escape sequences into tool output. Output lines stay single-line
 * and free of escape-sequence injection.
 *
 * Single source of truth for the write-surface handlers (luca-plan-lint,
 * luca-phase-write-verify) and helpers (validate-verification-ref).
 *
 * @param text - Raw text destined for an output line.
 * @returns The text with each control character replaced by its `\xNN`
 *   escape.
 */
export function sanitizeControlChars(text: string): string {
    return text.replace(
        /[\x00-\x1f\x7f]/g,
        (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`
    )
}
