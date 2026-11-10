import type { Gh } from './fetch-findings'

/**
 * A pretend GitHub for the `/luca-pr-address` helper's tests: one PR with
 * comments, reviews, a conversation, and check runs, answered the way
 * `gh api --paginate --slurp` prints them.
 */

export const HEAD = 'aaa111'
export const NOW = new Date('2026-11-10T12:00:00Z')

/** What a fake GitHub holds for one PR. */
export type Fixture = {
    pull: Record<string, unknown>
    comments: unknown[]
    reviews: unknown[]
    issue_comments: unknown[]
    check_runs: unknown[]
    annotations: Record<string, unknown[]>
}

export const fixture = (over: Partial<Fixture> = {}): Fixture => ({
    pull: {
        title: 'Add the cart total',
        state: 'open',
        draft: false,
        merged: false,
        head: { sha: HEAD, ref: 'cart-total' },
        base: { ref: 'main' },
        labels: [{ name: 'changes-wanted' }],
    },
    comments: [
        {
            id: 1,
            user: { login: 'octocat' },
            body: 'Rename this.',
            in_reply_to_id: null,
            commit_id: HEAD,
            created_at: '2026-11-09T10:00:00Z',
            path: 'src/cart.ts',
            line: 3,
            html_url: 'https://github.test/c/1',
        },
        {
            id: 2,
            user: { login: 'review-bot[bot]' },
            body: 'Possible null.',
            in_reply_to_id: null,
            commit_id: 'old',
            created_at: '2026-11-09T10:00:00Z',
            path: 'src/total.ts',
            line: 8,
            html_url: 'https://github.test/c/2',
        },
    ],
    reviews: [
        {
            id: 50,
            user: { login: 'octocat' },
            body: 'Overall: needs a test.',
            state: 'COMMENTED',
            submitted_at: '2026-11-09T10:05:00Z',
            html_url: 'https://github.test/r/50',
        },
    ],
    issue_comments: [],
    check_runs: [
        {
            id: 7,
            name: 'Quality',
            status: 'completed',
            conclusion: 'success',
            app: { slug: 'quality-app' },
            output: { annotations_count: 2 },
        },
        {
            id: 8,
            name: 'Build',
            status: 'queued',
            app: { slug: 'github-actions' },
            output: { annotations_count: 0 },
        },
    ],
    annotations: {
        '7': [
            {
                path: 'src/cart.ts',
                start_line: 4,
                end_line: 4,
                annotation_level: 'warning',
                title: 'Duplicate block',
                message: 'Same as lines 20-24',
                blob_href: 'https://github.test/blob',
            },
            {
                path: '.github',
                start_line: 1,
                end_line: 1,
                annotation_level: 'warning',
                message: 'Node 16 is deprecated',
            },
        ],
    },
    ...over,
})

/** A `gh` that answers from a fixture and remembers every call. */
export const fakeGh = (data: Fixture): { gh: Gh; calls: string[][] } => {
    const calls: string[][] = []
    const ok = (value: unknown) => ({
        ok: true,
        stdout: typeof value === 'string' ? value : JSON.stringify(value),
        stderr: '',
    })
    const gh: Gh = ({ args }) => {
        calls.push(args)
        const [command, path = ''] = args
        if (command === 'repo') return Promise.resolve(ok('octo-org/shop\n'))
        if (command === 'pr') return Promise.resolve(ok('212\n'))
        if (path === 'user') return Promise.resolve(ok('octocat\n'))
        if (path.endsWith('/pulls/212')) return Promise.resolve(ok(data.pull))
        if (path.endsWith('/pulls/212/comments')) {
            // Two pages, as --paginate --slurp prints them.
            return Promise.resolve(
                ok([data.comments.slice(0, 1), data.comments.slice(1)])
            )
        }
        if (path.endsWith('/pulls/212/reviews')) {
            return Promise.resolve(ok([data.reviews]))
        }
        if (path.endsWith('/issues/212/comments')) {
            return Promise.resolve(ok([data.issue_comments]))
        }
        if (path.endsWith(`/commits/${HEAD}/check-runs`)) {
            return Promise.resolve(ok([{ check_runs: data.check_runs }]))
        }
        const run_id = /check-runs\/(\d+)\/annotations$/.exec(path)?.[1]
        if (run_id !== undefined) {
            return Promise.resolve(ok([data.annotations[run_id] ?? []]))
        }
        return Promise.resolve({
            ok: false,
            stdout: '',
            stderr: `unexpected call: ${args.join(' ')}`,
        })
    }
    return { gh, calls }
}
