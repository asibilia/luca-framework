import { describe, expect, test } from 'bun:test'

import {
    fitPullRequestBody,
    MAX_SUMMARY_PICTURE,
    pullRequestText,
    withNotInRun,
} from './pull-request-text'

import {
    EMPTY_FINAL_REVIEW,
    EMPTY_TICKET_PROGRESS,
    type FinalReviewState,
    type ReplayedSnapshot,
    type TicketProgress,
} from '../journal/replay'
import { practiceTicket } from '../testing/build-fixtures'

/**
 * Before the PR opens, the engine re-reads the spec's sub-issues. The open
 * ones that are not in the run (#484), such as one reopened while the run
 * went, or one closed at intake and reopened since, are named in the PR.
 */

const BODY = [
    'Built by the Luca engine from spec #10.',
    '## Tickets\n\n- Closes #11: Add sum',
    '## Assumptions\n\nCalls agents made by themselves. Please check them.\n\n- #11: Numbers are integers.',
].join('\n\n')

describe('the PR names open tickets that are not in the run', () => {
    test('they go right after the tickets, under "Not in this run", with number and title', () => {
        expect(
            withNotInRun({
                body: BODY,
                open: [
                    { number: 13, title: 'Add the menu item' },
                    { number: 14, title: 'Export rows' },
                ],
            })
        ).toBe(
            [
                'Built by the Luca engine from spec #10.',
                '## Tickets\n\n- Closes #11: Add sum',
                "## Not in this run\n\nOpen tickets of the spec that this run didn't build. This PR doesn't close them.\n\n- #13 Add the menu item\n- #14 Export rows",
                '## Assumptions\n\nCalls agents made by themselves. Please check them.\n\n- #11: Numbers are integers.',
            ].join('\n\n')
        )
    })

    test('with none, the body stays as it is', () => {
        expect(withNotInRun({ body: BODY, open: [] })).toBe(BODY)
    })

    test('a body with nothing after its tickets gets the section at the end', () => {
        const body = 'Built.\n\n## Tickets\n\n- Closes #11: Add sum'
        expect(
            withNotInRun({ body, open: [{ number: 13, title: 'Menu' }] })
        ).toBe(
            `${body}\n\n## Not in this run\n\nOpen tickets of the spec that this run didn't build. This PR doesn't close them.\n\n- #13 Menu`
        )
    })
})

/**
 * The PR body opens with what a reviewer needs first (#513): the final
 * review's Summary picture and Merge Danger (from the integration lens),
 * and the Evidence that each ticket's tests failed first and pass now.
 */

const SNAPSHOT: ReplayedSnapshot = {
    spec: {
        number: 10,
        title: 'Spec',
        body: '',
        labels: [],
        url: 'https://github.com/acme/app/issues/10',
        author: 'owner',
    },
    ticket_order: [11],
    closed_tickets: [],
    tickets: { 11: practiceTicket({ number: 11 }) },
    left_out: [],
}

const TICKETS: Record<number, TicketProgress> = {
    11: {
        ...EMPTY_TICKET_PROGRESS,
        red_tests: [{ file: 'src/sum.test.ts', name: 'sum adds two numbers' }],
        gates: { ok: true, checks: [] },
    },
}

const PICTURE = '```\nsum()\n└── add()\n```'

const REVIEWED: FinalReviewState = {
    ...EMPTY_FINAL_REVIEW,
    round: 1,
    passed: true,
    summary_picture: PICTURE,
    merge_danger: {
        door: 'one_way',
        door_reason: 'It drops the old table.',
        blast_radius: 'medium',
        blast_radius_reason: 'Every report reads it.',
    },
}

const EVIDENCE =
    "## Evidence\n\nEach ticket's new tests failed before its code was written (the red check), and pass now (the gates).\n\n" +
    '- #11: 1 new test failed first, now passes: sum adds two numbers'

describe('the PR body leads with Summary, Merge danger, and Evidence', () => {
    test('in that order, after the "Built by" line and before the tickets', () => {
        expect(
            pullRequestText({
                snapshot: SNAPSHOT,
                tickets: TICKETS,
                final_review: REVIEWED,
            }).body
        ).toBe(
            [
                'Built by the Luca engine from spec #10.',
                `## Summary\n\n${PICTURE}`,
                '## Merge danger\n\n- **Door:** one-way: It drops the old table.\n- **Blast radius:** medium: Every report reads it.',
                EVIDENCE,
                '## Tickets\n\n- Closes #11: Add sum',
            ].join('\n\n')
        )
    })

    test('open findings of a shipped review still come first', () => {
        const { body } = pullRequestText({
            snapshot: SNAPSHOT,
            tickets: TICKETS,
            final_review: {
                ...REVIEWED,
                passed: false,
                shipped: true,
                stuck: { reason: 'changes_requested', detail: 'why' },
            },
        })
        const at = (text: string) => body.indexOf(text)

        expect(body.startsWith('## Open findings')).toBe(true)
        expect(at('## Open findings')).toBeLessThan(at('Built by the Luca'))
        expect(at('Built by the Luca')).toBeLessThan(at('## Summary'))
        expect(at('## Summary')).toBeLessThan(at('## Merge danger'))
        expect(at('## Merge danger')).toBeLessThan(at('## Evidence'))
        expect(at('## Evidence')).toBeLessThan(at('## Tickets'))
    })

    test('without a final review, Summary and Merge danger say they are not available', () => {
        const expected = [
            'Built by the Luca engine from spec #10.',
            '## Summary\n\nNot available: the final review gave no picture.',
            '## Merge danger\n\nNot available: the final review gave no merge danger.',
            EVIDENCE,
            '## Tickets\n\n- Closes #11: Add sum',
        ].join('\n\n')

        expect(
            pullRequestText({ snapshot: SNAPSHOT, tickets: TICKETS }).body
        ).toBe(expected)
        expect(
            pullRequestText({
                snapshot: SNAPSHOT,
                tickets: TICKETS,
                final_review: EMPTY_FINAL_REVIEW,
            }).body
        ).toBe(expected)
    })

    test('a runaway picture is clipped', () => {
        const { body } = pullRequestText({
            snapshot: SNAPSHOT,
            tickets: TICKETS,
            final_review: {
                ...REVIEWED,
                summary_picture: 'x'.repeat(MAX_SUMMARY_PICTURE * 3),
            },
        })
        const summary = body.slice(
            body.indexOf('## Summary'),
            body.indexOf('## Merge danger')
        )

        expect(summary.length).toBeLessThan(MAX_SUMMARY_PICTURE + 200)
        expect(summary).toContain('clipped')
    })
})

describe('fitting a long PR body with Summary, Merge danger, and Evidence', () => {
    test('Summary and Merge danger stay in the body; a long Evidence moves to the comments', () => {
        const many = Array.from({ length: 400 }, (_, index) => 11 + index)
        const snapshot: ReplayedSnapshot = {
            ...SNAPSHOT,
            ticket_order: many,
            tickets: Object.fromEntries(
                many.map((number) => [number, practiceTicket({ number })])
            ),
        }
        const tickets = Object.fromEntries(
            many.map((number): [number, TicketProgress] => [
                number,
                {
                    ...EMPTY_TICKET_PROGRESS,
                    red_tests: Array.from({ length: 5 }, (_, index) => ({
                        file: 'src/sum.test.ts',
                        name: `ticket ${number} > a long test name that says what it checks ${index}`,
                    })),
                    gates: { ok: true, checks: [] },
                },
            ])
        )
        const full = pullRequestText({
            snapshot,
            tickets,
            final_review: REVIEWED,
        }).body
        const budget = 20_000
        expect(full.length).toBeGreaterThan(budget)

        const { body, comments } = fitPullRequestBody({ body: full, budget })

        expect(body.length).toBeLessThan(budget)
        expect(body).toContain(`## Summary\n\n${PICTURE}`)
        expect(body).toContain('## Merge danger\n\n- **Door:** one-way')
        expect(body).not.toContain('## Evidence')
        expect(body).toContain('## More in the PR comments')
        expect(comments.join('\n')).toContain('## Evidence')
        expect(comments.join('\n')).toContain('- #410: 5 new tests')
    })

    test('an Evidence that fits only without the tickets still moves, so every ticket stays', () => {
        const many = Array.from({ length: 400 }, (_, index) => 11 + index)
        const snapshot: ReplayedSnapshot = {
            ...SNAPSHOT,
            ticket_order: many,
            tickets: Object.fromEntries(
                many.map((number) => [number, practiceTicket({ number })])
            ),
        }
        const tickets = Object.fromEntries(
            many.map((number): [number, TicketProgress] => [
                number,
                {
                    ...EMPTY_TICKET_PROGRESS,
                    red_tests: [{ file: 'src/sum.test.ts', name: 'sum adds' }],
                    gates: { ok: true, checks: [] },
                },
            ])
        )
        const full = pullRequestText({
            snapshot,
            tickets,
            final_review: REVIEWED,
        }).body
        const evidence = full.slice(
            full.indexOf('## Evidence'),
            full.indexOf('## Tickets')
        )
        const tickets_text = full.slice(full.indexOf('## Tickets'))
        const budget = full.length - tickets_text.length + 2_000
        expect(evidence.length).toBeLessThan(budget)
        expect(tickets_text.length).toBeGreaterThan(4_000)

        const { body } = fitPullRequestBody({ body: full, budget })

        expect(body.length).toBeLessThan(budget)
        expect(body).not.toContain('## Evidence')
        expect(body).toContain('- Closes #410: Add sum')
    })
})
