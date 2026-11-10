import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { main, type Gh } from './fetch-findings'
import { fakeGh, fixture, HEAD } from './testing-fixtures'

/**
 * The helper's command line: what it prints and saves, how it waits for
 * checks, and how it checks a summary before it is posted.
 */

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
            sleep: (ms) => {
                slept.push(ms)
                return Promise.resolve()
            },
        })
        return { code, out: out.join('\n'), err: err.join('\n') }
    }
    const slept: number[] = []

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

    test('--wait-checks fetches again until the checks finish, and gives up at its limit without calling them clean', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'pr-address-'))
        try {
            // The Build check finishes on the third fetch.
            const data = fixture()
            const fake = fakeGh(data)
            let fetches = 0
            const gh: Gh = (call) => {
                if ((call.args[1] ?? '').endsWith('/pulls/212')) fetches += 1
                if (fetches === 3) {
                    data.check_runs = data.check_runs.map((check) => ({
                        ...(check as Record<string, unknown>),
                        status: 'completed',
                    }))
                }
                return fake.gh(call)
            }
            slept.length = 0
            const done = await run({ argv: ['--wait-checks', '5'], gh, dir })
            expect(slept).toEqual([30_000, 30_000])
            expect(JSON.parse(done.out)).toMatchObject({
                pending_checks: [],
                checks_still_pending: false,
                waited_seconds: 60,
            })

            // A check that never finishes: one minute is two fetches more.
            slept.length = 0
            const stuck = await run({
                argv: ['--wait-checks', '1', '--save'],
                gh: fakeGh(fixture()).gh,
                dir,
            })
            expect(slept).toEqual([30_000, 30_000])
            expect(stuck.code).toBe(0)
            expect(JSON.parse(stuck.out)).toMatchObject({
                checks_still_pending: true,
                waited_seconds: 60,
                pending_checks: [{ name: 'Build' }],
            })

            // Without the flag nothing waits, and a pending check still shows.
            slept.length = 0
            const plain = await run({ argv: [], gh: fakeGh(fixture()).gh, dir })
            expect(slept).toEqual([])
            expect(JSON.parse(plain.out).checks_still_pending).toBe(true)
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    test('--check-summary is ready only when the summary names the head, lists real findings, and leaves nothing unanswered out', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'pr-address-'))
        try {
            const replied = fixture()
            // Both line comments have this skill's reply under them.
            replied.comments = [
                ...replied.comments,
                ...[1, 2].map((id) => ({
                    id: 10 + id,
                    user: { login: 'octocat' },
                    body: 'Fixed in abc. <!-- luca-pr-address reply -->',
                    in_reply_to_id: id,
                    commit_id: HEAD,
                    created_at: '2026-11-09T10:30:00Z',
                })),
            ]
            const file = join(dir, 'summary.md')
            const summary = (ids: string[], head = HEAD) =>
                [
                    `<!-- luca-pr-address summary iteration=1 head=${head} -->`,
                    '<!-- luca-pr-address covers',
                    ...ids,
                    '-->',
                    '## Review addressed, iteration 1',
                ].join('\n')
            const check = async (text: string, data = replied) => {
                await Bun.write(file, text)
                const { code, out } = await run({
                    argv: ['--check-summary', file],
                    gh: fakeGh(data).gh,
                    dir,
                })
                return { code, ...JSON.parse(out) }
            }

            const all = ['rc-1', 'rc-2', 'rv-50', 'alert-7-src/cart.ts-4']
            expect(await check(summary(all))).toMatchObject({
                code: 0,
                ready: true,
                problems: [],
                late: [],
            })

            // The owner's review text is left out: it is late, never dropped.
            const missed = await check(
                summary(['rc-1', 'rc-2', 'alert-7-src/cart.ts-4'])
            )
            expect(missed.code).toBe(1)
            expect(missed.late).toEqual([
                {
                    id: 'rv-50',
                    source: 'review_body',
                    author: 'octocat',
                    from_owner: true,
                    html_url: 'https://github.test/r/50',
                },
            ])

            // A short sha, an id that is no finding, and no list at all.
            const short = await check(summary(all, 'aaa'))
            expect(short.problems[0]).toContain(
                "head= must be the PR's full head commit after the push"
            )
            const typo = await check(summary([...all, 'rv-999']))
            expect(typo.problems).toEqual([
                'The covers block names rv-999, which is not a finding.',
            ])
            const bare = await check(
                `<!-- luca-pr-address summary iteration=1 head=${HEAD} -->\n## Review addressed`
            )
            expect(bare.problems[0]).toContain('There is no covers block')

            // Covering a line comment whose thread has no reply is refused.
            const unreplied = await check(summary(all), fixture())
            expect(unreplied.problems).toEqual([
                'rc-1 is covered but its thread has no reply yet: reply on the thread first.',
                'rc-2 is covered but its thread has no reply yet: reply on the thread first.',
            ])
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
