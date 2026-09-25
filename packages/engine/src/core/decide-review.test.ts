import { describe, expect, test } from 'bun:test'

import { decide } from './decide'
import { MAX_FIX_ROUNDS } from './decide-build'

import type { Finding } from '../agents/role-results'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentFailed,
    commitMade,
    finding,
    gatesRun,
    implemented,
    intakePassed,
    joined,
    leftoverScan,
    practiceTicket,
    pushed,
    reviewed,
    runBranchCreated,
    SESSIONS,
    testsWritten,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import { finalReviewClean } from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'
import { REFACTOR_LABEL } from '../tracker/tracker'

const TICKET = practiceTicket({ number: 11 })

/** Decide on a run with these tickets and these entries after intake. */
const decideAfter = (entries: JournalEntry[], tickets = [TICKET]) =>
    decide({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets }),
                ...withInstalls({ entries }),
            ],
        }),
    })

/** Ticket #11 built up to its green commit, before any review. */
const committed = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }).slice(0, 10),
]

/** The steps after the fixers answer: gates pass, and the fix commit. */
const fixCommitted = ({ round }: { round: number }): JournalEntry[] => [
    gatesRun({ ticket: 11, target: 'ticket', ok: true }),
    leftoverScan({ ticket: 11, stage: 'fix' }),
    commitMade({
        ticket: 11,
        stage: 'fix',
        sha: `fix-${round}-sha`,
        files: ['src/sum.ts'],
    }),
]

/** One whole review fix round of a code finding, fixed, up to the fix commit. */
const codeFixRound = ({
    round,
    findings,
}: {
    round: number
    findings: Finding[]
}): JournalEntry[] => [
    reviewed({ ticket: 11, findings }),
    implemented({
        ticket: 11,
        finding_responses: findings.map(({ id }) => ({
            finding_id: id,
            response: 'fixed',
            reason: '',
        })),
    }),
    ...fixCommitted({ round }),
]

const promptOf = (action: ReturnType<typeof decideAfter>): string => {
    if (action.type !== 'launch_agent') throw new Error(action.type)
    return action.prompt
}

const CODE = finding({ id: 'R1-1', title: 'Sum drops negatives' })
const TEST = finding({
    id: 'R1-2',
    kind: 'test',
    severity: 'blocker',
    title: 'The test only checks zero',
    file: 'src/sum.test.ts',
})
const NIT = finding({ id: 'R1-3', severity: 'nit', title: 'Name the param' })

describe('decision step: the ticket review', () => {
    test('a fresh reviewer gets the committed diff and the gate results', () => {
        const action = decideAfter([
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }).slice(0, 8),
            leftoverScan({ ticket: 11, stage: 'green' }),
            commitMade({ ticket: 11, stage: 'green', files: ['src/sum.ts'] }),
        ])

        expect(action).toMatchObject({
            type: 'launch_agent',
            role: 'ticket-reviewer',
            may_edit_tests: false,
        })
        const prompt = promptOf(action)
        expect(prompt).toContain('git diff b0..green-sha')
        expect(prompt).toContain('- src/sum.ts')
        expect(prompt).toContain('- test (`bun test`): passed')
        expect(prompt).toContain('AC1: sum adds two numbers')
    })

    test("a refactor ticket's reviewer also checks that behavior didn't change", () => {
        const refactor = practiceTicket({
            number: 11,
            labels: ['ready-for-agent', REFACTOR_LABEL],
        })
        const prompt = promptOf(
            decideAfter(
                [
                    ...committed().slice(0, 3),
                    implemented({ ticket: 11 }),
                    gatesRun({ ticket: 11, target: 'ticket', ok: true }),
                    leftoverScan({ ticket: 11, stage: 'green' }),
                    commitMade({ ticket: 11, stage: 'green' }),
                ],
                [refactor]
            )
        )

        expect(prompt).toContain('behavior did NOT change')
    })

    test('an approval with only nits moves on to the join', () => {
        expect(
            decideAfter([
                ...committed(),
                reviewed({ ticket: 11, findings: [NIT] }),
            ])
        ).toEqual({ type: 'join_run_branch', ticket: 11 })
    })
})

describe('decision step: review findings go back for fixing', () => {
    test('a code finding goes back to the same implementer session', () => {
        const action = decideAfter([
            ...committed(),
            reviewed({ ticket: 11, findings: [CODE, NIT] }),
        ])

        expect(action).toMatchObject({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'implementer',
            session_id: SESSIONS.implementer,
        })
        if (action.type !== 'follow_up_agent') throw new Error(action.type)
        expect(action.message).toContain('R1-1')
        expect(action.message).toContain('Sum drops negatives')
        expect(action.message).not.toContain('R1-3')
    })

    test("once the implementer's session is closed, code findings go to a fresh implementer", () => {
        const action = decideAfter([
            ...committed(),
            {
                kind: 'agent_session_closed',
                ticket: 11,
                role: 'implementer',
                content: {
                    role: 'implementer',
                    session_id: SESSIONS.implementer,
                },
            },
            reviewed({ ticket: 11, findings: [CODE] }),
        ])

        expect(action).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'implementer',
        })
        const prompt = promptOf(action)
        expect(prompt).toContain('R1-1')
        expect(prompt).toContain('Sum drops negatives')
    })

    test('test findings go to a fresh test-writer first, with only the test findings', () => {
        const action = decideAfter([
            ...committed(),
            reviewed({ ticket: 11, findings: [CODE, TEST] }),
        ])

        expect(action).toMatchObject({
            type: 'launch_agent',
            role: 'test-writer',
            may_edit_tests: true,
        })
        const prompt = promptOf(action)
        expect(prompt).toContain('R1-2')
        expect(prompt).toContain('The test only checks zero')
        expect(prompt).not.toContain('Sum drops negatives')
    })

    test('then the code findings go to the implementer, in the same round', () => {
        expect(
            decideAfter([
                ...committed(),
                reviewed({ ticket: 11, findings: [CODE, TEST] }),
                testsWritten({ ticket: 11, session_id: 'tw-2' }),
            ])
        ).toMatchObject({
            type: 'follow_up_agent',
            role: 'implementer',
            session_id: SESSIONS.implementer,
        })
    })

    test('with no implementer session left, a fresh implementer gets the code findings', () => {
        const action = decideAfter([
            ...committed(),
            reviewed({ ticket: 11, findings: [CODE] }),
            agentFailed({
                ticket: 11,
                role: 'implementer',
                failure: 'engine',
                session_id: null,
            }),
        ])

        expect(action).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
        })
        expect(promptOf(action)).toContain('Sum drops negatives')
    })

    test('a test-only round still runs the gates before the re-review', () => {
        expect(
            decideAfter([
                ...committed(),
                reviewed({ ticket: 11, findings: [TEST] }),
                testsWritten({ ticket: 11, session_id: 'tw-2' }),
            ])
        ).toEqual({ type: 'run_gates', ticket: 11, target: 'ticket' })
    })

    test('every fix passes the gates: failed gates go back to the implementer', () => {
        const action = decideAfter([
            ...committed(),
            reviewed({ ticket: 11, findings: [CODE] }),
            implemented({ ticket: 11 }),
            gatesRun({ ticket: 11, target: 'ticket', ok: false }),
        ])

        expect(action).toMatchObject({
            type: 'follow_up_agent',
            role: 'implementer',
        })
        if (action.type !== 'follow_up_agent') throw new Error(action.type)
        expect(action.message).toContain('The gates failed')
    })

    test('passing fixes get their own commit', () => {
        expect(
            decideAfter([
                ...committed(),
                reviewed({ ticket: 11, findings: [CODE] }),
                implemented({ ticket: 11 }),
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
            ])
        ).toEqual({
            type: 'commit_ticket',
            ticket: 11,
            stage: 'fix',
            message: 'fix: review round 1 for #11 Add sum',
        })
    })
})

describe('decision step: re-reviews', () => {
    test('a fresh reviewer sees only the new changes and the earlier findings', () => {
        const action = decideAfter([
            ...committed(),
            ...codeFixRound({ round: 1, findings: [CODE] }),
        ])

        expect(action).toMatchObject({
            type: 'launch_agent',
            role: 'ticket-reviewer',
        })
        const prompt = promptOf(action)
        expect(prompt).toContain('git diff green-sha..fix-1-sha')
        expect(prompt).not.toContain('git diff b0..')
        expect(prompt).toContain('R1-1')
        expect(prompt).toContain('Fixer: fixed.')
    })

    test("the re-reviewer sees a fixer's won't fix and its reason", () => {
        const prompt = promptOf(
            decideAfter([
                ...committed(),
                reviewed({ ticket: 11, findings: [CODE] }),
                implemented({
                    ticket: 11,
                    finding_responses: [
                        {
                            finding_id: 'R1-1',
                            response: 'wont_fix',
                            reason: 'Negatives are out of scope.',
                        },
                    ],
                }),
                ...fixCommitted({ round: 1 }),
            ])
        )

        expect(prompt).toContain(
            "WON'T FIX. Reason: Negatives are out of scope."
        )
    })

    test('a rejected pushback keeps the finding open for the next round', () => {
        const action = decideAfter([
            ...committed(),
            reviewed({ ticket: 11, findings: [CODE] }),
            implemented({
                ticket: 11,
                finding_responses: [
                    { finding_id: 'R1-1', response: 'wont_fix', reason: 'No.' },
                ],
            }),
            ...fixCommitted({ round: 1 }),
            reviewed({
                ticket: 11,
                findings: [CODE],
                rulings: [
                    {
                        finding_id: 'R1-1',
                        ruling: 'rejected',
                        reason: 'The spec needs negatives.',
                    },
                ],
            }),
        ])

        expect(action).toMatchObject({
            type: 'follow_up_agent',
            role: 'implementer',
        })
        if (action.type !== 'follow_up_agent') throw new Error(action.type)
        expect(action.message).toContain('Review fix round 2')
        expect(action.message).toContain('R1-1')
    })

    test(`still asking for changes after ${MAX_FIX_ROUNDS} fix rounds is stuck`, () => {
        const action = decideAfter([
            ...committed(),
            ...codeFixRound({ round: 1, findings: [CODE] }),
            ...codeFixRound({ round: 2, findings: [CODE] }),
            ...codeFixRound({ round: 3, findings: [CODE] }),
            reviewed({ ticket: 11, findings: [CODE] }),
        ])

        expect(action).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'changes_requested',
        })
        if (action.type !== 'mark_stuck') throw new Error(action.type)
        expect(action.detail).toContain(`after ${MAX_FIX_ROUNDS} fix rounds`)
        expect(action.detail).toContain('Sum drops negatives')
    })

    test('an approving re-review after the last fix round joins the ticket', () => {
        expect(
            decideAfter([
                ...committed(),
                ...codeFixRound({ round: 1, findings: [CODE] }),
                ...codeFixRound({ round: 2, findings: [CODE] }),
                ...codeFixRound({ round: 3, findings: [CODE] }),
                reviewed({ ticket: 11 }),
            ])
        ).toEqual({ type: 'join_run_branch', ticket: 11 })
    })
})

describe('decision step: nits and declined findings in the PR', () => {
    test('the PR lists every nit and each declined finding', () => {
        const action = decideAfter([
            ...committed(),
            reviewed({ ticket: 11, findings: [CODE, NIT] }),
            implemented({
                ticket: 11,
                finding_responses: [
                    {
                        finding_id: 'R1-1',
                        response: 'wont_fix',
                        reason: 'Negatives are out of scope.',
                    },
                ],
            }),
            ...fixCommitted({ round: 1 }),
            reviewed({
                ticket: 11,
                findings: [
                    finding({
                        id: 'R2-1',
                        severity: 'nit',
                        title: 'Tidy the loop',
                    }),
                ],
                rulings: [
                    {
                        finding_id: 'R1-1',
                        ruling: 'accepted',
                        reason: 'The spec says integers only.',
                    },
                ],
            }),
            joined({ ticket: 11 }),
            gatesRun({ ticket: 11, target: 'run_branch', ok: true }),
            pushed({ ticket: 11 }),
            ...finalReviewClean(),
        ])

        expect(action).toMatchObject({ type: 'open_pull_request' })
        if (action.type !== 'open_pull_request') throw new Error(action.type)
        expect(action.body).toContain('## Nits')
        expect(action.body).toContain('#11 R1-3')
        expect(action.body).toContain('Name the param')
        expect(action.body).toContain('Tidy the loop')
        expect(action.body).toContain('## Declined findings')
        expect(action.body).toContain('Sum drops negatives')
        expect(action.body).toContain('Negatives are out of scope.')
        expect(action.body).toContain('The spec says integers only.')
    })
})
