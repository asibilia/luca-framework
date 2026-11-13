import { describe, expect, test } from 'bun:test'

import {
    readReviewRecord,
    REVIEW_RECORD_MARKER,
    reviewRecordLine,
} from './review-record'

import { reviewBodyFindings } from '../../engine/skills/luca-pr-address/scripts/pr-findings'

/**
 * The review record's text (#762, spec #752 section 12): the hidden line
 * at the end of every review Luca Walk sends, and reading it back.
 */

/** `/luca-pr-address`'s review findings of one submitted review with `body`. */
const findingsOf = (body: string) =>
    reviewBodyFindings({
        reviews: [
            {
                id: 7,
                body,
                state: 'COMMENTED',
                user: { login: 'octocat' },
                submitted_at: '2026-11-12T10:00:00Z',
                html_url: 'https://github.com/octocat/hello-world/pull/12',
            },
        ],
        owner: 'octocat',
        cover: { ids: new Set(), legacy_at: '' },
    })

const RECORD = {
    schema_version: 1 as const,
    commit: 'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1',
    approved_files: ['src/my-file.ts', 'src/a.ts'],
}

describe('the review record line (#762)', () => {
    test('a hyphen in an approved file is written as its JSON escape, and no hyphen sits inside the comment', () => {
        const line = reviewRecordLine({ record: RECORD })

        expect(line.startsWith(REVIEW_RECORD_MARKER)).toBe(true)
        expect(line.endsWith(' -->')).toBe(true)
        expect(line).toContain('src/my\\u002dfile.ts')
        const inside = line.slice(REVIEW_RECORD_MARKER.length, -' -->'.length)
        expect(inside).not.toContain('-')
    })

    test('reading a record line back gives the commit and approved files written', () => {
        const line = reviewRecordLine({ record: RECORD })

        const read = readReviewRecord({ text: `Looks close.\n\n${line}` })

        expect(read?.commit).toBe(RECORD.commit)
        expect(read?.approved_files).toEqual(RECORD.approved_files)
    })

    test('/luca-pr-address finds nothing in a review that is only a record line', () => {
        const line = reviewRecordLine({ record: RECORD })

        expect(findingsOf(line)).toEqual([])
    })

    test("/luca-pr-address finds a review's text without its record line", () => {
        const line = reviewRecordLine({ record: RECORD })

        const findings = findingsOf(`Rename the helper.\n\n${line}`)

        expect(findings.map(({ body }) => body)).toEqual(['Rename the helper.'])
    })
})
