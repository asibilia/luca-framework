import { describe, expect, test } from 'bun:test'

import * as ghRetry from './gh-retry'
import { createGhCalls } from './gh-retry'
import { createGitHubTracker, type GhRunner } from './github-tracker'

/**
 * One `gh` answer: a zero exit with `stdout`, a failure with `stderr`, or a
 * call the time limit stopped (`timed_out`, with no exit code).
 */
type GhAnswer = {
    exit_code: number | null
    stdout?: string
    stderr?: string
    timed_out?: boolean
}

/**
 * A fake `gh`: it answers each call with `answer`, and keeps every call's
 * arguments, oldest first.
 */
const fakeGh = (
    answer: (args: string[]) => GhAnswer
): { gh: GhRunner; calls: string[][] } => {
    const calls: string[][] = []
    return {
        calls,
        gh: async (args) => {
            calls.push(args)
            const { exit_code, stdout, stderr, timed_out } = answer(args)
            return {
                exit_code,
                stdout: stdout ?? '',
                stderr: stderr ?? '',
                ...(timed_out === undefined ? {} : { timed_out }),
            }
        },
    }
}

/** A fake sleep and run log: they keep each wait and each line. */
const fakeWaits = (): {
    sleep: (ms: number) => Promise<void>
    log: (line: string) => void
    slept: number[]
    logged: string[]
} => {
    const slept: number[] = []
    const logged: string[] = []
    return {
        slept,
        logged,
        sleep: async (ms) => {
            slept.push(ms)
        },
        log: (line) => {
            logged.push(line)
        },
    }
}

const REPO = 'acme/app'

const ISSUE_PATH = `repos/${REPO}/issues/25`

const BLOCKED_BY_PATH = `repos/${REPO}/issues/25/dependencies/blocked_by`

const ISSUE_JSON = JSON.stringify({
    number: 25,
    title: 'Fix the login',
    body: 'Details',
    state: 'open',
    labels: [],
    html_url: 'https://github.com/acme/app/issues/25',
    user: { login: 'owner' },
})

const BAD_GATEWAY: GhAnswer = {
    exit_code: 1,
    stderr: 'gh: Bad Gateway (HTTP 502)\n',
}

/** Answers each call to `path` from `answers` in turn, the last one after. */
const inTurn = (answers: GhAnswer[]): (() => GhAnswer) => {
    let next = 0
    return () => answers[Math.min(next++, answers.length - 1)] as GhAnswer
}

/** The calls made to `gh api <path>`. */
const callsTo = ({ calls, path }: { calls: string[][]; path: string }) =>
    calls.filter((args) => args[0] === 'api' && args[1] === path)

describe('GitHub tracker retries: reads', () => {
    test('a cut-off JSON reply, then a good one, is retried once and read', async () => {
        const issue = inTurn([
            { exit_code: 0, stdout: '{"number": 25, "title": "Fix' },
            { exit_code: 0, stdout: ISSUE_JSON },
        ])
        const { gh, calls } = fakeGh((args) =>
            args[1] === ISSUE_PATH ? issue() : { exit_code: 0, stdout: '[]' }
        )
        const waits = fakeWaits()
        const tracker = createGitHubTracker({ repo: REPO, gh, ...waits })

        const read = await tracker.readIssue({ number: 25 })

        expect(read?.title).toBe('Fix the login')
        expect(callsTo({ calls, path: ISSUE_PATH })).toHaveLength(2)
        expect(waits.slept).toEqual([2000])
    })

    test('a 5xx reply, then a good one, is retried once and logged once', async () => {
        const subs = inTurn([
            BAD_GATEWAY,
            { exit_code: 0, stdout: `[${ISSUE_JSON}]` },
        ])
        const subPath = `repos/${REPO}/issues/24/sub_issues?per_page=100`
        const { gh, calls } = fakeGh((args) =>
            args[1] === subPath ? subs() : { exit_code: 0, stdout: '[]' }
        )
        const waits = fakeWaits()
        const tracker = createGitHubTracker({ repo: REPO, gh, ...waits })

        const tickets = await tracker.listSubTickets({ spec_number: 24 })

        expect(tickets.map(({ number }) => number)).toEqual([25])
        expect(callsTo({ calls, path: subPath })).toHaveLength(2)
        expect(waits.logged).toHaveLength(1)
    })

    test('blockers that fail transiently three times throw, after waits of 2 s then 8 s', async () => {
        const { gh, calls } = fakeGh((args) =>
            args[1] === BLOCKED_BY_PATH
                ? {
                      exit_code: 1,
                      stderr: 'unexpected end of JSON input\n',
                  }
                : { exit_code: 0, stdout: ISSUE_JSON }
        )
        const waits = fakeWaits()
        const tracker = createGitHubTracker({ repo: REPO, gh, ...waits })

        await expect(tracker.readIssue({ number: 25 })).rejects.toThrow()
        expect(callsTo({ calls, path: BLOCKED_BY_PATH })).toHaveLength(3)
        expect(waits.slept).toEqual([2000, 8000])
        expect(waits.logged).toHaveLength(2)
    })

    test('a 404 still reads as none, and any other failure throws without a retry', async () => {
        const notFound = fakeGh(() => ({
            exit_code: 1,
            stderr: 'gh: Not Found (HTTP 404)\n',
        }))
        const forbidden = fakeGh(() => ({
            exit_code: 1,
            stderr: 'gh: Resource not accessible by integration (HTTP 403)\n',
        }))
        const waits = fakeWaits()

        expect(
            await createGitHubTracker({
                repo: REPO,
                gh: notFound.gh,
                ...waits,
            }).readIssue({ number: 25 })
        ).toBeNull()
        await expect(
            createGitHubTracker({
                repo: REPO,
                gh: forbidden.gh,
                ...waits,
            }).listSubTickets({ spec_number: 24 })
        ).rejects.toThrow('HTTP 403')
        expect(notFound.calls).toHaveLength(1)
        expect(forbidden.calls).toHaveLength(1)
        expect(waits.slept).toEqual([])
        expect(waits.logged).toEqual([])
    })

    test('a call the time limit stopped is retried', async () => {
        const issue = inTurn([
            { exit_code: null, timed_out: true },
            { exit_code: 0, stdout: ISSUE_JSON },
        ])
        const { gh, calls } = fakeGh((args) =>
            args[1] === ISSUE_PATH ? issue() : { exit_code: 0, stdout: '[]' }
        )
        const waits = fakeWaits()
        const tracker = createGitHubTracker({ repo: REPO, gh, ...waits })

        const read = await tracker.readIssue({ number: 25 })

        expect(read?.number).toBe(25)
        expect(callsTo({ calls, path: ISSUE_PATH })).toHaveLength(2)
        expect(waits.logged).toHaveLength(1)
    })
})

const COMMENTS_PATH = `repos/${REPO}/issues/25/comments`

/** Whether `args` posts a comment (the body goes as a field). */
const isPost = (args: string[]): boolean => args.includes('-f')

/**
 * The issue's comments as `gh` lists them: one object per line when the
 * call filters with `--jq`, else the API's own array.
 */
const listed = ({
    args,
    comments,
}: {
    args: string[]
    comments: { id: number; body: string }[]
}): GhAnswer => ({
    exit_code: 0,
    stdout: args.includes('--jq')
        ? comments
              .map(({ id, body }) =>
                  JSON.stringify({ id, author: 'luca-bot', body })
              )
              .join('\n')
        : JSON.stringify(
              comments.map(({ id, body }) => ({
                  id,
                  body,
                  user: { login: 'luca-bot' },
              }))
          ),
})

describe('GitHub tracker retries: writes', () => {
    test('a comment whose first try landed is adopted, not posted twice', async () => {
        const body = '<!-- luca:ticket-25:stuck -->\nTicket #25 is stuck.'
        const { gh, calls } = fakeGh((args) =>
            isPost(args)
                ? { exit_code: 1, stderr: 'unexpected end of JSON input\n' }
                : listed({
                      args,
                      comments: [
                          { id: 90, body: 'Something else' },
                          { id: 91, body },
                      ],
                  })
        )
        const tracker = createGitHubTracker({
            repo: REPO,
            gh,
            ...fakeWaits(),
        })

        expect(await tracker.comment({ number: 25, body })).toEqual({
            id: 91,
        })
        expect(calls.filter(isPost)).toHaveLength(1)
    })

    test('a comment whose first try did not land is posted again', async () => {
        const body = '<!-- luca:ticket-25:stuck -->\nTicket #25 is stuck.'
        const post = inTurn([
            { exit_code: 1, stderr: 'unexpected end of JSON input\n' },
            { exit_code: 0, stdout: '{"id": 92}' },
        ])
        const { gh, calls } = fakeGh((args) =>
            isPost(args)
                ? post()
                : listed({ args, comments: [{ id: 90, body: 'Other' }] })
        )
        const tracker = createGitHubTracker({
            repo: REPO,
            gh,
            ...fakeWaits(),
        })

        expect(await tracker.comment({ number: 25, body })).toEqual({
            id: 92,
        })
        expect(
            calls.filter((args) => isPost(args) && args[1] === COMMENTS_PATH)
        ).toHaveLength(2)
    })

    test('a PR that exists after a failed create is adopted, not created twice', async () => {
        const { gh, calls } = fakeGh((args) => {
            if (args[0] === 'pr' && args[1] === 'list') {
                return {
                    exit_code: 0,
                    stdout: JSON.stringify([
                        {
                            number: 12,
                            url: 'https://github.com/acme/app/pull/12',
                            isCrossRepository: false,
                        },
                    ]),
                }
            }
            return { exit_code: 1, stderr: 'HTTP 502: Bad Gateway\n' }
        })
        const tracker = createGitHubTracker({
            repo: REPO,
            gh,
            ...fakeWaits(),
        })

        const opened = await tracker.openPullRequest({
            head: 'luca/spec-24',
            base: 'main',
            title: 'Spec #24',
            body: 'Body',
        })

        expect(opened).toEqual({
            number: 12,
            url: 'https://github.com/acme/app/pull/12',
        })
        expect(
            calls.filter((args) => args[0] === 'pr' && args[1] === 'create')
        ).toHaveLength(1)
    })

    test('creating a label that already exists counts as success', async () => {
        const { gh, calls } = fakeGh(() => ({
            exit_code: 1,
            stderr: 'label with name "needs-info" already exists; use `--force` to update its color and description\n',
        }))
        const tracker = createGitHubTracker({
            repo: REPO,
            gh,
            ...fakeWaits(),
        })

        await tracker.createLabel({
            name: 'needs-info',
            color: 'd93f0b',
            description: 'Luca needs more detail before it can build this',
        })

        expect(calls).toHaveLength(1)
    })
})

describe('GitHub tracker retries: network errors', () => {
    test('a call that fails once on each network text, then works, is retried and reads', async () => {
        const texts = [
            'error connecting to api.github.com',
            'Could not resolve host: api.github.com',
            'dial tcp: lookup api.github.com: no such host',
            'connect: Network is unreachable',
        ]
        for (const text of texts) {
            const answers = inTurn([
                { exit_code: 1, stderr: `${text}\n` },
                { exit_code: 0, stdout: 'done' },
            ])
            const { gh, calls } = fakeGh(answers)
            const ghCalls = createGhCalls({ run: gh, ...fakeWaits() })

            expect(await ghCalls.ok({ args: ['api', 'user'] })).toBe('done')
            expect(calls).toHaveLength(2)
        }
    })

    test('a call that fails 3 times on a network error throws a network error; a 404 does not', async () => {
        const offline = fakeGh(() => ({
            exit_code: 1,
            stderr: 'error connecting to api.github.com\n',
        }))
        const notFound = fakeGh(() => ({
            exit_code: 1,
            stderr: 'gh: Not Found (HTTP 404)\n',
        }))

        const network = await createGhCalls({ run: offline.gh, ...fakeWaits() })
            .ok({ args: ['api', 'user'] })
            .catch((error: unknown) => error)
        const other = await createGhCalls({ run: notFound.gh, ...fakeWaits() })
            .ok({ args: ['api', 'user'] })
            .catch((error: unknown) => error)

        expect(offline.calls).toHaveLength(3)
        expect(network).toBeInstanceOf(ghRetry.NetworkGhError)
        expect(other).toBeInstanceOf(Error)
        expect(other).not.toBeInstanceOf(ghRetry.NetworkGhError)
    })
})
