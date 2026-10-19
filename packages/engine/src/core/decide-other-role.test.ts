import { describe, expect, test } from 'bun:test'

import { decide, decideSteps, type EngineAction } from './decide'

import type { JournalEntry } from '../journal/journal-record'
import {
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
    testsWritten,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import {
    finalReviewClean,
    finalReviewFixing,
    finalReviewStarted,
    lensFinding,
    lensRound,
} from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * A fixer's `other_role` answer (#616): a finding the other writer role must
 * fix (also) goes to that role, fresh, with only those findings, in the same
 * fix round and before the gates. A second `other_role` for the same
 * finding counts as "won't fix".
 */

const TICKET = practiceTicket({ number: 11 })

/** Every step the decision step can take now, after these entries. */
const stepsAfter = (entries: JournalEntry[]): EngineAction[] =>
    decideSteps({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [TICKET] }),
                ...withInstalls({ entries }),
            ],
        }),
    })

/** The one step the decision step takes after these entries. */
const decideAfter = (entries: JournalEntry[]): EngineAction =>
    decide({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [TICKET] }),
                ...withInstalls({ entries }),
            ],
        }),
    })

const promptOf = (action: EngineAction): string => {
    if (action.type === 'launch_agent') return action.prompt
    if (action.type === 'launch_final_fixer') return action.prompt
    throw new Error(action.type)
}

/** Ticket #11 built up to its green commit, before any review. */
const committed = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }).slice(0, 10),
]

/** The steps after the fixers answer: gates pass, and the fix commit. */
const fixCommitted = (): JournalEntry[] => [
    gatesRun({ ticket: 11, target: 'ticket', ok: true }),
    leftoverScan({ ticket: 11, stage: 'fix' }),
    commitMade({
        ticket: 11,
        stage: 'fix',
        sha: 'fix-1-sha',
        files: ['src/sum.ts'],
    }),
]

const CODE = finding({ id: 'R1-1', title: 'Sum drops negatives' })
const OTHER_CODE = finding({ id: 'R1-4', title: 'Sum overflows' })
const TEST = finding({
    id: 'R1-2',
    kind: 'test',
    severity: 'blocker',
    title: 'The test only checks zero',
    file: 'src/sum.test.ts',
})

describe('decision step: other_role in a ticket review fix round', () => {
    test("an implementer's other_role finding goes to a fresh test-writer with only that finding, before the gates", () => {
        const answered = [
            ...committed(),
            reviewed({ ticket: 11, findings: [CODE, OTHER_CODE] }),
            implemented({
                ticket: 11,
                finding_responses: [
                    {
                        finding_id: 'R1-1',
                        response: 'other_role',
                        reason: 'Negatives need a test.',
                    },
                    { finding_id: 'R1-4', response: 'fixed', reason: '' },
                ],
            }),
        ]

        const action = decideAfter(answered)
        expect(action).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
            may_edit_tests: true,
        })
        const prompt = promptOf(action)
        expect(prompt).toContain('R1-1')
        expect(prompt).toContain('Sum drops negatives')
        expect(prompt).not.toContain('Sum overflows')

        const tested = [
            ...answered,
            testsWritten({
                ticket: 11,
                session_id: 'tw-2',
                finding_responses: [
                    { finding_id: 'R1-1', response: 'fixed', reason: '' },
                ],
            }),
        ]
        expect(decideAfter(tested)).toEqual({
            type: 'run_gates',
            ticket: 11,
            target: 'ticket',
        })
        expect(
            decideAfter([
                ...tested,
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
            ])
        ).toEqual({
            type: 'commit_ticket',
            ticket: 11,
            stage: 'fix',
            message: 'fix: review round 1 for #11 Add sum',
        })
    })

    test("a test-writer's other_role finding goes to a fresh implementer with only that finding, before the gates", () => {
        const answered = [
            ...committed(),
            reviewed({ ticket: 11, findings: [TEST] }),
            testsWritten({
                ticket: 11,
                session_id: 'tw-2',
                finding_responses: [
                    {
                        finding_id: 'R1-2',
                        response: 'other_role',
                        reason: 'The test needs a helper in src/.',
                    },
                ],
            }),
        ]

        const action = decideAfter(answered)
        expect(action).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'implementer',
            may_edit_tests: false,
        })
        const prompt = promptOf(action)
        expect(prompt).toContain('R1-2')
        expect(prompt).toContain('The test only checks zero')

        expect(
            decideAfter([
                ...answered,
                implemented({
                    ticket: 11,
                    session_id: 'impl-2',
                    finding_responses: [
                        { finding_id: 'R1-2', response: 'fixed', reason: '' },
                    ],
                }),
            ])
        ).toEqual({ type: 'run_gates', ticket: 11, target: 'ticket' })
    })

    test("a second other_role for the same finding counts as won't fix: the gates run, the re-reviewer rules on it, and an accepted one is declined in the PR", () => {
        const answered = [
            ...committed(),
            reviewed({ ticket: 11, findings: [CODE] }),
            implemented({
                ticket: 11,
                finding_responses: [
                    {
                        finding_id: 'R1-1',
                        response: 'other_role',
                        reason: 'Negatives need a test.',
                    },
                ],
            }),
            testsWritten({
                ticket: 11,
                session_id: 'tw-2',
                finding_responses: [
                    {
                        finding_id: 'R1-1',
                        response: 'other_role',
                        reason: 'The bug is in sum, not in the tests.',
                    },
                ],
            }),
        ]

        expect(decideAfter(answered)).toEqual({
            type: 'run_gates',
            ticket: 11,
            target: 'ticket',
        })
        const reReview = decideAfter([...answered, ...fixCommitted()])
        expect(reReview).toMatchObject({
            type: 'launch_agent',
            role: 'ticket-reviewer',
        })
        expect(promptOf(reReview)).toContain(
            "WON'T FIX. Reason: The bug is in sum, not in the tests."
        )

        const pr = decideAfter([
            ...answered,
            ...fixCommitted(),
            reviewed({
                ticket: 11,
                rulings: [
                    {
                        finding_id: 'R1-1',
                        ruling: 'accepted',
                        reason: 'Negatives are out of scope.',
                    },
                ],
            }),
            joined({ ticket: 11 }),
            gatesRun({ ticket: 11, target: 'run_branch', ok: true }),
            pushed({ ticket: 11 }),
            ...finalReviewClean(),
        ])
        if (pr.type !== 'open_pull_request') throw new Error(pr.type)
        expect(pr.body).toContain('## Declined findings')
        expect(pr.body).toContain('Sum drops negatives')
        expect(pr.body).toContain('Negatives are out of scope.')
    })
})

/** The run branch with ticket #11 built, joined, and pushed. */
const built = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }),
]

const SECURITY = lensFinding({ id: 'S1', title: 'Sum trusts its input' })
const ARCH_TEST = lensFinding({
    id: 'A1',
    kind: 'test',
    severity: 'blocker',
    title: 'The tests reach into private helpers',
    file: 'src/sum.test.ts',
})

/** The one step the decision step takes after these entries. */
const stepAfter = (entries: JournalEntry[]): EngineAction => {
    const steps = stepsAfter(entries)
    if (steps.length !== 1) {
        throw new Error(steps.map(({ type }) => type).join(', '))
    }
    return steps[0] as EngineAction
}

describe('decision step: other_role in a final review fix round', () => {
    test("an implementer's other_role finding goes to a fresh test-writer fixer with only that finding, before the final gates", () => {
        const answered = [
            ...built(),
            ...lensRound({
                round: 1,
                findings: { security: [SECURITY], architecture: [ARCH_TEST] },
            }),
            finalReviewFixing({ round: 1 }),
            testsWritten({
                ticket: null,
                finding_responses: [
                    {
                        finding_id: 'architecture-A1',
                        response: 'fixed',
                        reason: '',
                    },
                ],
            }),
            implemented({
                ticket: null,
                finding_responses: [
                    {
                        finding_id: 'security-S1',
                        response: 'other_role',
                        reason: 'Untrusted input needs a test.',
                    },
                ],
            }),
        ]

        const fixer = stepAfter(answered)
        expect(fixer).toMatchObject({
            type: 'launch_final_fixer',
            role: 'test-writer',
            may_edit_tests: true,
        })
        const prompt = promptOf(fixer)
        expect(prompt).toContain('security-S1')
        expect(prompt).toContain('Sum trusts its input')
        expect(prompt).not.toContain('architecture-A1')

        expect(
            stepAfter([
                ...answered,
                testsWritten({
                    ticket: null,
                    session_id: 'tw-2',
                    finding_responses: [
                        {
                            finding_id: 'security-S1',
                            response: 'fixed',
                            reason: '',
                        },
                    ],
                }),
            ])
        ).toEqual({ type: 'run_final_gates' })
    })

    test("a second other_role in the final review counts as won't fix: the final gates run, and the lens re-review rules on it", () => {
        const answered = [
            ...built(),
            ...lensRound({ round: 1, findings: { security: [SECURITY] } }),
            finalReviewFixing({ round: 1 }),
            implemented({
                ticket: null,
                session_id: 'impl-1',
                finding_responses: [
                    {
                        finding_id: 'security-S1',
                        response: 'other_role',
                        reason: 'Untrusted input needs a test.',
                    },
                ],
            }),
            testsWritten({
                ticket: null,
                session_id: 'tw-2',
                finding_responses: [
                    {
                        finding_id: 'security-S1',
                        response: 'other_role',
                        reason: 'The input check belongs in sum.',
                    },
                ],
            }),
        ]

        expect(stepAfter(answered)).toEqual({ type: 'run_final_gates' })

        const steps = stepsAfter([
            ...answered,
            gatesRun({ ticket: null, target: 'run_branch', ok: true }),
            leftoverScan({ ticket: null, stage: 'fix' }),
            commitMade({
                ticket: null,
                stage: 'fix',
                sha: 'fix-1',
                files: ['src/sum.ts'],
            }),
            pushed({ ticket: null, sha: 'fix-1' }),
            finalReviewStarted({
                round: 2,
                from_sha: 'g1',
                head_sha: 'fix-1',
                lenses: ['security'],
                files: ['src/sum.ts'],
            }),
        ])
        const lens = steps.find(
            (step) => step.type === 'launch_lens' && step.lens === 'security'
        )
        if (lens?.type !== 'launch_lens') throw new Error('no security lens')
        expect(lens.prompt).toContain(
            "WON'T FIX. Reason: The input check belongs in sum."
        )
    })
})

describe('decision step: the fix round prompts name other_role', () => {
    test("the implementer's review fix message and the final review's test-writer fixer both describe other_role", () => {
        const followUp = decideAfter([
            ...committed(),
            reviewed({ ticket: 11, findings: [CODE] }),
        ])
        if (followUp.type !== 'follow_up_agent') throw new Error(followUp.type)
        expect(followUp.message).toContain('"other_role"')

        const fixer = stepAfter([
            ...built(),
            ...lensRound({ round: 1, findings: { architecture: [ARCH_TEST] } }),
            finalReviewFixing({ round: 1 }),
        ])
        expect(promptOf(fixer)).toContain('"other_role"')
    })
})
