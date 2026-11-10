import { describe, expect, test } from 'bun:test'

import {
    COVERS_MARKER,
    coversBlock,
    postedSummaries,
    summaryCover,
    summaryCovers,
    summaryHead,
} from './summary-cover'

const HEAD = '61bafd605699cf0ca3e150363c3ee7cc77b24a58'

describe('a summary’s hidden lines', () => {
    test('the covers block lists ids one per line, and reads back', () => {
        const block = coversBlock(['rv-5846885354', 'alert-7-src/a file.ts-4'])
        expect(block).toBe(
            `${COVERS_MARKER}\nrv-5846885354\nalert-7-src/a file.ts-4\n-->`
        )
        const body = `<!-- luca-pr-address summary iteration=2 head=${HEAD} -->\n${block}\n## Review addressed, iteration 2`
        expect(summaryCovers(body)).toEqual([
            'rv-5846885354',
            'alert-7-src/a file.ts-4',
        ])
        expect(summaryHead(body)).toBe(HEAD)
        expect(summaryCovers(coversBlock([]))).toEqual([])
    })

    test('a summary from before the block has none, which is not the same as an empty one', () => {
        const old = `<!-- luca-pr-address summary iteration=1 head=${HEAD} -->\n## Review addressed, iteration 1`
        expect(summaryCovers(old)).toBeNull()
        expect(summaryCovers(`${COVERS_MARKER}\nrv-1`)).toBeNull()
        expect(summaryHead('## not a summary')).toBe('')
    })
})

describe('what the summaries on a PR answer', () => {
    const comments = [
        { body: 'just chatting', created_at: '2026-11-04T00:00:00Z' },
        {
            body: `<!-- luca-pr-address summary iteration=2 head=bbb -->\n${coversBlock(['rv-3', 'rc-4'])}`,
            created_at: '2026-11-03T00:00:00Z',
        },
        {
            body: `<!-- luca-pr-address summary iteration=1 head=${HEAD} -->\n## old shape`,
            created_at: '2026-11-01T00:00:00Z',
        },
        {
            body: `<!-- luca-pr-address summary iteration=1 head=ccc -->\n${coversBlock(['rv-1'])}`,
            created_at: '2026-11-02T00:00:00Z',
        },
    ]

    test('only this skill’s summaries count, oldest first', () => {
        expect(postedSummaries(comments).map(({ at }) => at)).toEqual([
            '2026-11-01T00:00:00Z',
            '2026-11-02T00:00:00Z',
            '2026-11-03T00:00:00Z',
        ])
    })

    test('every listed id is answered; an old summary keeps the old rule for itself only', () => {
        const cover = summaryCover(postedSummaries(comments))
        expect([...cover.ids].toSorted()).toEqual(['rc-4', 'rv-1', 'rv-3'])
        expect(cover.legacy_at).toBe('2026-11-01T00:00:00Z')
        expect([...cover.legacy_heads]).toEqual([HEAD])
        expect(cover.last_at).toBe('2026-11-03T00:00:00Z')
        expect(summaryCover([])).toEqual({
            ids: new Set(),
            legacy_at: '',
            legacy_heads: new Set(),
            last_at: '',
        })
    })
})
