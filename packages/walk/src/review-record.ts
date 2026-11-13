import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import { CommitIdSchema } from './commit-id'
import type { PullRequestRef } from './pull-request-ref'
import { isSignedIn } from './signed-in'

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
    commit: CommitIdSchema,
    approved_files: z.array(z.string().min(1)),
    /**
     * The fingerprints of the drafts the review holds (`draftFingerprint`
     * in `already-sent.ts`), in the record line on GitHub only, so a
     * retried send can tell which drafts GitHub already took.
     */
    sent_drafts: z.array(z.string().min(1)).optional(),
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
            commit_id: z.string().nullable().optional(),
            submitted_at: z.string().nullable().optional(),
        })
    )
)
export type OwnReview = z.infer<typeof ReviewListSchema>[number][number]

/**
 * The reviews on `ref` by the signed-in user, `login`, pending ones too;
 * throws gh's error.
 */
export const ownReviews = async ({
    gh,
    ref,
    login,
}: {
    gh: Gh
    ref: PullRequestRef
    login: string
}): Promise<OwnReview[]> => {
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
    return pages
        .flat()
        .filter((review) =>
            isSignedIn({ author: review.user?.login ?? null, login })
        )
}

/**
 * The record in the newest submitted review by the signed-in user,
 * `login`, that holds one; none when the login is unknown.
 */
const recordOnGitHub = async ({
    gh,
    ref,
    login,
}: {
    gh: Gh
    ref: PullRequestRef
    login: string | null
}): Promise<ReviewRecord | null> => {
    if (login === null) return null
    const own = await ownReviews({ gh, ref, login }).catch(() => null)
    if (own === null) return null
    const newest = own
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
 * one in their newest review on GitHub (by `login`, the signed-in user).
 * Null when there is none. The local record wins: it is written after
 * every send, in every repo, while a repo that isn't yours (#766) gets no
 * record line, so an older line on GitHub may be out of date.
 */
export const readLastReview = async ({
    walk_dir,
    gh,
    ref,
    login,
}: {
    walk_dir: string
    gh: Gh
    ref: PullRequestRef
    login: string | null
}): Promise<ReviewRecord | null> => {
    const local = await readFile(recordPath({ walk_dir, ref }), 'utf8').then(
        parseRecord,
        () => null
    )
    return local ?? (await recordOnGitHub({ gh, ref, login }))
}
