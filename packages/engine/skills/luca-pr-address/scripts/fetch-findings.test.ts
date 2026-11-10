import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
    fetchFindings,
    main,
    parseArgs,
    workDir,
    type Gh,
} from './fetch-findings'

const HEAD = 'aaa111'
const NOW = new Date('2026-11-10T12:00:00Z')

/** What a fake GitHub holds for one PR. */
type Fixture = {
    pull: Record<string, unknown>
    comments: unknown[]
    reviews: unknown[]
    issue_comments: unknown[]
    check_runs: unknown[]
    annotations: Record<string, unknown[]>
}

const fixture = (over: Partial<Fixture> = {}): Fixture => ({
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
const fakeGh = (data: Fixture): { gh: Gh; calls: string[][] } => {
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

const options = (over: Partial<ReturnType<typeof parseArgs>> = {}) => ({
    ...parseArgs([]),
    ...over,
})

describe('parseArgs', () => {
    test('reads a number and every flag', () => {
        expect(
            parseArgs([
                '212',
                '--repo',
                'a/b',
                '--only',
                'bot',
                '--owner',
                'me',
                '--save',
            ])
        ).toEqual({
            pr_number: 212,
            repo: 'a/b',
            only: 'bot',
            owner: 'me',
            save: true,
        })
    })

    test('refuses a flag with no value and an argument it does not know', () => {
        expect(() => parseArgs(['--repo'])).toThrow('--repo needs a value')
        expect(() => parseArgs(['--force'])).toThrow(
            'unknown argument: --force'
        )
    })
})

describe('workDir', () => {
    test('is outside any repo, by owner, repo and PR; an env folder overrides it', () => {
        const ref = { repo: 'octo-org/shop', pr_number: 212 }
        expect(workDir({ home: '/home/me', env: {}, ...ref })).toBe(
            '/home/me/.local/state/luca/pr-address/octo-org/shop/pr-212'
        )
        expect(
            workDir({
                home: '/home/me',
                env: { LUCA_PR_ADDRESS_DIR: '/tmp/x' },
                ...ref,
            })
        ).toBe('/tmp/x/octo-org/shop/pr-212')
    })
})

describe('fetchFindings', () => {
    test('reads all three channels into one list, with the PR’s headline', async () => {
        const { gh } = fakeGh(fixture())
        const result = await fetchFindings({ gh, options: options(), now: NOW })
        expect(result).toMatchObject({
            pr: 212,
            repo: 'octo-org/shop',
            title: 'Add the cart total',
            state: 'OPEN',
            head_sha: HEAD,
            head_ref: 'cart-total',
            base: 'main',
            fetched_at: '2026-11-10T12:00:00.000Z',
            owner: 'octocat',
            changes_wanted: true,
            last_summary_at: null,
            pending_checks: [
                { name: 'Build', app: 'github-actions', status: 'queued' },
            ],
        })
        expect(
            result.findings.map((f) => [f.id, f.source, f.from_owner])
        ).toEqual([
            ['rc-1', 'review_comment', true],
            ['rc-2', 'review_comment', false],
            ['rv-50', 'review_body', true],
            ['alert-7-src/cart.ts-4', 'alert', false],
        ])
        expect(result.ci_notices.map((f) => f.path)).toEqual(['.github'])
        expect(result.stats).toEqual({
            total: 4,
            review_comments: 2,
            review_bodies: 1,
            alerts: 1,
            from_owner: 2,
            already_replied: 0,
            unanswered: 4,
            off_head: 1,
            ci_notices: 1,
            files: 2,
        })
    })

    test('reads the annotations of a check that passed, and never asks for one without any', async () => {
        const { gh, calls } = fakeGh(fixture())
        await fetchFindings({ gh, options: options(), now: NOW })
        const asked = calls.map((args) => args[1] ?? '')
        expect(asked).toContain('repos/octo-org/shop/check-runs/7/annotations')
        expect(asked).not.toContain(
            'repos/octo-org/shop/check-runs/8/annotations'
        )
    })

    test('a summary for this head answers the review text and the alerts, not a new comment', async () => {
        const { gh } = fakeGh(
            fixture({
                issue_comments: [
                    {
                        body: `<!-- luca-pr-address summary iteration=1 head=${HEAD} -->\n## Review addressed`,
                        created_at: '2026-11-09T11:00:00Z',
                    },
                ],
            })
        )
        const result = await fetchFindings({ gh, options: options(), now: NOW })
        expect(result.last_summary_at).toBe('2026-11-09T11:00:00Z')
        expect(result.findings.map((f) => [f.id, f.has_reply])).toEqual([
            ['rc-1', false],
            ['rc-2', false],
            ['rv-50', true],
            ['alert-7-src/cart.ts-4', true],
        ])
        expect(result.stats.unanswered).toBe(2)
    })

    test('--owner names someone else, --only keeps one reviewer, and given values skip the lookups', async () => {
        const { gh, calls } = fakeGh(fixture())
        const result = await fetchFindings({
            gh,
            options: options({
                pr_number: 212,
                repo: 'octo-org/shop',
                owner: 'someone-else',
                only: 'review-bot',
            }),
            now: NOW,
        })
        expect(result.findings.map((f) => f.id)).toEqual(['rc-2'])
        expect(result.stats.from_owner).toBe(0)
        expect(calls.some(([command]) => command === 'repo')).toBe(false)
        expect(calls.some(([command]) => command === 'pr')).toBe(false)
        expect(calls.some((args) => args[1] === 'user')).toBe(false)
    })

    test('a merged PR and a draft say so', async () => {
        const base = fixture().pull
        const merged = fakeGh(
            fixture({ pull: { ...base, merged: true, state: 'closed' } })
        )
        const draft = fakeGh(fixture({ pull: { ...base, draft: true } }))
        expect(
            (
                await fetchFindings({
                    gh: merged.gh,
                    options: options(),
                    now: NOW,
                })
            ).state
        ).toBe('MERGED')
        expect(
            (
                await fetchFindings({
                    gh: draft.gh,
                    options: options(),
                    now: NOW,
                })
            ).state
        ).toBe('DRAFT')
    })
})

describe('main', () => {
    const run = async ({
        argv,
        gh,
        dir,
    }: {
        argv: string[]
        gh: Gh
        dir: string
    }) => {
        const out: string[] = []
        const err: string[] = []
        const code = await main({
            argv,
            gh,
            home: dir,
            env: { LUCA_PR_ADDRESS_DIR: dir },
            out: (line) => out.push(line),
            err: (line) => err.push(line),
        })
        return { code, out: out.join('\n'), err: err.join('\n') }
    }

    test('prints everything; with --save it writes findings.json and prints the headline', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'pr-address-'))
        try {
            const printed = await run({
                argv: [],
                gh: fakeGh(fixture()).gh,
                dir,
            })
            expect(printed.code).toBe(0)
            expect(printed.out).toContain('"findings"')

            const saved = await run({
                argv: ['--save'],
                gh: fakeGh(fixture()).gh,
                dir,
            })
            const work_dir = join(dir, 'octo-org', 'shop', 'pr-212')
            expect(saved.code).toBe(0)
            expect(saved.out).toContain(`"work_dir": "${work_dir}"`)
            expect(saved.out).toContain('"changes_wanted": true')
            expect(saved.out).not.toContain('"findings":')
            const file = await Bun.file(join(work_dir, 'findings.json')).text()
            expect(file).toContain('"id": "rc-1"')
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    test('a failing gh, or a bad flag, exits 1 with the reason', async () => {
        const failing: Gh = () =>
            Promise.resolve({ ok: false, stdout: '', stderr: 'not signed in' })
        const failed = await run({ argv: [], gh: failing, dir: tmpdir() })
        expect(failed.code).toBe(1)
        expect(failed.err).toBe(
            'Could not tell which repo this is: not signed in'
        )
        const bad = await run({
            argv: ['--nope'],
            gh: fakeGh(fixture()).gh,
            dir: tmpdir(),
        })
        expect(bad.code).toBe(1)
        expect(bad.err).toBe('unknown argument: --nope')
    })
})
