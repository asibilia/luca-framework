import { describe, expect, test } from 'bun:test'

import { unpackStory } from './story-comments'
import { postSharedStory, type Gh } from './story-github'
import { saveStoryWith } from './story-save'
import type { Story } from './story-schema'
import { story } from './testing/story-fixtures'

import type { KnownRoots } from '../tracker/redact-private-paths'

/** This computer, as the tests pretend it is. */
const KNOWN: KnownRoots = { home: '/Users/me', worktree_roots: [] }

/** A story whose writer pasted local paths into it. */
const leakyStory = (): Story => {
    const base = story()
    return {
        ...base,
        written_by: 'story-writer in /Users/me/Github/app',
        summary: {
            ...base.summary,
            what_changed:
                'Retries a stuck ticket; see /Users/me/Github/app/src/core/run-ticket.ts',
        },
    }
}

/** A pretend `gh` that keeps a PR's comments. */
const fakeGh = (): { gh: Gh; bodies: () => string[] } => {
    let comments: { id: number; body: string }[] = []
    let next = 100
    const ok = (stdout = '') => ({ ok: true, stdout, stderr: '' })
    const gh: Gh = async ({ args, input }) => {
        const call = args.join(' ')
        if (call.startsWith('pr view')) {
            const head = story().head_sha
            return ok(
                JSON.stringify({ headRefOid: head, state: 'OPEN', labels: [] })
            )
        }
        if (call.startsWith('pr edit') || call.startsWith('label')) return ok()
        if (call.includes('/comments?per_page=100')) {
            return ok(JSON.stringify([comments]))
        }
        const body = String(JSON.parse(input ?? '{}').body)
        if (call.startsWith('api -X POST')) {
            next += 1
            comments = [...comments, { id: next, body }]
            return ok(JSON.stringify({ id: next }))
        }
        const id = Number(/comments\/(\d+)/.exec(call)?.[1])
        comments = comments.map((each) =>
            each.id === id ? { id, body } : each
        )
        return ok()
    }
    return { gh, bodies: () => comments.map(({ body }) => body) }
}

describe('a shared story carries no paths from this computer', () => {
    test('the posted summary and data hold none, and the story still reads back', async () => {
        const github = fakeGh()

        await postSharedStory({
            gh: github.gh,
            story: leakyStory(),
            known: KNOWN,
        })

        const posted = github.bodies().join('\n')
        expect(posted).not.toContain('/Users/')
        const read = unpackStory({ bodies: github.bodies() })
        expect(read.status).toBe('ok')
        if (read.status !== 'ok') return
        expect(read.story.summary.what_changed).toBe(
            'Retries a stuck ticket; see [home]/…/run-ticket.ts'
        )
        expect(read.story.written_by).toBe('story-writer in [home]/…/app')
        expect(JSON.stringify(read.story)).not.toContain('/Users/')
    })

    test('saving the same story again changes no comment, and a clean story is posted as it is', async () => {
        const github = fakeGh()
        await postSharedStory({
            gh: github.gh,
            story: leakyStory(),
            known: KNOWN,
        })

        const again = await postSharedStory({
            gh: github.gh,
            story: leakyStory(),
            known: KNOWN,
        })

        expect(again).toMatchObject({ updated: 0, created: 0, deleted: 0 })

        const clean = fakeGh()
        await postSharedStory({ gh: clean.gh, story: story(), known: KNOWN })
        const read = unpackStory({ bodies: clean.bodies() })
        expect(read).toEqual({ status: 'ok', story: story() })
    })

    test("a save names a path under the runs folder by the runs token, given the tracker's roots", async () => {
        const github = fakeGh()
        const runs = '/Users/jdoe/.config/luca-runs'
        const base = story()

        await saveStoryWith({
            gh: github.gh,
            story: {
                ...base,
                written_by: `Luca run in ${runs}/r1/run-branch`,
            },
            stories_dir: '/nowhere',
            home: 'shared',
            known: { home: '/Users/jdoe', runs_dir: runs },
        })

        const read = unpackStory({ bodies: github.bodies() })
        expect(read.status === 'ok' && read.story.written_by).toBe(
            'Luca run in [runs]/r1/run-branch'
        )
    })
})
