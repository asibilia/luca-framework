import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createGitHubTracker, type GhRunner } from './github-tracker'
import { isTrackerNetworkFailure, TrackerError } from './tracker'

import { isStoryComment, packStory, unpackStory } from '../story/story-comments'
import type { Story } from '../story/story-schema'
import { loadPrivateStory, savePrivateStory } from '../story/story-store'
import { sha, story } from '../story/testing/story-fixtures'

/**
 * The GitHub tracker saves a story (#742) through the `/luca-pr-prep`
 * functions, against a pretend `gh`.
 */

const OWN_REPO = 'octocat/hello-world'
const ORG_REPO = 'some-org/hello-world'

/** A valid story for pull request 12 of `repo`, written for `head_sha`. */
const storyFor = ({
    repo,
    title = 'Retry stuck tickets',
    head_sha = sha({ char: 'a' }),
}: {
    repo: string
    title?: string
    head_sha?: string
}): Story => ({
    ...story(),
    repo,
    pr_url: `https://github.com/${repo}/pull/12`,
    title,
    head_sha,
})

type Call = { args: string[]; input: string | undefined }

/**
 * A pretend `gh` signed in as `login`, for one pull request whose head is
 * `head_sha`. It keeps the PR's comments and labels and the repo's labels,
 * and records every call with its stdin text. `fail` answers a call
 * instead, when it returns an answer.
 */
const fakeGh = ({
    login = 'octocat',
    user_stderr,
    head_sha = sha({ char: 'a' }),
    repo_labels = ['review-ready'],
    fail,
}: {
    login?: string
    /** When set, `gh api user` exits 1 with this stderr. */
    user_stderr?: string
    head_sha?: string
    repo_labels?: string[]
    fail?: (call: string) => { exit_code: number; stderr: string } | null
}) => {
    const calls: Call[] = []
    const state = {
        comments: [] as { id: number; body: string }[],
        pr_labels: [] as string[],
        repo_labels: [...repo_labels],
    }
    let next_id = 100
    const gh: GhRunner = async (args, options) => {
        const input = options?.input
        calls.push({ args, input })
        const call = args.join(' ')
        const ok = (stdout = '') => ({ exit_code: 0, stdout, stderr: '' })
        const failed = fail?.(call) ?? null
        if (failed !== null) return { ...failed, stdout: '' }
        if (args[0] === 'api' && args[1] === 'user') {
            return user_stderr === undefined
                ? ok(`${login}\n`)
                : { exit_code: 1, stdout: '', stderr: user_stderr }
        }
        if (call.startsWith('pr view')) {
            return ok(
                JSON.stringify({
                    headRefOid: head_sha,
                    state: 'OPEN',
                    labels: state.pr_labels.map((name) => ({ name })),
                })
            )
        }
        if (call.includes('/comments?per_page=100')) {
            return ok(JSON.stringify([state.comments]))
        }
        if (call.startsWith('api -X DELETE') && call.includes('/comments/')) {
            const id = Number(call.match(/comments\/(\d+)/)?.[1])
            state.comments = state.comments.filter((c) => c.id !== id)
            return ok()
        }
        if (call.startsWith('api -X POST') || call.startsWith('api -X PATCH')) {
            const body = String(JSON.parse(input ?? '{}').body)
            if (call.startsWith('api -X POST')) {
                next_id += 1
                state.comments.push({ id: next_id, body })
                return ok(JSON.stringify({ id: next_id }))
            }
            const id = Number(call.match(/comments\/(\d+)/)?.[1])
            state.comments = state.comments.map((c) =>
                c.id === id ? { id, body } : c
            )
            return ok()
        }
        if (args[0] === 'label' && args[1] === 'create') {
            state.repo_labels.push(String(args[2]))
            return ok()
        }
        if (call.startsWith('pr edit') && call.includes('--add-label')) {
            const label = String(args[args.indexOf('--add-label') + 1])
            if (!state.repo_labels.includes(label)) {
                return {
                    exit_code: 1,
                    stdout: '',
                    stderr: `could not add label: '${label}' not found\n`,
                }
            }
            state.pr_labels.push(label)
            return ok()
        }
        return {
            exit_code: 1,
            stdout: '',
            stderr: `unexpected gh call: ${call}`,
        }
    }
    return { gh, calls, state }
}

/** The calls that post a comment or add or create a label. */
const writes = (calls: Call[]) =>
    calls
        .map(({ args }) => args.join(' '))
        .filter((call) => /-X (POST|PATCH)|--add-label|label create/.test(call))

const isCommentPost = (call: string) =>
    call.startsWith('api -X POST') && call.includes('/comments')

let dir = ''

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-tracker-story-'))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const trackerOn = ({
    repo,
    github,
}: {
    repo: string
    github: ReturnType<typeof fakeGh>
}) =>
    createGitHubTracker({
        repo,
        gh: github.gh,
        stories_dir: join(dir, 'stories'),
        sleep: async () => undefined,
        log: () => undefined,
    })

describe('GitHub tracker: which home a story goes to', () => {
    test("a repo of the signed-in user's own account is shared", async () => {
        const tracker = trackerOn({ repo: OWN_REPO, github: fakeGh({}) })
        expect(await tracker.storyHome()).toBe('shared')
    })

    test('a repo of another account is private', async () => {
        const tracker = trackerOn({ repo: ORG_REPO, github: fakeGh({}) })
        expect(await tracker.storyHome()).toBe('private')
    })

    test('a gh that is not signed in means private', async () => {
        const github = fakeGh({
            user_stderr:
                'gh: To get started with GitHub CLI, please run: gh auth login',
        })
        const tracker = trackerOn({ repo: OWN_REPO, github })
        expect(await tracker.storyHome()).toBe('private')
    })

    test('a GitHub that cannot be reached is a network failure, not private', async () => {
        const github = fakeGh({
            user_stderr: 'error connecting to api.github.com',
        })
        const tracker = trackerOn({ repo: OWN_REPO, github })
        const error = await tracker.storyHome().then(
            () => null,
            (thrown: unknown) => thrown
        )
        expect(isTrackerNetworkFailure(error)).toBe(true)
    })

    test('the tracker names the repo it was made with', () => {
        const tracker = trackerOn({ repo: OWN_REPO, github: fakeGh({}) })
        expect(tracker.repo).toBe(OWN_REPO)
    })
})

describe('GitHub tracker: saving a story in the shared home', () => {
    test('one story comment is posted, readable back as the saved story', async () => {
        const github = fakeGh({})
        const saved = storyFor({ repo: OWN_REPO })

        await trackerOn({ repo: OWN_REPO, github }).saveStory({ story: saved })

        const bodies = github.state.comments.map(({ body }) => body)
        expect(bodies).toHaveLength(1)
        expect(isStoryComment({ body: bodies[0] ?? '' })).toBe(true)
        expect(unpackStory({ bodies })).toEqual({ status: 'ok', story: saved })
    })

    test('the pull request gets the review-ready label', async () => {
        const github = fakeGh({})
        await trackerOn({ repo: OWN_REPO, github }).saveStory({
            story: storyFor({ repo: OWN_REPO }),
        })
        expect(github.state.pr_labels).toContain('review-ready')
    })

    test('a repo without the review-ready label gets it created, then added', async () => {
        const github = fakeGh({ repo_labels: [] })
        await trackerOn({ repo: OWN_REPO, github }).saveStory({
            story: storyFor({ repo: OWN_REPO }),
        })
        const made = writes(github.calls).findIndex((call) =>
            call.startsWith('label create review-ready')
        )
        expect(made).toBeGreaterThanOrEqual(0)
        expect(github.state.repo_labels).toContain('review-ready')
        expect(github.state.pr_labels).toContain('review-ready')
    })

    test('a second save rewrites the story comment in place', async () => {
        const github = fakeGh({})
        const tracker = trackerOn({ repo: OWN_REPO, github })
        await tracker.saveStory({ story: storyFor({ repo: OWN_REPO }) })
        const second = storyFor({ repo: OWN_REPO, title: 'A second story' })

        await tracker.saveStory({ story: second })

        const bodies = github.state.comments.map(({ body }) => body)
        expect(bodies.filter((body) => isStoryComment({ body }))).toHaveLength(
            1
        )
        expect(unpackStory({ bodies })).toEqual({ status: 'ok', story: second })
    })

    test('a story for a commit that is no longer the head is refused, with nothing posted', async () => {
        const pr_head_sha = sha({ char: 'd' })
        const github = fakeGh({ head_sha: pr_head_sha })

        const result = await trackerOn({ repo: OWN_REPO, github }).saveStory({
            story: storyFor({ repo: OWN_REPO }),
        })

        expect(result).toMatchObject({ status: 'head_moved', pr_head_sha })
        expect(writes(github.calls)).toEqual([])
        expect(github.state.comments).toEqual([])
        expect(github.state.pr_labels).toEqual([])
    })

    test("each story comment's body goes to gh on stdin, as JSON with a body", async () => {
        const github = fakeGh({})
        const saved = storyFor({ repo: OWN_REPO })

        await trackerOn({ repo: OWN_REPO, github }).saveStory({ story: saved })

        const posts = github.calls.filter(({ args }) =>
            isCommentPost(args.join(' '))
        )
        expect(posts.map(({ input }) => JSON.parse(input ?? '{}'))).toEqual(
            packStory({ story: saved }).map((body) => ({ body }))
        )
    })

    test('a refused comment post throws a tracker error that is not a network failure', async () => {
        const github = fakeGh({
            fail: (call) =>
                isCommentPost(call)
                    ? {
                          exit_code: 1,
                          stderr: 'HTTP 403: Resource not accessible',
                      }
                    : null,
        })
        const error = await trackerOn({ repo: OWN_REPO, github })
            .saveStory({ story: storyFor({ repo: OWN_REPO }) })
            .then(
                () => null,
                (thrown: unknown) => thrown
            )
        expect(error).toBeInstanceOf(TrackerError)
        expect(isTrackerNetworkFailure(error)).toBe(false)
    })

    test('an unreachable GitHub on the comment post is a network failure, tried once', async () => {
        const github = fakeGh({
            fail: (call) =>
                isCommentPost(call)
                    ? {
                          exit_code: 1,
                          stderr: 'error connecting to api.github.com',
                      }
                    : null,
        })
        const error = await trackerOn({ repo: OWN_REPO, github })
            .saveStory({ story: storyFor({ repo: OWN_REPO }) })
            .then(
                () => null,
                (thrown: unknown) => thrown
            )
        expect(isTrackerNetworkFailure(error)).toBe(true)
        expect(
            github.calls.filter(({ args }) => isCommentPost(args.join(' ')))
        ).toHaveLength(1)
    })

    test("a shared save removes the pull request's private copy", async () => {
        const stories_dir = join(dir, 'stories')
        await savePrivateStory({
            stories_dir,
            story: storyFor({ repo: OWN_REPO }),
        })

        await trackerOn({ repo: OWN_REPO, github: fakeGh({}) }).saveStory({
            story: storyFor({ repo: OWN_REPO }),
        })

        expect(
            await loadPrivateStory({
                stories_dir,
                repo: OWN_REPO,
                pr_number: 12,
            })
        ).toEqual({ status: 'none' })
    })

    test('a shared save answers saved, shared, and how many story comments the PR has', async () => {
        const saved = storyFor({ repo: OWN_REPO })
        const result = await trackerOn({
            repo: OWN_REPO,
            github: fakeGh({}),
        }).saveStory({ story: saved })
        expect(result).toEqual({
            status: 'saved',
            home: 'shared',
            comments: packStory({ story: saved }).length,
        })
    })
})

describe('GitHub tracker: saving a story in the private home', () => {
    test('the story file is written under the stories folder, and nothing is posted', async () => {
        const github = fakeGh({})
        const saved = storyFor({ repo: ORG_REPO })

        const result = await trackerOn({ repo: ORG_REPO, github }).saveStory({
            story: saved,
        })

        const path = join(dir, 'stories', ORG_REPO, 'pr-12.json')
        expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(saved)
        expect(writes(github.calls)).toEqual([])
        expect(result).toEqual({
            status: 'saved',
            home: 'private',
            comments: 0,
        })
    })
})

describe('GitHub tracker: a story for another repo', () => {
    test('is refused with a tracker error that names both repos, and nothing is posted', async () => {
        const github = fakeGh({})
        const error = await trackerOn({ repo: OWN_REPO, github })
            .saveStory({ story: storyFor({ repo: 'some-org/other' }) })
            .then(
                () => null,
                (thrown: unknown) => thrown
            )
        expect(error).toBeInstanceOf(TrackerError)
        expect(isTrackerNetworkFailure(error)).toBe(false)
        expect(error instanceof Error ? error.message : '').toBe(
            'The story is for some-org/other, but this tracker is bound to octocat/hello-world.'
        )
        expect(writes(github.calls)).toEqual([])
    })
})
