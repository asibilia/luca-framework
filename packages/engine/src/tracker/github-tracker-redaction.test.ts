import { describe, expect, test } from 'bun:test'

import { createGitHubTracker, type GhRunner } from './github-tracker'
import { createInMemoryTracker } from './in-memory-tracker'
import { postCommentOnce } from './post-comment-once'
import type { KnownRoots } from './redact-private-paths'
import { withRedaction } from './redacting-tracker'

import { specIssue } from '../testing/intake-fixtures'

/** This computer, as the tests pretend it is. */
const KNOWN: KnownRoots = {
    home: '/Users/me',
    runs_dir: '/Users/me/.local/state/luca/runs',
}

const STUCK =
    'Last error:\n\nENOENT /Users/me/.local/state/luca/runs/run-1/tickets/11/src/a.ts'

const REDACTED = 'Last error:\n\nENOENT [runs]/run-1/tickets/11/src/a.ts'

/** A fake `gh` that keeps every call and answers each with `answer`. */
const fakeGh = (
    answer: (args: string[]) => {
        exit_code: number
        stdout?: string
        stderr?: string
    }
): { gh: GhRunner; calls: string[][] } => {
    const calls: string[][] = []
    return {
        calls,
        gh: async (args) => {
            calls.push(args)
            const { exit_code, stdout, stderr } = answer(args)
            return { exit_code, stdout: stdout ?? '', stderr: stderr ?? '' }
        },
    }
}

const noWaits = { sleep: async () => {}, log: () => {} }

describe('the GitHub tracker sends no paths from this computer', () => {
    test('a comment is posted redacted, and a first try that landed is adopted by its redacted body', async () => {
        const { gh, calls } = fakeGh((args) => {
            // The first try lands, but its answer is cut off.
            if (args.includes('-f')) {
                return {
                    exit_code: 1,
                    stderr: 'unexpected end of JSON input\n',
                }
            }
            return {
                exit_code: 0,
                stdout: JSON.stringify({
                    id: 91,
                    author: 'luca-bot',
                    body: `${REDACTED}\n\n<!-- luca:run-1:42:0 -->`,
                }),
            }
        })
        const tracker = createGitHubTracker({
            repo: 'acme/app',
            gh,
            known_roots: KNOWN,
            ...noWaits,
        })

        const posted = await tracker.comment({
            number: 25,
            body: `${STUCK}\n\n<!-- luca:run-1:42:0 -->`,
        })

        expect(posted).toEqual({ id: 91 })
        expect(calls.filter((args) => args.includes('-f'))).toHaveLength(1)
        expect(calls[0]).toContain(
            `body=${REDACTED}\n\n<!-- luca:run-1:42:0 -->`
        )
    })

    test("a pull request's title and body are sent redacted", async () => {
        const { gh, calls } = fakeGh(() => ({
            exit_code: 0,
            stdout: 'https://github.com/acme/app/pull/12\n',
        }))
        const tracker = createGitHubTracker({
            repo: 'acme/app',
            gh,
            known_roots: KNOWN,
            ...noWaits,
        })

        await tracker.openPullRequest({
            head: 'luca/spec-24',
            base: 'main',
            title: 'Fix /Users/me/Github/app/a.ts',
            body: `## Assumptions\n\n${STUCK}\n\nSee https://github.com/acme/app/pull/3`,
        })

        const create = calls.find((args) => args[1] === 'create') ?? []
        expect(create[create.indexOf('--title') + 1]).toBe('Fix [home]/…/a.ts')
        expect(create[create.indexOf('--body') + 1]).toBe(
            `## Assumptions\n\n${REDACTED}\n\nSee https://github.com/acme/app/pull/3`
        )
    })

    test("postCommentOnce's redo still finds its comment by the marker", async () => {
        const memory = createInMemoryTracker({
            issues: [specIssue({ number: 10 })],
            sub_tickets: {},
        })
        const tracker = withRedaction({ tracker: memory, known: KNOWN })
        const post = (redo: boolean) =>
            postCommentOnce({
                tracker,
                number: 10,
                body: STUCK,
                step: { run_id: 'run-1', first_seq: 42, redo },
                n: 0,
            })

        const first = await post(false)
        const again = await post(true)

        expect(again).toEqual(first)
        expect(memory.commentsOn({ number: 10 })).toEqual([
            `${REDACTED}\n\n<!-- luca:run-1:42:0 -->`,
        ])
    })
})
