import { describe, expect, test } from 'bun:test'

import { createGitHubTracker, type GhRunner } from './github-tracker'

/**
 * The run's PR as a draft on GitHub (#788): `gh pr create --draft`, then
 * `gh pr ready` once the final review passed.
 */

const NO_WAITS = { sleep: async () => {}, log: () => {} }

/** A fake `gh` that keeps every call and opens PR #12. */
const fakeGh = (): { gh: GhRunner; calls: string[][] } => {
    const calls: string[][] = []
    return {
        calls,
        gh: async (args) => {
            calls.push(args)
            return {
                exit_code: 0,
                stdout: 'https://github.com/acme/app/pull/12\n',
                stderr: '',
            }
        },
    }
}

describe('the GitHub tracker and draft PRs', () => {
    test('a draft PR is created with --draft, and a ready one without', async () => {
        const { gh, calls } = fakeGh()
        const tracker = createGitHubTracker({
            repo: 'acme/app',
            gh,
            ...NO_WAITS,
        })
        const request = { head: 'luca/a', base: 'main', title: 'A', body: 'B' }

        await tracker.openPullRequest({ ...request, draft: true })
        await tracker.openPullRequest({ ...request, draft: false })

        const creates = calls.filter((args) => args[1] === 'create')
        expect(creates.map((args) => args.includes('--draft'))).toEqual([
            true,
            false,
        ])
    })

    test('marking a PR ready runs gh pr ready on its number in the repo', async () => {
        const { gh, calls } = fakeGh()
        const tracker = createGitHubTracker({
            repo: 'acme/app',
            gh,
            ...NO_WAITS,
        })

        await tracker.markPullRequestReady({ number: 12 })

        expect(calls).toEqual([['pr', 'ready', '12', '--repo', 'acme/app']])
    })
})
