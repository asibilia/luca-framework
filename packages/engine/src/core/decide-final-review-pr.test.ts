import { describe, expect, test } from 'bun:test'

import { LENS_NAMES } from '../agents/role-results'
import type { JournalEntry } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    agentFailed,
    agentStarted,
    implemented,
    intakePassed,
    pullRequestOpened,
    RUN_BRANCH_PATH,
    ticketPath,
    withInstalls,
    worktreesRemoved,
} from '../testing/build-fixtures'
import {
    finalReviewFixing,
    finalReviewPassed,
    finalReviewShipped,
    finalReviewStarted,
    finalReviewStuck,
    lensFinding,
    lensReviewed,
    lensRound,
} from '../testing/final-review-fixtures'
import {
    built,
    fixesLanded,
    SECURITY,
    securityFixRound,
    stepAfter,
    stepsAfter,
    TICKET,
} from '../testing/final-review-steps'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1, the final review's end: a stuck final review, its `ship`, and
 * the PR's Summary and Merge Danger from the integration lens. The rest of
 * the final review's decisions are in `decide-final-review.test.ts`.
 */

describe('decision step: a stuck final review', () => {
    const stuckReview = (): JournalEntry[] => [
        ...built(),
        ...lensRound({ round: 1, findings: { security: [SECURITY] } }),
        finalReviewStuck({
            reason: 'changes_requested',
            detail: 'still security-S1',
        }),
    ]

    test("opens no PR: the tickets' worktrees go, the run branch worktree stays, and the spec issue hears of it", () => {
        expect(stepAfter(stuckReview())).toEqual({
            type: 'remove_worktrees',
            paths: [ticketPath(11)],
        })
        expect(
            stepAfter([
                ...stuckReview(),
                worktreesRemoved({ paths: [ticketPath(11)] }),
            ])
        ).toMatchObject({ type: 'report_final_review_stuck', spec_number: 10 })
    })

    test('a ship reply opens the PR with the open findings at the top', () => {
        const shipped = [
            ...stuckReview(),
            worktreesRemoved({ paths: [ticketPath(11)] }),
            finalReviewShipped(),
        ]

        const pr = stepAfter(shipped)
        if (pr.type !== 'open_pull_request') throw new Error(pr.type)
        expect(pr.body.startsWith('## Open findings')).toBe(true)
        expect(pr.body).toContain(
            '- security lens, should-fix (src/sum.ts): security-S1 Sum trusts its input'
        )
        expect(pr.body.indexOf('## Open findings')).toBeLessThan(
            pr.body.indexOf('Built by the Luca engine')
        )
        // Listed once, though the settled round's results hold it too.
        expect(pr.body.split('security-S1 Sum trusts its input')).toHaveLength(
            2
        )
        expect(stepAfter([...shipped, pullRequestOpened()])).toEqual({
            type: 'remove_worktrees',
            paths: [RUN_BRANCH_PATH],
        })
    })

    test('a ship reply to a fresh pass stuck on a failed lens lists the findings of the lenses that finished it', () => {
        const SIMPLE = [
            lensFinding({ id: 'F1', file: 'src/case-schema.ts' }),
            lensFinding({ id: 'F2', file: 'src/case-actions.ts' }),
        ]
        const integrationFailed = (): JournalEntry[] => [
            agentStarted({ ticket: null, role: 'integration-lens' }),
            agentFailed({
                ticket: null,
                role: 'integration-lens',
                failure: 'agent',
                out_of_turns: true,
            }),
        ]
        const shipped = [
            ...built(),
            ...lensRound({ round: 1, findings: { security: [SECURITY] } }),
            ...securityFixRound({ round: 1 }),
            ...lensRound({
                round: 2,
                lenses: ['security'],
                from_sha: 'g1',
                head_sha: 'fix-1',
            }),
            finalReviewStarted({ round: 3, head_sha: 'fix-1', fresh: true }),
            ...LENS_NAMES.filter((lens) => lens !== 'integration').flatMap(
                (lens) =>
                    lensReviewed({
                        lens,
                        round: 3,
                        findings: lens === 'simplification' ? SIMPLE : [],
                    })
            ),
            ...integrationFailed(),
            ...integrationFailed(),
            ...integrationFailed(),
            finalReviewStuck({ reason: 'agent_failed' }),
            worktreesRemoved({ paths: [ticketPath(11)] }),
            finalReviewShipped(),
        ]

        const pr = stepAfter(shipped)
        if (pr.type !== 'open_pull_request') throw new Error(pr.type)
        expect(pr.body).not.toContain('No lens finding was open')
        expect(pr.body).toContain(
            '- simplification lens, should-fix (src/case-schema.ts): simplification-F1 Finding F1\n' +
                '- simplification lens, should-fix (src/case-actions.ts): simplification-F2 Finding F2'
        )
    })

    test('a ship reply to a final review that is not stuck changes nothing', () => {
        expect(stepAfter([...built(), finalReviewShipped()])).toMatchObject({
            type: 'start_final_review',
        })
    })
})

/**
 * The integration lens also gives the PR's Summary picture and Merge Danger
 * on its first round (#513). Replay keeps them across rounds: a re-review
 * gives null for both, which never wipes the first round's.
 */
describe("the integration lens's Summary and Merge Danger", () => {
    const PICTURE = '```\nsum()\n└── add()\n```'
    const DANGER = {
        door: 'two_way' as const,
        door_reason: 'A revert undoes it.',
        blast_radius: 'small' as const,
        blast_radius_reason: 'Only sum changes.',
    }
    const INTEGRATION = lensFinding({ id: 'I1', title: 'Sum and add disagree' })

    const stateAfter = (entries: JournalEntry[]) =>
        replayRun({
            records: recordsFrom({
                entries: [
                    ...intakePassed({ tickets: [TICKET] }),
                    ...withInstalls({ entries }),
                ],
            }),
        })

    const firstRound = (findings: ReturnType<typeof lensFinding>[]) => [
        finalReviewStarted({ round: 1 }),
        ...LENS_NAMES.flatMap((lens) =>
            lens === 'integration'
                ? lensReviewed({
                      lens,
                      round: 1,
                      findings,
                      summary_picture: PICTURE,
                      merge_danger: DANGER,
                  })
                : lensReviewed({ lens, round: 1 })
        ),
    ]

    test('replay keeps them from the first round', () => {
        const state = stateAfter([...built(), ...firstRound([])])

        expect(state.final_review.summary_picture).toBe(PICTURE)
        expect(state.final_review.merge_danger).toEqual(DANGER)
    })

    test("a re-review's nulls do not wipe them", () => {
        const state = stateAfter([
            ...built(),
            ...firstRound([INTEGRATION]),
            ...[
                finalReviewFixing({ round: 1 }),
                implemented({
                    ticket: null,
                    finding_responses: [
                        {
                            finding_id: 'integration-I1',
                            response: 'fixed',
                            reason: '',
                        },
                    ],
                }),
                ...fixesLanded({ sha: 'fix-1' }),
            ],
            finalReviewStarted({
                round: 2,
                lenses: ['integration'],
                from_sha: 'g1',
                head_sha: 'fix-1',
            }),
            ...lensReviewed({
                lens: 'integration',
                round: 2,
                summary_picture: null,
                merge_danger: null,
            }),
        ])

        expect(state.final_review.round).toBe(2)
        expect(state.final_review.summary_picture).toBe(PICTURE)
        expect(state.final_review.merge_danger).toEqual(DANGER)
    })

    test('an older journal, whose integration lens gave neither, replays with null for both', () => {
        const state = stateAfter([...built(), ...lensRound({ round: 1 })])

        expect(state.final_review.summary_picture).toBeNull()
        expect(state.final_review.merge_danger).toBeNull()
    })

    test('the PR shows the picture and the merge danger', () => {
        const pr = stepsAfter([
            ...built(),
            ...firstRound([]),
            finalReviewPassed(),
            worktreesRemoved({ paths: [ticketPath(11)] }),
        ]).find((step) => step.type === 'open_pull_request')
        if (pr?.type !== 'open_pull_request') throw new Error('no PR')

        expect(pr.body).toContain(`## Summary\n\n${PICTURE}`)
        expect(pr.body).toContain(
            '## Merge danger\n\n- **Door:** two-way: A revert undoes it.\n- **Blast radius:** small: Only sum changes.'
        )
        expect(pr.body).toContain('## Evidence\n\n')
        expect(pr.body).toContain(
            '- #11: 1 new test failed first, now passes: sum adds two numbers'
        )
    })
})
