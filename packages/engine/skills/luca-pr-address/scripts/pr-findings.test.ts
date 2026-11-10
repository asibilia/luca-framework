import { describe, expect, test } from 'bun:test'

import {
    alertFindings,
    findingStats,
    flattenPages,
    isAnswered,
    isCiNotice,
    labelNames,
    lastSummary,
    matchesOnly,
    pendingChecks,
    prState,
    REPLY_MARKER,
    reviewBodyFindings,
    reviewCommentFindings,
    runsWithAnnotations,
} from './pr-findings'

const HEAD = 'aaa111'

/** A review comment as GitHub returns it. */
const comment = ({
    id,
    login,
    body = 'please fix',
    reply_to = null,
    commit_id = HEAD,
    at = '2026-11-01T10:00:00Z',
    line = 12,
}: {
    id: number
    login: string
    body?: string
    reply_to?: number | null
    commit_id?: string
    at?: string
    line?: number | null
}) => ({
    id,
    user: { login },
    body,
    in_reply_to_id: reply_to,
    commit_id,
    created_at: at,
    path: 'src/cart.ts',
    line,
    original_line: 9,
    html_url: `https://github.test/c/${id}`,
    diff_hunk: '@@ -1 +1 @@',
})

describe('flattenPages', () => {
    test('flattens slurped pages of lists, and of objects holding a list', () => {
        expect(flattenPages({ pages: [[{ a: 1 }], [{ a: 2 }]] })).toEqual([
            { a: 1 },
            { a: 2 },
        ])
        expect(
            flattenPages({
                pages: [
                    { check_runs: [{ id: 1 }] },
                    { check_runs: [{ id: 2 }] },
                ],
                key: 'check_runs',
            })
        ).toEqual([{ id: 1 }, { id: 2 }])
        expect(flattenPages({ pages: 'nonsense' })).toEqual([])
    })
})

describe('reviewCommentFindings', () => {
    test('a root comment is a finding; a reply is not, and marks its thread', () => {
        const findings = reviewCommentFindings({
            comments: [
                comment({ id: 1, login: 'octocat' }),
                comment({ id: 2, login: 'review-bot[bot]' }),
                comment({
                    id: 3,
                    login: 'someone',
                    reply_to: 2,
                    body: 'done by hand',
                }),
            ],
            head_sha: HEAD,
            owner: 'OctoCat',
        })
        expect(findings.map((f) => f.id)).toEqual(['rc-1', 'rc-2'])
        expect(findings[0]).toMatchObject({
            source: 'review_comment',
            author: 'octocat',
            from_owner: true,
            path: 'src/cart.ts',
            line: 12,
            comment_id: 1,
            has_reply: false,
            anchored_to_head: true,
            thread: [],
        })
        expect(findings[1]).toMatchObject({
            from_owner: false,
            has_reply: true,
        })
        expect(findings[1]?.thread).toEqual([
            {
                author: 'someone',
                body: 'done by hand',
                created_at: '2026-11-01T10:00:00Z',
                by_skill: false,
            },
        ])
    })

    test('a comment on an older commit is off the head, and falls back to its original line', () => {
        const [finding] = reviewCommentFindings({
            comments: [
                comment({ id: 1, login: 'x', commit_id: 'old', line: null }),
            ],
            head_sha: HEAD,
            owner: 'octocat',
        })
        expect(finding).toMatchObject({ anchored_to_head: false, line: 9 })
    })

    test('an answer written under the skill’s own reply opens the thread again', () => {
        const asked = comment({
            id: 2,
            login: 'octocat',
            reply_to: 1,
            body: `Which count?\n\n${REPLY_MARKER}`,
            at: '2026-11-01T11:00:00Z',
        })
        const answer = comment({
            id: 3,
            login: 'octocat',
            reply_to: 1,
            body: 'The cart count.',
            at: '2026-11-01T12:00:00Z',
        })
        const root = comment({ id: 1, login: 'octocat' })
        const waiting = reviewCommentFindings({
            comments: [root, asked],
            head_sha: HEAD,
            owner: 'octocat',
        })
        expect(waiting[0]?.has_reply).toBe(true)
        expect(waiting[0]?.thread?.[0]).toMatchObject({
            body: 'Which count?',
            by_skill: true,
        })
        // Out of order on purpose: the thread is sorted by time.
        const reopened = reviewCommentFindings({
            comments: [answer, root, asked],
            head_sha: HEAD,
            owner: 'octocat',
        })
        expect(reopened[0]?.has_reply).toBe(false)
        expect(reopened[0]?.thread?.map((reply) => reply.body)).toEqual([
            'Which count?',
            'The cart count.',
        ])
    })
})

describe('isAnswered', () => {
    const reply = (by_skill: boolean) => ({
        author: 'a',
        body: 'b',
        created_at: 't',
        by_skill,
    })

    test('no replies is unanswered; a hand-written reply alone is answered', () => {
        expect(isAnswered([])).toBe(false)
        expect(isAnswered([reply(false)])).toBe(true)
        expect(isAnswered([reply(true)])).toBe(true)
        expect(isAnswered([reply(true), reply(false)])).toBe(false)
        expect(isAnswered([reply(true), reply(false), reply(true)])).toBe(true)
    })
})

describe('lastSummary and reviewBodyFindings', () => {
    const summary = lastSummary([
        { body: 'just chatting', created_at: '2026-11-03T00:00:00Z' },
        {
            body: '<!-- luca-pr-address summary iteration=1 head=aaa111 -->\n## Review addressed',
            created_at: '2026-11-02T00:00:00Z',
        },
        {
            body: '<!-- luca-pr-address summary iteration=1 head=000 -->',
            created_at: '2026-11-01T00:00:00Z',
        },
    ])

    test('finds the newest summary this skill posted, and the head it covered', () => {
        expect(summary).toEqual({
            at: '2026-11-02T00:00:00Z',
            head_sha: 'aaa111',
        })
        expect(lastSummary([])).toEqual({ at: '', head_sha: '' })
    })

    test('a review with text is a finding, answered once a summary follows it', () => {
        const review = (
            id: number,
            body: string,
            at: string,
            state = 'COMMENTED'
        ) => ({
            id,
            body,
            state,
            submitted_at: at,
            user: { login: 'octocat' },
            html_url: `https://github.test/r/${id}`,
        })
        const findings = reviewBodyFindings({
            reviews: [
                review(1, 'Overall: split this file.', '2026-11-01T12:00:00Z'),
                review(2, '   ', '2026-11-01T12:00:00Z'),
                review(3, 'One more thing.', '2026-11-02T12:00:00Z'),
                review(4, 'not sent yet', '2026-11-02T12:00:00Z', 'PENDING'),
            ],
            owner: 'octocat',
            summary_at: summary.at,
        })
        expect(findings.map((f) => [f.id, f.has_reply])).toEqual([
            ['rv-1', true],
            ['rv-3', false],
        ])
        expect(findings[0]).toMatchObject({
            source: 'review_body',
            from_owner: true,
            path: null,
            comment_id: null,
            review_state: 'COMMENTED',
        })
    })
})

describe('alerts', () => {
    const runs = [
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
            status: 'in_progress',
            app: { slug: 'github-actions' },
            output: { annotations_count: 0 },
        },
    ]

    test('a passing check with annotations is still read, and an unfinished one is pending', () => {
        expect(runsWithAnnotations(runs)).toEqual([7])
        expect(pendingChecks(runs)).toEqual([
            { name: 'Build', app: 'github-actions', status: 'in_progress' },
        ])
    })

    test('annotations become findings; notices and .github paths are CI notices', () => {
        const [run] = runs
        if (run === undefined) throw new Error('no run')
        const findings = alertFindings({
            run,
            answered: false,
            annotations: [
                {
                    path: 'src/cart.ts',
                    start_line: 4,
                    end_line: 6,
                    annotation_level: 'failure',
                    title: 'Too complex',
                    message: 'Complexity 30',
                    blob_href: 'https://github.test/blob',
                },
                {
                    path: '.github',
                    start_line: 1,
                    end_line: 1,
                    annotation_level: 'warning',
                    message: 'Node 16 is deprecated',
                },
                {
                    path: 'src/a.ts',
                    start_line: 1,
                    end_line: 1,
                    annotation_level: 'notice',
                    message: 'summary',
                },
            ],
        })
        expect(findings[0]).toMatchObject({
            id: 'alert-7-src/cart.ts-4',
            source: 'alert',
            author: 'quality-app',
            from_owner: false,
            check: 'Quality',
            level: 'failure',
            line: 4,
            end_line: 6,
            comment_id: null,
            has_reply: false,
        })
        expect(findings.map(isCiNotice)).toEqual([false, true, true])
        expect(
            alertFindings({ run, answered: true, annotations: [{}] })[0]
                ?.has_reply
        ).toBe(true)
    })
})

describe('filters, counts, and the PR itself', () => {
    const findings = [
        ...reviewCommentFindings({
            comments: [
                comment({ id: 1, login: 'octocat' }),
                comment({ id: 2, login: 'Review-Bot', commit_id: 'old' }),
                comment({ id: 3, login: 'x', reply_to: 2 }),
            ],
            head_sha: HEAD,
            owner: 'octocat',
        }),
        ...alertFindings({
            run: { id: 7, name: 'Quality', app: { slug: 'quality-app' } },
            answered: false,
            annotations: [
                {
                    path: 'src/b.ts',
                    start_line: 1,
                    annotation_level: 'warning',
                },
            ],
        }),
    ]

    test('--only matches an author or a check name, in any case', () => {
        const kept = (only: string) =>
            findings
                .filter((finding) => matchesOnly({ finding, only }))
                .map((f) => f.id)
        expect(kept('review-bot')).toEqual(['rc-2'])
        expect(kept('QUALITY')).toEqual(['alert-7-src/b.ts-1'])
    })

    test('the stats count each channel, the owner’s, and what is unanswered', () => {
        expect(findingStats({ findings, ci_notices: [] })).toEqual({
            total: 3,
            review_comments: 2,
            review_bodies: 0,
            alerts: 1,
            from_owner: 1,
            already_replied: 1,
            unanswered: 2,
            off_head: 1,
            ci_notices: 0,
            files: 2,
        })
    })

    test('a PR’s state is one word, and its labels are names', () => {
        expect(prState({ merged: true, state: 'closed' })).toBe('MERGED')
        expect(prState({ draft: true, state: 'open' })).toBe('DRAFT')
        expect(prState({ draft: false, state: 'open' })).toBe('OPEN')
        expect(prState({ merged: false, state: 'closed' })).toBe('CLOSED')
        expect(
            labelNames({ labels: [{ name: 'changes-wanted' }, { nope: 1 }] })
        ).toEqual(['changes-wanted'])
    })
})
