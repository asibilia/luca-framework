import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runStoryCli } from './story-cli'
import { packStory } from './story-comments'
import type { Gh } from './story-github'
import type { Story } from './story-schema'
import { loadPrivateStory } from './story-store'
import { sha, story } from './testing/story-fixtures'

/**
 * A pretend GitHub: one PR by `login`'s account or another's, with its
 * head commit, labels, and comments. It records every `gh` call.
 */
const fakeGitHub = ({
    login = 'acme',
    head_sha = sha({ char: 'a' }),
    labels = [],
    comments = [],
}: {
    login?: string
    head_sha?: string
    labels?: string[]
    comments?: { id: number; body: string }[]
}) => {
    const calls: string[] = []
    const state = { labels: [...labels], comments: [...comments] }
    const gh: Gh = async ({ args, input }) => {
        const call = args.join(' ')
        calls.push(call)
        const ok = (stdout = '') => ({ ok: true, stdout, stderr: '' })
        if (call === 'api user --jq .login') return ok(`${login}\n`)
        if (call.startsWith('pr view')) {
            return ok(
                JSON.stringify({
                    headRefOid: head_sha,
                    state: 'OPEN',
                    labels: state.labels.map((name) => ({ name })),
                })
            )
        }
        if (call.includes('/comments?per_page=100')) {
            return ok(JSON.stringify([state.comments]))
        }
        const body = String(JSON.parse(input ?? '{"body":""}').body)
        if (call.startsWith('api -X POST')) {
            state.comments.push({ id: 100 + state.comments.length, body })
            return ok()
        }
        if (call.startsWith('api -X PATCH')) {
            const id = Number(call.match(/comments\/(\d+)/)?.[1])
            state.comments = state.comments.map((comment) =>
                comment.id === id ? { id, body } : comment
            )
            return ok()
        }
        if (call.startsWith('pr edit') && call.includes('--add-label')) {
            state.labels.push('review-ready')
            return ok()
        }
        if (call.includes('/labels/review-ready')) {
            state.labels = state.labels.filter(
                (name) => name !== 'review-ready'
            )
            return ok()
        }
        return { ok: false, stdout: '', stderr: `unexpected gh call: ${call}` }
    }
    return { gh, calls, state }
}

let dir = ''

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-story-cli-'))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

/** Runs the helper against a pretend GitHub; a story is written to a file first. */
const run = async ({
    argv,
    github = fakeGitHub({}),
    file,
}: {
    argv: string[]
    github?: ReturnType<typeof fakeGitHub>
    file?: unknown
}) => {
    const path = join(dir, 'story.json')
    if (file !== undefined) await Bun.write(path, JSON.stringify(file))
    const lines: string[] = []
    const code = await runStoryCli({
        argv: argv.map((arg) => (arg === 'STORY' ? path : arg)),
        gh: github.gh,
        home: dir,
        env: { LUCA_STORIES_DIR: join(dir, 'stories') },
        out: (line) => lines.push(line),
        err: (line) => lines.push(line),
    })
    return { code, text: lines.join('\n'), github }
}

const writes = (calls: string[]) =>
    calls.filter((call) =>
        /-X (POST|PATCH|DELETE)|pr edit|label create/.test(call)
    )

describe('the luca-pr-prep helper', () => {
    test('a story that fails the schema is never saved or posted, and every problem is printed', async () => {
        const broken: Story = { ...story(), stops: story().stops.slice(0, 1) }
        for (const flag of ['--shared', '--private']) {
            const { code, text, github } = await run({
                argv: ['save', 'STORY', flag],
                file: broken,
            })
            expect(code).toBe(1)
            expect(text).toContain(
                'src/config/schema.ts is on the map but no stop reads it'
            )
            expect(github.calls).toEqual([])
        }
        expect(
            await loadPrivateStory({
                stories_dir: join(dir, 'stories'),
                repo: 'acme/site',
                pr_number: 12,
            })
        ).toEqual({ status: 'none' })
        expect(
            (await run({ argv: ['check', 'STORY'], file: story() })).code
        ).toBe(0)
    })

    test("in someone else's repo a story is saved on this computer and nothing is posted", async () => {
        const github = fakeGitHub({ login: 'someone-else' })
        expect(
            (await run({ argv: ['home', 'acme/site'], github })).text
        ).toContain('private')
        const saved = await run({
            argv: ['save', 'STORY'],
            github,
            file: story(),
        })
        expect(saved.code).toBe(0)
        expect(saved.text).toContain('Nothing was posted')
        expect(writes(github.calls)).toEqual([])

        const loaded = await run({ argv: ['load', 'acme/site', '12'], github })
        expect(
            JSON.parse(loaded.text.slice(0, loaded.text.lastIndexOf('}') + 1))
        ).toEqual(story())
        expect(loaded.text).toContain('Found in the private home')
    })

    test("in the owner's own repo a story is posted, replaces its old comments, and gets the label", async () => {
        const old = { ...story(), title: 'An older story' }
        const github = fakeGitHub({
            comments: [
                { id: 1, body: 'LGTM' },
                { id: 2, body: packStory({ story: old })[0] ?? '' },
            ],
        })
        const saved = await run({
            argv: ['save', 'STORY'],
            github,
            file: story(),
        })
        expect(saved.code).toBe(0)
        expect(saved.text).toContain('1 comments updated, 0 created, 0 deleted')
        expect(github.state.comments.map(({ id }) => id)).toEqual([1, 2])
        expect(github.state.comments[0]?.body).toBe('LGTM')
        expect(github.state.labels).toEqual(['review-ready'])

        const loaded = await run({ argv: ['load', 'acme/site', '12'], github })
        expect(loaded.text).toContain('Found in the shared home')
        expect(
            (await run({ argv: ['status', 'acme/site', '12'], github })).text
        ).toContain('"status":"fresh"')
    })

    test('a story for an older commit is not posted, and a stale one loses its label', async () => {
        const moved = fakeGitHub({ head_sha: sha({ char: 'd' }) })
        const refused = await run({
            argv: ['save', 'STORY', '--shared'],
            github: moved,
            file: story(),
        })
        expect(refused.code).toBe(1)
        expect(refused.text).toContain("the PR's head is now ddddddddd")
        expect(writes(moved.calls)).toEqual([])

        const stale = fakeGitHub({
            head_sha: sha({ char: 'd' }),
            labels: ['review-ready', 'bug'],
            comments: [{ id: 2, body: packStory({ story: story() })[0] ?? '' }],
        })
        const status = await run({
            argv: ['status', 'acme/site', '12'],
            github: stale,
        })
        expect(JSON.parse(status.text)).toEqual({
            status: 'stale',
            home: 'shared',
            story_head_sha: sha({ char: 'a' }),
            pr_head_sha: sha({ char: 'd' }),
        })
        expect(stale.state.labels).toEqual(['bug'])
    })
})
