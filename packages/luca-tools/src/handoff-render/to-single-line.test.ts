/**
 * Unit suite for the SHARED envelope-text escaper.
 *
 * `toSingleLine` has two consumers with different threat models — the
 * SessionStart notice (agent context, turn zero, no human) and the
 * `luca handoff list` / `accept` triage views (human reading a terminal) —
 * and one implementation. The renderer suite proves the notice's end-to-end
 * properties; this suite pins the escaper itself, so a change made for one
 * consumer cannot silently weaken the other.
 *
 * Every non-printable character here is built with `String.fromCharCode`
 * rather than written as a source escape: a literal control character is
 * invisible in review and is trivially mangled in transit, which would leave
 * a test that reads as thorough while asserting nothing.
 */
import { describe, expect, test } from 'bun:test'

import { capCodePoints, toSingleLine } from './to-single-line.ts'

const LT = String.fromCharCode(60)
const GT = String.fromCharCode(62)
const NL = String.fromCharCode(10)
const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)
const NEL = String.fromCharCode(0x85)
const RLO = String.fromCharCode(0x202e)
const ZWSP = String.fromCharCode(0x200b)
const BOM = String.fromCharCode(0xfeff)

describe('toSingleLine — the delimiter alphabet (MF-1)', () => {
    test('angle brackets never survive, in either direction', () => {
        const out = toSingleLine(`a${LT}b${GT}c`)
        expect(out.includes(LT)).toBe(false)
        expect(out.includes(GT)).toBe(false)
        // Escaped, not dropped: the surrounding text is intact and the
        // attempt stays visible to whoever is reading.
        expect(out).toBe('a\\x3cb\\x3ec')
    })

    test('a value passes through unchanged when it needs no escaping', () => {
        // Fail-closed: an escaper that mangled everything would satisfy every
        // negative assertion above.
        expect(toSingleLine('/repos/my-service')).toBe('/repos/my-service')
    })
})

describe('toSingleLine — line terminators (MF-3)', () => {
    test('C0 newline still escapes to the named short form', () => {
        expect(toSingleLine(`a${NL}b`)).toBe('a\\nb')
    })

    test('U+2028, U+2029 and NEL are escaped, so one line stays one line', () => {
        const out = toSingleLine(`a${LS}b${PS}c${NEL}d`)
        for (const terminator of [LS, PS, NEL]) {
            expect(out.includes(terminator)).toBe(false)
        }
        expect(out).toBe('a\\u2028b\\u2029c\\x85d')
    })

    test('bidi overrides and zero-width characters are escaped', () => {
        const out = toSingleLine(`a${RLO}b${ZWSP}c${BOM}d`)
        for (const invisible of [RLO, ZWSP, BOM]) {
            expect(out.includes(invisible)).toBe(false)
        }
        expect(out).toBe('a\\u202eb\\u200bc\\ufeffd')
    })
})

describe('toSingleLine — truncation (MF-5)', () => {
    test('the cap counts code points, so no surrogate pair is split', () => {
        // 300 astral characters is 600 code UNITS but 300 code POINTS; a
        // code-unit slice at 256 would land mid-pair and emit a lone
        // surrogate, which cannot be encoded as UTF-8.
        const out = toSingleLine('🙂'.repeat(300))
        expect(out.endsWith('…(truncated)')).toBe(true)
        const lone = [...out].some((c) => {
            const code = c.charCodeAt(0)
            return code >= 0xd800 && code <= 0xdfff && c.length === 1
        })
        expect(lone).toBe(false)
        // Exactly the bound, in code points — not merely "at most", which
        // zero would also satisfy.
        expect([...out.replace('…(truncated)', '')]).toHaveLength(256)
    })
})

describe('capCodePoints', () => {
    test('returns the input untouched when it fits', () => {
        expect(capCodePoints('abc', 5, '…')).toBe('abc')
        expect(capCodePoints('abcde', 5, '…')).toBe('abcde')
    })

    test('cuts on code-point boundaries and appends the marker', () => {
        expect(capCodePoints('a🙂b🙂c', 3, '…')).toBe('a🙂b…')
    })
})
