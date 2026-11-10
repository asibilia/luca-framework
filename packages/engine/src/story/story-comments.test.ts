import { Buffer } from 'node:buffer'

import { describe, expect, test } from 'bun:test'

import {
    GITHUB_COMMENT_LIMIT,
    isStoryComment,
    packStory,
    planCommentSync,
    STORY_COMMENT_BYTES,
    unpackStory,
} from './story-comments'
import { longStory, sha, story } from './testing/story-fixtures'

describe('a story as PR comments', () => {
    test('a small story is one comment: a readable summary on top, the data folded below, and it reads back', () => {
        const bodies = packStory({ story: story() })
        expect(bodies).toHaveLength(1)
        const [body = ''] = bodies
        expect(body.startsWith('<!-- luca-pr-story v=1 part=1/1 head=')).toBe(
            true
        )
        expect(body.indexOf('## Review story')).toBeLessThan(
            body.indexOf('<details>')
        )
        expect(body).toContain('**Enhancement.** A stuck ticket is retried')
        expect(body).toContain('1. `src/core/run-ticket.ts` **(start here)**')
        expect(body).toContain(
            '**No classes** (AGENTS.md), `src/core/run-ticket.ts:44`'
        )
        expect(unpackStory({ bodies })).toEqual({
            status: 'ok',
            story: story(),
        })
    })

    test('a long story spills into more comments, each within the limit, and reads back whatever the order', () => {
        const long = longStory({ walk_stops: 150 })
        const bodies = packStory({ story: long })
        expect(bodies.length).toBeGreaterThan(1)
        for (const body of bodies) {
            expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(
                STORY_COMMENT_BYTES
            )
            expect(body.length).toBeLessThan(GITHUB_COMMENT_LIMIT)
            expect(isStoryComment({ body })).toBe(true)
        }
        const mixed = [
            'LGTM',
            ...bodies.toReversed(),
            '<!-- some other bot -->',
        ]
        expect(unpackStory({ bodies: mixed })).toEqual({
            status: 'ok',
            story: long,
        })

        const small = packStory({ story: long, max_bytes: 4000 })
        expect(
            Math.max(...small.map((body) => Buffer.byteLength(body, 'utf8')))
        ).toBeLessThanOrEqual(4000)
        expect(unpackStory({ bodies: small })).toEqual({
            status: 'ok',
            story: long,
        })
    })

    test('no story, half a story, and an old story next to a new one are told apart', () => {
        expect(
            isStoryComment({
                body: 'A comment that quotes <!-- luca-pr-story in the middle',
            })
        ).toBe(false)
        expect(unpackStory({ bodies: ['LGTM', 'Looks fine'] })).toEqual({
            status: 'none',
        })

        const parts = packStory({ story: longStory({ walk_stops: 150 }) })
        expect(unpackStory({ bodies: parts.slice(1) }).status).toBe('broken')
        const edited = parts.map((body) =>
            body.replace(/\n[A-Za-z0-9+/]{120}\n/, '\n')
        )
        expect(unpackStory({ bodies: edited }).status).toBe('broken')

        const newer = { ...story(), head_sha: sha({ char: 'c' }) }
        const both = [
            ...packStory({ story: story() }),
            ...packStory({ story: newer }),
        ]
        expect(unpackStory({ bodies: both })).toEqual({
            status: 'ok',
            story: newer,
        })
    })

    test("a re-run rewrites the story's own comments in place and leaves every other comment alone", () => {
        const old = packStory({
            story: longStory({ walk_stops: 150 }),
            max_bytes: 30_000,
        })
        const existing = [
            { comment_id: 5, body: 'LGTM' },
            ...old.map((body, at) => ({ comment_id: 10 + at, body })),
        ]
        const [next = ''] = packStory({ story: story() })

        const shrink = planCommentSync({ existing, bodies: [next] })
        expect(shrink[0]).toEqual({
            action: 'update',
            comment_id: 10,
            body: next,
        })
        expect(shrink.slice(1)).toEqual(
            old
                .slice(1)
                .map((_, at) => ({ action: 'delete', comment_id: 11 + at }))
        )

        expect(
            planCommentSync({
                existing: [{ comment_id: 5, body: 'LGTM' }],
                bodies: [next],
            })
        ).toEqual([{ action: 'create', body: next }])
        expect(
            planCommentSync({
                existing: [{ comment_id: 10, body: next }],
                bodies: [next],
            })
        ).toEqual([])
    })
})
