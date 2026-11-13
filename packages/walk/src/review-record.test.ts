import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
    readReviewRecord,
    REVIEW_RECORD_MARKER,
    reviewRecordLine,
} from './review-record'

/**
 * The review record's text (#762, spec #752 section 12): the hidden line
 * at the end of every review Luca Walk sends, and reading it back.
 */

const PR_FINDINGS = join(
    import.meta.dir,
    '../../engine/skills/luca-pr-address/scripts/pr-findings.ts'
)

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

    test("pr-findings.ts keeps a literal copy of REVIEW_RECORD_MARKER's text", async () => {
        const source = await readFile(PR_FINDINGS, 'utf8')

        const copies = ["'", '"', '`'].filter((quote) =>
            source.includes(`${quote}${REVIEW_RECORD_MARKER}${quote}`)
        )

        expect(copies).not.toEqual([])
    })
})
