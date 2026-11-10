import { describe, expect, test } from 'bun:test'

import { fetchFindings, parseArgs, workDir } from './fetch-findings'
import { fakeGh, fixture, HEAD, NOW } from './testing-fixtures'

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
            wait_checks: null,
            check_summary: null,
        })
        expect(
            parseArgs(['--wait-checks', '15', '--check-summary', 'summary.md'])
        ).toMatchObject({ wait_checks: 15, check_summary: 'summary.md' })
        expect(() => parseArgs(['--wait-checks', 'soon'])).toThrow(
            '--wait-checks needs a number of minutes'
        )
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

    test('a summary answers only the findings it lists, so a review that arrived while the run was working stays open', async () => {
        const summary = [
            `<!-- luca-pr-address summary iteration=1 head=${HEAD} -->`,
            '<!-- luca-pr-address covers',
            'rv-50',
            'alert-7-src/cart.ts-4',
            '-->',
            '## Review addressed, iteration 1',
        ].join('\n')
        const base = fixture()
        const { gh } = fakeGh(
            fixture({
                reviews: [
                    ...base.reviews,
                    // Submitted BEFORE the summary was posted, but after the
                    // run fetched: the summary never read it.
                    {
                        id: 51,
                        user: { login: 'octocat' },
                        body: 'One more thing: rename the file.',
                        state: 'COMMENTED',
                        submitted_at: '2026-11-09T10:59:00Z',
                        html_url: 'https://github.test/r/51',
                    },
                ],
                issue_comments: [
                    { body: summary, created_at: '2026-11-09T11:00:00Z' },
                ],
            })
        )
        const result = await fetchFindings({ gh, options: options(), now: NOW })
        expect(result.findings.map((f) => [f.id, f.has_reply])).toEqual([
            ['rc-1', false],
            ['rc-2', false],
            ['rv-50', true],
            ['rv-51', false],
            ['alert-7-src/cart.ts-4', true],
        ])
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
