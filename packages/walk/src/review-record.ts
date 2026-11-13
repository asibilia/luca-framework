import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import type { PullRequestRef } from './pull-request-ref'

import type { Gh } from '../../engine/src/story/story-github'

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
 * written as JSON's escape for it (a backslash, then `u002d`), so the comment can never hold `-->`.
 *
 * @example
 * reviewRecordLine({ record: { schema_version: 1, commit: 'abc', approved_files: ['a-b.ts'] } })
 * // '<!-- luca-walk review {"schema_version":1,"commit":"abc","approved_files":["a\\u002db.ts"]} -->'
 */
export const reviewRecordLine = ({
    record,
}: {
    record: ReviewRecord
}): string =>
    `${REVIEW_RECORD_MARKER}${JSON.stringify(record).replaceAll('-', '\\u002d')}${RECORD_END}`

const parseRecord = (json: string): ReviewRecord | null => {
    try {
        const parsed = ReviewRecordSchema.safeParse(JSON.parse(json))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

/**
 * The record in a review's text: its last record line, read with the
 * schema. Null when there is none or it fails the schema.
 *
 * @example
 * readReviewRecord({ text: `Looks close.\n\n${line}` }) // { schema_version: 1, commit, approved_files }
 */
export const readReviewRecord = ({
    text,
}: {
    text: string
}): ReviewRecord | null => {
    const line = text
        .split('\n')
        .map((each) => each.trim())
        .findLast(
            (each) =>
                each.startsWith(REVIEW_RECORD_MARKER) &&
                each.endsWith(RECORD_END)
        )
    if (line === undefined) return null
    return parseRecord(
        line.slice(REVIEW_RECORD_MARKER.length, -RECORD_END.length)
    )
}

/** The local record of one pull request. */
const recordPath = ({
    walk_dir,
    ref,
}: {
    walk_dir: string
    ref: PullRequestRef
}): string =>
    join(walk_dir, 'reviewed', ...ref.repo.split('/'), `pr-${ref.number}.json`)

/** Writes the local record of `ref` after a send. */
export const saveReviewRecord = async ({
    walk_dir,
    ref,
    record,
}: {
    walk_dir: string
    ref: PullRequestRef
    record: ReviewRecord
}): Promise<void> => {
    const path = recordPath({ walk_dir, ref })
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(record, null, 4)}\n`)
}

const ReviewListSchema = z.array(
    z.array(
        z.object({
            id: z.number().int(),
            user: z.object({ login: z.string() }).nullable(),
            state: z.string(),
            body: z.string().nullable(),
            submitted_at: z.string().nullable().optional(),
        })
    )
)
export type OwnReview = z.infer<typeof ReviewListSchema>[number][number]

/**
 * The signed-in user's login and their reviews on `ref`, pending ones
 * too; throws gh's error.
 */
export const ownReviews = async ({
    gh,
    ref,
}: {
    gh: Gh
    ref: PullRequestRef
}): Promise<{ login: string; reviews: OwnReview[] }> => {
    const user = await gh({ args: ['api', 'user', '--jq', '.login'] })
    if (!user.ok) throw new Error(user.stderr.trim() || 'gh failed')
    const login = user.stdout.trim()
    const listed = await gh({
        args: [
            'api',
            `repos/${ref.repo}/pulls/${ref.number}/reviews?per_page=100`,
            '--paginate',
            '--slurp',
        ],
    })
    if (!listed.ok) throw new Error(listed.stderr.trim() || 'gh failed')
    let pages: z.infer<typeof ReviewListSchema>
    try {
        pages = ReviewListSchema.parse(JSON.parse(listed.stdout))
    } catch {
        throw new Error(`gh answered something else: ${listed.stdout.trim()}`)
    }
    return {
        login,
        reviews: pages.flat().filter((review) => review.user?.login === login),
    }
}

/** The record in the signed-in user's newest submitted review that holds one. */
const recordOnGitHub = async ({
    gh,
    ref,
}: {
    gh: Gh
    ref: PullRequestRef
}): Promise<ReviewRecord | null> => {
    const own = await ownReviews({ gh, ref }).catch(() => null)
    if (own === null) return null
    const newest = own.reviews
        .filter(
            (review) =>
                review.state !== 'PENDING' &&
                typeof review.submitted_at === 'string' &&
                (review.body ?? '').includes(REVIEW_RECORD_MARKER)
        )
        .toSorted((a, b) =>
            (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '')
        )
        .at(-1)
    return newest === undefined
        ? null
        : readReviewRecord({ text: newest.body ?? '' })
}

/**
 * The record of the owner's last review of `ref`: the local one, else the
 * one in their newest review on GitHub. Null when there is none.
 */
export const readLastReview = async ({
    walk_dir,
    gh,
    ref,
}: {
    walk_dir: string
    gh: Gh
    ref: PullRequestRef
}): Promise<ReviewRecord | null> => {
    const local = await readFile(recordPath({ walk_dir, ref }), 'utf8').then(
        parseRecord,
        () => null
    )
    return local ?? (await recordOnGitHub({ gh, ref }))
}
