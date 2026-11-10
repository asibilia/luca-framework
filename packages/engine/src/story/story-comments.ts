import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import { renderStorySummary } from './story-render'
import { readStory, type Story, type StoryRead } from './story-schema'

/**
 * A story as PR comments (#738), for the shared home of a story.
 *
 * A story is packed into one or more comment bodies. Each starts with a
 * hidden marker line, so a writer can find its own comments again and a
 * reader can find the story:
 *
 *   <!-- luca-pr-story v=1 part=1/2 head=<sha> sha256=<hex> -->
 *
 * The first comment then holds the readable summary. Every comment ends
 * with a folded block holding one piece of the story's JSON, base64
 * encoded so that markdown inside the story can't break the block. The
 * pieces are joined in `part` order; `sha256` is the hash of the whole
 * JSON text, so a reader can tell a half-updated story from a whole one.
 *
 * It uses Node's own modules only, so a review app can import it too.
 */

/**
 * The longest comment body GitHub accepts, in characters: a longer one is
 * refused with "Body is too long (maximum is 65536 characters)".
 */
export const GITHUB_COMMENT_LIMIT = 65_536

/**
 * The most bytes one story comment may take. Under GitHub's limit with
 * room to spare, and counted in bytes, which is never less than characters.
 */
export const STORY_COMMENT_BYTES = 60_000

/** What every story comment starts with. */
export const STORY_MARKER = '<!-- luca-pr-story '

/** The base64 text is wrapped at this width. */
const LINE_WIDTH = 120

/** The fence that opens a story data block. */
const DATA_FENCE = '```luca-pr-story'

const MARKER_LINE =
    /^<!-- luca-pr-story v=(\d+) part=(\d+)\/(\d+) head=([0-9a-f]{40}) sha256=([0-9a-f]{64}) -->/

const DATA_BLOCK = /```luca-pr-story\n([A-Za-z0-9+/=\n]*?)\n?```/

const bytesOf = (text: string) => Buffer.byteLength(text, 'utf8')

const wrap = (text: string): string =>
    (text.match(new RegExp(`.{1,${LINE_WIDTH}}`, 'g')) ?? []).join('\n')

/** Cuts text to at most `max_bytes` bytes, at a line end, with a note. */
const cutToBytes = ({
    text,
    max_bytes,
}: {
    text: string
    max_bytes: number
}): string => {
    if (bytesOf(text) <= max_bytes) return text
    const note = '\n\n…(cut short; the full story is in the data below)'
    const lines = text.split('\n')
    while (lines.length > 1 && bytesOf(lines.join('\n') + note) > max_bytes) {
        lines.pop()
    }
    return lines.join('\n') + note
}

/** True when a comment body is one of a story's comments. */
export const isStoryComment = ({ body }: { body: string }): boolean =>
    MARKER_LINE.test(body)

/**
 * Packs a story into comment bodies, each within `max_bytes`. The first
 * holds the readable summary; all hold a piece of the data.
 *
 * @example
 * const bodies = packStory({ story }) // post bodies[0], then bodies[1], ...
 */
export const packStory = ({
    story,
    max_bytes = STORY_COMMENT_BYTES,
}: {
    story: Story
    max_bytes?: number
}): string[] => {
    const json = JSON.stringify(story)
    const sha256 = createHash('sha256').update(json).digest('hex')
    const encoded = Buffer.from(json, 'utf8').toString('base64')
    const marker = (part: number, parts: number) =>
        `${STORY_MARKER}v=${story.schema_version} part=${part}/${parts} head=${story.head_sha} sha256=${sha256} -->`
    const fold = (piece: string) =>
        [
            '<details>',
            '<summary>Story data (for the review app)</summary>',
            '',
            DATA_FENCE,
            wrap(piece),
            '```',
            '',
            '</details>',
        ].join('\n')

    const firstBody = (summary: string, piece: string, parts: number) =>
        `${marker(1, parts)}\n${summary}\n\n${fold(piece)}\n`
    const laterBody = (piece: string, part: number, parts: number) =>
        `${marker(part, parts)}\nStory data, part ${part} of ${parts}. The readable summary is in the first story comment.\n\n${fold(piece)}\n`

    // How much base64 fits next to `frame_bytes` of everything else: each
    // full line of it costs one more byte, for its line break.
    const room = (frame_bytes: number) =>
        Math.floor(
            ((max_bytes - frame_bytes) * LINE_WIDTH) / (LINE_WIDTH + 1)
        ) - LINE_WIDTH
    const later_room = room(bytesOf(laterBody('', 999, 999)))
    if (later_room < LINE_WIDTH) {
        throw new Error(
            `max_bytes ${max_bytes} is too small for a story comment`
        )
    }
    // The summary may take up to half of the first comment.
    const summary = cutToBytes({
        text: renderStorySummary({ story }),
        max_bytes: Math.floor(max_bytes / 2),
    })
    const first_room = Math.max(room(bytesOf(firstBody(summary, '', 999))), 0)

    const pieces = [encoded.slice(0, first_room)]
    for (let at = first_room; at < encoded.length; at += later_room) {
        pieces.push(encoded.slice(at, at + later_room))
    }
    return pieces.map((piece, at) =>
        at === 0
            ? firstBody(summary, piece, pieces.length)
            : laterBody(piece, at + 1, pieces.length)
    )
}

/** What looking for a story in a PR's comments found. */
export type StoryUnpack =
    | StoryRead
    /** No comment carries a story. */
    | { status: 'none' }
    /** Story comments are there, but don't add up to a whole story. */
    | { status: 'broken'; reason: string }

/**
 * Finds the story in a PR's comment bodies and reads it. Other comments
 * are skipped, and the order doesn't matter. When comments of two stories
 * are mixed (an update that stopped halfway), the newest whole one wins:
 * the one whose comments come last in `bodies`.
 *
 * @example
 * const found = unpackStory({ bodies: comments.map((comment) => comment.body) })
 * if (found.status === 'ok') show(found.story)
 */
export const unpackStory = ({ bodies }: { bodies: string[] }): StoryUnpack => {
    const parts = bodies.flatMap((body) => {
        const marker = MARKER_LINE.exec(body)
        if (!marker) return []
        const [, version, part, total, head_sha, sha256] = marker
        return [
            {
                version: Number(version),
                part: Number(part),
                total: Number(total),
                head_sha: head_sha ?? '',
                sha256: sha256 ?? '',
                data: (DATA_BLOCK.exec(body)?.[1] ?? '').replace(/\s/g, ''),
            },
        ]
    })
    if (parts.length === 0) return { status: 'none' }

    const hashes = [...new Set(parts.map(({ sha256 }) => sha256))].toReversed()
    for (const sha256 of hashes) {
        const mine = parts.filter((part) => part.sha256 === sha256)
        const total = mine[0]?.total ?? 0
        const ordered = Array.from({ length: total }, (_, at) =>
            mine.find(({ part }) => part === at + 1)
        )
        if (ordered.some((part) => part === undefined)) continue
        const json = Buffer.from(
            ordered.map((part) => part?.data ?? '').join(''),
            'base64'
        ).toString('utf8')
        if (createHash('sha256').update(json).digest('hex') !== sha256) continue
        try {
            return readStory({ value: JSON.parse(json) })
        } catch {
            continue
        }
    }
    return {
        status: 'broken',
        reason: 'the story comments are incomplete or were edited; run /luca-pr-prep again',
    }
}

/** One change to make to a PR's comments. */
export type CommentAction =
    | { action: 'update'; comment_id: number; body: string }
    | { action: 'create'; body: string }
    | { action: 'delete'; comment_id: number }

/**
 * The changes that turn a PR's old story comments into the new ones:
 * old comments are rewritten in place, in order, so a re-run replaces a
 * story instead of adding one; extra new parts are created, extra old
 * comments deleted. Comments that aren't a story's are never touched.
 *
 * @example
 * planCommentSync({ existing: [{ comment_id: 7, body: old }], bodies: [a, b] })
 * // [{ action: 'update', comment_id: 7, body: a }, { action: 'create', body: b }]
 */
export const planCommentSync = ({
    existing,
    bodies,
}: {
    existing: { comment_id: number; body: string }[]
    bodies: string[]
}): CommentAction[] => {
    const own = existing
        .filter(({ body }) => isStoryComment({ body }))
        .toSorted((a, b) => a.comment_id - b.comment_id)
    const writes = bodies.flatMap((body, at): CommentAction[] => {
        const old = own[at]
        if (old === undefined) return [{ action: 'create', body }]
        if (old.body === body) return []
        return [{ action: 'update', comment_id: old.comment_id, body }]
    })
    const deletes = own.slice(bodies.length).map(
        ({ comment_id }): CommentAction => ({
            action: 'delete',
            comment_id,
        })
    )
    return [...writes, ...deletes]
}
