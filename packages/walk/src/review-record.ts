import { z } from 'zod'

/**
 * The review record (#752, section 12): the hidden line at the end of
 * every review Luca Walk sends, naming the commit reviewed and the files
 * that looked good, so the next visit walks only what changed.
 */

/** The text every review record line starts with. */
export const REVIEW_RECORD_MARKER = '<!-- luca-walk review '

const RECORD_END = ' -->'

export const ReviewRecordSchema = z.object({
    schema_version: z.literal(1),
    commit: z.string().min(1),
    approved_files: z.array(z.string().min(1)),
})
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>

/**
 * The record as one hidden HTML comment. Every hyphen in its JSON is
 * written as `-`, so the comment can never hold `-->`.
 *
 * @example
 * reviewRecordLine({ record: { schema_version: 1, commit: 'abc', approved_files: ['a-b.ts'] } })
 * // '<!-- luca-walk review {"schema_version":1,"commit":"abc","approved_files":["a-b.ts"]} -->'
 */
export const reviewRecordLine = ({
    record,
}: {
    record: ReviewRecord
}): string =>
    `${REVIEW_RECORD_MARKER}${JSON.stringify(record).replaceAll('-', '\\u002d')}${RECORD_END}`
