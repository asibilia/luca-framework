import { describe, expect, test } from 'bun:test'

import { createGitHubTracker, type GhRunner } from './github-tracker'

/** One `gh` answer: a zero exit with `stdout`, or a failure with `stderr`. */
type GhAnswer = { exit_code: number; stdout?: string; stderr?: string }

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
            const { exit_code, stdout, stderr } = answer(args)
            return { exit_code, stdout: stdout ?? '', stderr: stderr ?? '' }
        },
    }
}

const REPO = 'acme/app'

const addNeedsInfo = [
    'issue',
    'edit',
    '25',
    '--repo',
    REPO,
    '--add-label',
    'needs-info',
]

const listLabels = [
    'label',
    'list',
    '--repo',
    REPO,
    '--limit',
    '1000',
    '--json',
    'name',
    '--jq',
    '.[].name',
]

/** What `gh` prints when an issue edit names a label the repo lacks. */
const labelNotFound = (label: string): GhAnswer => ({
    exit_code: 1,
    stderr: `could not add label: '${label}' not found\n`,
})

describe('GitHub tracker: adding a label', () => {
    test('a label the repo has is added with one call', async () => {
        const { gh, calls } = fakeGh(() => ({ exit_code: 0 }))
        const tracker = createGitHubTracker({ repo: REPO, gh })

        await tracker.addLabel({ number: 25, label: 'needs-info' })

        expect(calls).toEqual([addNeedsInfo])
    })

    test('a label the repo lacks is created as luca setup makes it, then added', async () => {
        let created = false
        const { gh, calls } = fakeGh((args) => {
            if (args[0] === 'label' && args[1] === 'create') {
                created = true
                return { exit_code: 0 }
            }
            if (args[0] === 'label' && args[1] === 'list') {
                return { exit_code: 0, stdout: 'bug\nready-for-agent\n' }
            }
            return created ? { exit_code: 0 } : labelNotFound('needs-info')
        })
        const tracker = createGitHubTracker({ repo: REPO, gh })

        await tracker.addLabel({ number: 25, label: 'needs-info' })

        expect(calls).toEqual([
            addNeedsInfo,
            listLabels,
            [
                'label',
                'create',
                'needs-info',
                '--repo',
                REPO,
                '--color',
                'd93f0b',
                '--description',
                'Luca needs more detail before it can build this',
            ],
            addNeedsInfo,
        ])
    })

    test('a label Luca has no definition for is created plain, then added', async () => {
        let created = false
        const { gh, calls } = fakeGh((args) => {
            if (args[1] === 'create') {
                created = true
                return { exit_code: 0 }
            }
            if (args[1] === 'list') return { exit_code: 0, stdout: '' }
            return created ? { exit_code: 0 } : labelNotFound('odd')
        })
        const tracker = createGitHubTracker({ repo: REPO, gh })

        await tracker.addLabel({ number: 25, label: 'odd' })

        expect(calls[2]).toEqual([
            'label',
            'create',
            'odd',
            '--repo',
            REPO,
            '--color',
            'ededed',
            '--description',
            '',
        ])
        expect(calls).toHaveLength(4)
    })

    test('a failure with the label already in the repo throws, and creates nothing', async () => {
        const { gh, calls } = fakeGh((args) =>
            args[1] === 'list'
                ? { exit_code: 0, stdout: 'needs-info\n' }
                : { exit_code: 1, stderr: 'HTTP 502: Bad Gateway\n' }
        )
        const tracker = createGitHubTracker({ repo: REPO, gh })

        await expect(
            tracker.addLabel({ number: 25, label: 'needs-info' })
        ).rejects.toThrow('HTTP 502: Bad Gateway')
        expect(calls).toEqual([addNeedsInfo, listLabels])
    })

    test('when creating the label fails too, the error says both', async () => {
        const { gh } = fakeGh((args) => {
            if (args[1] === 'list') return { exit_code: 0, stdout: '' }
            if (args[1] === 'create') {
                return {
                    exit_code: 1,
                    stderr: 'HTTP 403: Resource not accessible\n',
                }
            }
            return labelNotFound('needs-info')
        })
        const tracker = createGitHubTracker({ repo: REPO, gh })

        const added = tracker.addLabel({ number: 25, label: 'needs-info' })

        await expect(added).rejects.toThrow("'needs-info' not found")
        await expect(added).rejects.toThrow('HTTP 403')
    })
})

describe('GitHub tracker: removing a label', () => {
    test('removing a label the repo lacks does nothing', async () => {
        const { gh, calls } = fakeGh((args) =>
            args[1] === 'list'
                ? { exit_code: 0, stdout: 'bug\n' }
                : {
                      exit_code: 1,
                      stderr: "could not remove label: 'ready-for-agent' not found\n",
                  }
        )
        const tracker = createGitHubTracker({ repo: REPO, gh })

        await tracker.removeLabel({ number: 25, label: 'ready-for-agent' })

        expect(calls).toHaveLength(2)
    })

    test('removing a label the issue lacks but the repo has does nothing', async () => {
        const { gh, calls } = fakeGh(() => ({ exit_code: 0 }))
        const tracker = createGitHubTracker({ repo: REPO, gh })

        await tracker.removeLabel({ number: 25, label: 'ready-for-agent' })

        expect(calls).toEqual([
            [
                'issue',
                'edit',
                '25',
                '--repo',
                REPO,
                '--remove-label',
                'ready-for-agent',
            ],
        ])
    })

    test('a failure with the label in the repo throws', async () => {
        const { gh } = fakeGh((args) =>
            args[1] === 'list'
                ? { exit_code: 0, stdout: 'ready-for-agent\n' }
                : { exit_code: 1, stderr: 'HTTP 502: Bad Gateway\n' }
        )
        const tracker = createGitHubTracker({ repo: REPO, gh })

        await expect(
            tracker.removeLabel({ number: 25, label: 'ready-for-agent' })
        ).rejects.toThrow('HTTP 502')
    })
})

describe('GitHub tracker: other calls go through the same gh', () => {
    test('posting a comment returns its id', async () => {
        const { gh, calls } = fakeGh(() => ({
            exit_code: 0,
            stdout: '{"id": 77}',
        }))
        const tracker = createGitHubTracker({ repo: REPO, gh })

        expect(await tracker.comment({ number: 25, body: 'Hi' })).toEqual({
            id: 77,
        })
        expect(calls).toEqual([
            ['api', `repos/${REPO}/issues/25/comments`, '-f', 'body=Hi'],
        ])
    })

    test("a failed comment throws with gh's own words", async () => {
        const { gh } = fakeGh(() => ({
            exit_code: 1,
            stderr: 'HTTP 404: Not Found\n',
        }))
        const tracker = createGitHubTracker({ repo: REPO, gh })

        await expect(
            tracker.comment({ number: 25, body: 'Hi' })
        ).rejects.toThrow('HTTP 404: Not Found')
    })
})
