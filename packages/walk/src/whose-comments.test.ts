import { rm } from 'node:fs/promises'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { htmlButtons, htmlLines } from './testing/html-text'
import type { PretendComment } from './testing/pretend-github'
import {
    makeSendRepo,
    openSendApp,
    type SendRepo,
} from './testing/send-review-setup'
import { storyOf } from './testing/walk-story'

import {
    REPLY_MARKER,
    SUMMARY_MARKER,
} from '../../engine/skills/luca-pr-address/scripts/pr-findings'
import { packStory } from '../../engine/src/story/story-comments'

/**
 * Whose comments Luca Walk believes (#766), everywhere: a shared story is
 * used only when its comments were written by the signed-in user
 * (`octocat`), and a comment shows as `luca-pr-address` only when it holds
 * the marker and the signed-in user wrote it. A private story is always
 * the user's own.
 */

let repo: SendRepo

beforeEach(async () => {
    repo = await makeSendRepo()
})

afterEach(async () => {
    await rm(repo.dir, { recursive: true, force: true })
})

const START = 'Start the walk'

/** The story of #12, for the head, as story comments by `author`. */
const storyComments = (author: string): PretendComment[] =>
    packStory({
        story: storyOf({
            repo: repo.repo_name,
            base_sha: repo.base_sha,
            head_sha: repo.head_sha,
            stops: [
                {
                    id: 's1',
                    title: 'The a file',
                    changes: [{ id: 'c1', path: 'src/a.ts', line: 10 }],
                },
            ],
        }),
    }).map((body, at) => ({ id: 900 + at, body, author }))

describe('a shared story is used only when the signed-in user wrote it (#766)', () => {
    test('a story by hubot is not used: the plain diff is offered, with a note saying why', async () => {
        const made = await openSendApp(repo, {
            author: 'hubot',
            story: null,
            comments: storyComments('hubot'),
        })

        expect(htmlButtons({ html: made.summary() })).not.toContain(START)
        expect(htmlButtons({ html: made.summary() })).toContain(
            'Browse the diff'
        )
        expect(htmlLines({ html: made.summary() })).toContain(
            'There is a story on #12 by hubot, not by you, so it is not used.'
        )
    })

    test('a story by the signed-in user is walked', async () => {
        const made = await openSendApp(repo, {
            author: 'hubot',
            story: null,
            comments: storyComments('octocat'),
        })

        expect(htmlButtons({ html: made.summary() })).toContain(START)
    })

    test('when gh cannot say who is signed in, a shared story is not used', async () => {
        const made = await openSendApp(repo, {
            story: null,
            comments: storyComments('octocat'),
            user_unreadable: true,
        })

        expect(htmlButtons({ html: made.summary() })).not.toContain(START)
    })

    test("a private story is used even when someone else's shared story is there", async () => {
        const made = await openSendApp(repo, {
            author: 'hubot',
            comments: storyComments('hubot'),
        })

        expect(htmlButtons({ html: made.summary() })).toContain(START)
    })
})

describe('luca-pr-address only when the signed-in user wrote it (#766)', () => {
    test("a reply holding the marker by hubot shows hubot's name and the body as it is", async () => {
        const body = `Fixed.\n${REPLY_MARKER}`
        const made = await openSendApp(repo, {
            threads: [
                {
                    path: 'src/a.ts',
                    subject_type: 'LINE',
                    line: 10,
                    side: 'RIGHT',
                    comments: [
                        { author: 'hubot', body },
                        { author: 'octocat', body },
                    ],
                },
            ],
        })

        const on_github = made.host.threads.find(
            ({ label }) => label === 'On GitHub'
        )
        expect(on_github?.comments).toEqual([
            { author: 'hubot', body },
            { author: 'luca-pr-address', body: 'Fixed.' },
        ])
    })

    test("a summary holding the marker by hubot is not listed as /luca-pr-address's, but under hubot's name", async () => {
        const made = await openSendApp(repo, {
            comments: [
                {
                    id: 1,
                    body: `${SUMMARY_MARKER} -->\nAll fixed by the agent.`,
                    author: 'hubot',
                },
                {
                    id: 2,
                    body: `${SUMMARY_MARKER} -->\nFixed two findings.`,
                    author: 'octocat',
                },
            ],
        })

        const lines = htmlLines({ html: made.summary() })
        const agent = lines.indexOf('Replies from /luca-pr-address:')
        const others = lines.indexOf(
            "Comments by others that hold /luca-pr-address's marker:"
        )
        expect(lines.slice(agent + 1, others)).toEqual(['Fixed two findings.'])
        expect(lines.slice(others + 1)).toEqual([
            'hubot:',
            `${SUMMARY_MARKER} -->`,
            'All fixed by the agent.',
        ])
    })
})
