/**
 * Visible-width helpers (used by the ask_user label-truncation workaround).
 *
 * Pi-tui (the renderer underneath mastracode's TUI) computes line widths by
 * stripping ANSI escapes and counting *display columns* — so a CJK glyph or
 * emoji counts as 2 cells, ZWJ-joined sequences count as one grapheme, and
 * `\x1b[31m` counts as zero. Our truncation logic must use the same metric or
 * we can either (a) over-truncate (cutting off ASCII labels too aggressively
 * when they contain ANSI codes), or (b) under-truncate (failing to clip a
 * short-but-wide CJK label and re-tripping the original width assertion).
 *
 * We implement a minimal local copy here so the patch doesn't depend on the
 * shape of mastracode's transitive deps. Tracks pi-tui's `visibleWidth` /
 * `truncateToWidth` semantics for the cases that show up in `ask_user`
 * option labels: ASCII, CJK/emoji, and embedded ANSI styling.
 */

// CSI / OSC / SGR / cursor-control escapes — matches pi-tui's strip pattern.
export const ANSI_ESCAPE_RE =
    // eslint-disable-next-line no-control-regex
    /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_])/g

let cachedSegmenter: Intl.Segmenter | null = null
function getSegmenter(): Intl.Segmenter {
    if (!cachedSegmenter) {
        cachedSegmenter = new Intl.Segmenter(undefined, {
            granularity: 'grapheme',
        })
    }
    return cachedSegmenter
}

// East-Asian Wide / Fullwidth + emoji ranges. Anything in here counts as 2
// columns; everything else (excluding zero-width / control chars) counts as 1.
//
// We err on the side of *over*-reporting width for ambiguous emoji rather than
// under-reporting: an over-truncated label is ugly, but an under-truncated one
// re-trips the pi-tui line-width assertion this helper exists to prevent.
export function graphemeWidth(grapheme: string): number {
    if (grapheme.length === 0) return 0
    const cp = grapheme.codePointAt(0)
    if (cp === undefined) return 0
    // Zero-width: control chars, combining marks, ZWJ/ZWNJ, variation selectors.
    if (cp < 0x20 || cp === 0x7f) return 0
    if (cp >= 0x0300 && cp <= 0x036f) return 0 // combining diacriticals
    if (cp === 0x200b || cp === 0x200c || cp === 0x200d) return 0 // ZW(N)J
    if (cp >= 0xfe00 && cp <= 0xfe0f) return 0 // variation selectors

    // Multi-codepoint sequences that render as a single wide glyph:
    //   * VS16 (U+FE0F) forces emoji presentation — e.g. ❤️, ☀️, ✌️ — for
    //     base chars in U+2600–U+27BF that we'd otherwise treat as width 1.
    //   * Keycap sequences (digit/`#`/`*` + FE0F + U+20E3) — e.g. 1️⃣, #️⃣.
    //   * Regional indicator pairs (🇺🇸 etc.) — covered by the 0x1F1E6 range below.
    if (grapheme.length > 1) {
        if (grapheme.includes('\uFE0F')) return 2
        if (grapheme.includes('\u20E3')) return 2 // combining keycap
    }

    // Wide ranges (CJK, Hangul, fullwidth, emoji blocks).
    if (
        (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
        (cp >= 0x231a && cp <= 0x231b) || // ⌚⌛
        (cp >= 0x2329 && cp <= 0x232a) || // 〈〉
        (cp >= 0x23e9 && cp <= 0x23ec) || // ⏩⏪⏫⏬
        cp === 0x23f0 ||
        cp === 0x23f3 || // ⏰⏳
        (cp >= 0x25fd && cp <= 0x25fe) || // ◽◾
        (cp >= 0x2614 && cp <= 0x2615) || // ☔☕
        (cp >= 0x2648 && cp <= 0x2653) || // zodiac
        cp === 0x267f || // ♿
        cp === 0x2693 || // ⚓
        cp === 0x26a1 || // ⚡
        (cp >= 0x26aa && cp <= 0x26ab) || // ⚪⚫
        (cp >= 0x26bd && cp <= 0x26be) || // ⚽⚾
        (cp >= 0x26c4 && cp <= 0x26c5) || // ⛄⛅
        cp === 0x26ce || // ⛎
        cp === 0x26d4 || // ⛔
        cp === 0x26ea || // ⛪
        (cp >= 0x26f2 && cp <= 0x26f3) || // ⛲⛳
        cp === 0x26f5 || // ⛵
        cp === 0x26fa || // ⛺
        cp === 0x26fd || // ⛽
        cp === 0x2705 || // ✅
        (cp >= 0x270a && cp <= 0x270b) || // ✊✋
        cp === 0x2728 || // ✨
        cp === 0x274c || // ❌
        cp === 0x274e || // ❎
        (cp >= 0x2753 && cp <= 0x2755) || // ❓❔❕
        cp === 0x2757 || // ❗
        (cp >= 0x2795 && cp <= 0x2797) || // ➕➖➗
        cp === 0x27b0 || // ➰
        cp === 0x27bf || // ➿
        (cp >= 0x2b1b && cp <= 0x2b1c) || // ⬛⬜
        cp === 0x2b50 || // ⭐
        cp === 0x2b55 || // ⭕
        (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals / symbols
        (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana/Katakana/CJK
        (cp >= 0x3400 && cp <= 0x4dbf) || // CJK ext A
        (cp >= 0x4e00 && cp <= 0x9fff) || // CJK unified
        (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
        (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
        (cp >= 0xf900 && cp <= 0xfaff) || // CJK compat
        (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compat forms
        (cp >= 0xff00 && cp <= 0xff60) || // Fullwidth
        (cp >= 0xffe0 && cp <= 0xffe6) || // Fullwidth signs
        (cp >= 0x1f1e6 && cp <= 0x1f1ff) || // Regional indicators
        (cp >= 0x1f300 && cp <= 0x1f64f) || // Misc symbols & pictographs / Emoticons
        (cp >= 0x1f680 && cp <= 0x1f6ff) || // Transport & map
        (cp >= 0x1f700 && cp <= 0x1f7ff) || // Geometric / alchemical
        (cp >= 0x1f900 && cp <= 0x1f9ff) || // Supplemental symbols & pictographs
        (cp >= 0x1fa70 && cp <= 0x1faff) || // Symbols & pictographs ext-A
        (cp >= 0x20000 && cp <= 0x3fffd) // CJK ext B–G
    ) {
        return 2
    }
    return 1
}

export function visibleWidth(str: string): number {
    const stripped = str.replace(ANSI_ESCAPE_RE, '')
    let width = 0
    for (const grapheme of getSegmenter().segment(stripped)) {
        width += graphemeWidth(grapheme.segment)
    }
    return width
}

/**
 * Clip `str` to at most `maxWidth` display columns, replacing the trailing
 * run with `ellipsis` when truncation occurs. ANSI codes are dropped (the
 * truncated string is plain text — sufficient for `ask_user` option labels,
 * which mastracode renders inside its own theme.fg("dim", …) wrapper).
 *
 * If `maxWidth <= 0`, returns an empty string. If `maxWidth` is too small to
 * even hold the ellipsis, returns the ellipsis truncated to the budget. We
 * never produce output wider than `maxWidth`.
 */
export function clipToVisibleWidth(
    str: string,
    maxWidth: number,
    ellipsis: string = '…'
): string {
    if (maxWidth <= 0) return ''
    const stripped = str.replace(ANSI_ESCAPE_RE, '')
    const ellipsisWidth = visibleWidth(ellipsis)
    // If the budget can't fit the ellipsis, return as much of the ellipsis as
    // we can (typically '' for a width-0 budget; '…' fits in 1 cell).
    if (maxWidth < ellipsisWidth) {
        let acc = ''
        let w = 0
        for (const g of getSegmenter().segment(ellipsis)) {
            const gw = graphemeWidth(g.segment)
            if (w + gw > maxWidth) break
            acc += g.segment
            w += gw
        }
        return acc
    }
    const target = maxWidth - ellipsisWidth
    let acc = ''
    let w = 0
    for (const g of getSegmenter().segment(stripped)) {
        const gw = graphemeWidth(g.segment)
        if (w + gw > target) {
            return acc + ellipsis
        }
        acc += g.segment
        w += gw
    }
    // String already fits — caller should have checked, but guard anyway.
    return acc
}
