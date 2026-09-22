/**
 * Single-line rendering of SENDER-CONTROLLED handoff envelope values.
 *
 * This module lives in luca-tools rather than luca-cli because BOTH
 * consumers need it and the dependency graph runs luca-cli -> luca-tools ->
 * luca-core:
 *
 *   - `luca-cli/src/write-surface/handlers/luca-handoff-{list,accept}.ts`
 *     (the human-invoked triage views), which re-export it from
 *     `write-surface/helpers/handoff-transport.ts` so their import sites
 *     stay byte-unchanged.
 *   - `luca-tools/src/hooks/handoff-inbox/render-inbox-notice.ts` (the
 *     SessionStart notice), which cannot import from luca-cli at all.
 *
 * luca-core's `handoff/` module is frozen by this phase's scope fence, and
 * duplicating the escaper is forbidden (two copies drift, and this one is a
 * security control), so luca-tools is the only placement satisfying both
 * constraints.
 *
 * Every character class and escape sequence in this module is built from
 * `String.fromCharCode` rather than written as a source-level escape. That is
 * deliberate: a literal control-character class is invisible in a diff and is
 * trivially mangled in transit (a `NUL-to-US` range collapses into a
 * meaningless two-character class that still compiles and still matches
 * almost nothing). Char codes are unambiguous ASCII and survive any pipeline.
 */

/** Backslash. Built by code point so no source-level escape is needed. */
const BACKSLASH = String.fromCharCode(92)

/** Highest C0 control code point. */
const C0_MAX = 31

/** DEL. */
const DEL = 127

/** One character, by code point. */
const ch = (code: number): string => String.fromCharCode(code)

/** An inclusive character-class range, by code point. */
const range = (lo: number, hi: number): string => `${ch(lo)}-${ch(hi)}`

/**
 * Characters that must never be emitted raw.
 *
 * Four groups, each load-bearing:
 *
 *  1. **C0 (0x00–0x1F) and DEL (0x7F).** The original set: a raw newline lets
 *     sender text open its own line and read as a fresh instruction.
 *  2. **`<` (0x3C) and `>` (0x3E).** The BLOCK DELIMITER alphabet. The
 *     SessionStart notice frames envelope text inside
 *     `<luca-handoff-inbox …>` … `</luca-handoff-inbox …>` and that framing
 *     applies only INSIDE the tags — so a sender able to write a closing tag
 *     could close the block early and append forged out-of-band text that
 *     reads as harness-authored instruction. Escaping every angle bracket
 *     means no rendered value can contain ANY tag, forged or otherwise. When
 *     output is framed by an in-band delimiter, the delimiter is part of the
 *     alphabet the attacker controls unless you exclude it.
 *  3. **C1 (0x80–0x9F, which includes NEL 0x85), U+2028 LINE SEPARATOR and
 *     U+2029 PARAGRAPH SEPARATOR.** These are line terminators in ECMAScript
 *     and hard breaks under UAX#14 and in many renderers, so leaving them raw
 *     breaks the "exactly one line" contract by a route that is not a C0
 *     newline.
 *  4. **Bidi controls (U+200E–U+200F, U+202A–U+202E, U+2066–U+2069) and
 *     zero-width characters (U+200B–U+200D, U+FEFF).** These do not break the
 *     line, but they visually reorder or hide text — which matters for the
 *     human-facing `luca handoff list` triage view that shares this escaper.
 */
export const CONTROL_CHAR_RE = new RegExp(
    '[' +
        range(0, C0_MAX) +
        ch(DEL) +
        ch(60) + // `<`
        ch(62) + // `>`
        range(0x80, 0x9f) + // C1, incl. NEL (0x85)
        range(0x200b, 0x200f) + // ZWSP, ZWNJ, ZWJ, LRM, RLM
        range(0x2028, 0x202e) + // LS, PS, and the bidi embeds/overrides
        range(0x2066, 0x2069) + // bidi isolates
        ch(0xfeff) + // ZWNBSP / BOM
        ']',
    'g'
)

/** Longest rendered form of one sender-controlled value, in CODE POINTS. */
const MAX_RENDERED_LENGTH = 256

/** Named two-character renderings for the three common whitespace controls. */
const NAMED_ESCAPES: ReadonlyMap<number, string> = new Map([
    [9, `${BACKSLASH}t`],
    [10, `${BACKSLASH}n`],
    [13, `${BACKSLASH}r`],
])

/**
 * Render a SENDER-CONTROLLED envelope value as exactly one line.
 *
 * `origin.repoPath` / `target.repoPath` are self-declared by the sending repo
 * and are echoed into the `list` triage view — the deliberately low-exposure
 * surface that withholds `intent` and `acceptanceCriteria` precisely so the
 * receiving agent does not read attacker-authored, instruction-shaped prose
 * into context. A multi-line value would put those lines right back. Control
 * characters are escaped (never dropped, so nothing is silently hidden) and
 * the result is truncated, so one field can never dominate the view.
 *
 * `send` also constrains these values at the boundary; this is the rendering
 * half, and it also covers envelopes that predate the constraint or were
 * written by another tool.
 *
 * @param value - untrusted, sender-authored text
 * @returns a single-line, length-capped rendering
 *
 * @example
 * A value containing a newline followed by `IGNORE PREVIOUS` comes back as a
 * single line in which the newline has become the two visible characters
 * backslash + `n`, so the injected text can no longer start its own line.
 *
 * @example
 * A value containing a closing `luca-handoff-inbox` tag comes back with both
 * angle brackets rendered as `\x3c` / `\x3e`, so it cannot close the
 * containment block the SessionStart notice frames it with.
 */
export function toSingleLine(value: string): string {
    const escaped = value.replace(CONTROL_CHAR_RE, (char) => {
        const code = char.charCodeAt(0)
        const named = NAMED_ESCAPES.get(code)
        if (named !== undefined) return named
        // Nothing is ever DROPPED — a silently removed character hides text
        // from a human triaging the list. Above 0xFF the two-digit `\xNN`
        // form cannot represent the code point, so widen to `\uNNNN`.
        return code > 0xff
            ? `${BACKSLASH}u${code.toString(16).padStart(4, '0')}`
            : `${BACKSLASH}x${code.toString(16).padStart(2, '0')}`
    })
    return capCodePoints(escaped, MAX_RENDERED_LENGTH, '…(truncated)')
}

/**
 * Hard-cap a string at `max` CODE POINTS, appending `suffix` when it bites.
 *
 * Slicing on a code-UNIT index can cut between the halves of a surrogate
 * pair, and a lone surrogate is not encodable as UTF-8. The SessionStart
 * handler puts this text through `JSON.stringify` onto the stdout channel the
 * harness parses, so a lone surrogate is malformed output on exactly the
 * channel that must never be malformed — and it is sender-triggerable by
 * padding a field with astral-plane characters until the cap lands mid-pair.
 * Iterating with the spread operator walks code points, so a pair is either
 * wholly kept or wholly dropped.
 *
 * Shared with `render-inbox-notice.ts`, which caps `intent` at a shorter
 * bound and needs the identical guarantee.
 *
 * @param value - the already-escaped rendering
 * @param max - the bound, in code points
 * @param suffix - marker appended when truncation occurred
 * @returns `value` unchanged, or its first `max` code points plus `suffix`
 */
export function capCodePoints(
    value: string,
    max: number,
    suffix: string
): string {
    const points = [...value]
    if (points.length <= max) return value
    return `${points.slice(0, max).join('')}${suffix}`
}
