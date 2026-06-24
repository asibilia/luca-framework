/**
 * Replace control characters (C0 range incl. ESC/ANSI, DEL, and C1) with their
 * `\xNN` escapes so echoed payload fragments — `--file` paths, criterion ids,
 * follow-up sources, parser error messages, claim/evidence text — cannot inject
 * newlines or terminal escape sequences into tool output. Output lines stay
 * single-line and free of escape-sequence injection. The C1 range (U+0080–U+009F)
 * is covered because several C1 codes (e.g. U+009B CSI) drive terminal escape
 * sequences just like their C0 ESC-prefixed equivalents.
 *
 * Single source of truth for the write-surface handlers (luca-plan-lint,
 * luca-phase-write-verify), helpers (validate-verification-ref), and the
 * `luca claim-verify` command.
 *
 * @param text - Raw text destined for an output line.
 * @returns The text with each control character replaced by its `\xNN`
 *   escape.
 */
export function sanitizeControlChars(text: string): string {
    return text.replace(
        // eslint-disable-next-line no-control-regex -- intentional: this fn exists to strip C0/C1 control chars
        /[\x00-\x1f\x7f-\x9f]/g,
        (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`
    )
}
