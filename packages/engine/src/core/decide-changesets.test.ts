import { describe, expect, test } from 'bun:test'

import { decideSteps, type EngineAction } from './decide'

import type { LensName } from '../agents/role-results'
import type { JournalEntry } from '../journal/journal-record'
import {
    commitMade,
    finding,
    gatesRun,
    implemented,
    intakePassed,
    leftoverScan,
    practiceTicket,
    pushed,
    reviewed,
    RUN_BRANCH,
    RUN_BRANCH_PATH,
    runBranchCreated,
    testsWritten,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import {
    finalReviewFixing,
    finalReviewStarted,
    lensFinding,
    lensRound,
} from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1, agents and changesets (#507): in a repo with
 * `.changeset/config.json`, the engine writes the run's one changeset at PR
 * time, so the agents that write files are told not to write one, and the
 * rules lens is told the engine adds it.
 */

const TICKET = practiceTicket({ number: 11 })

/** The run branch of a repo with a changesets config, or without one. */
const branchCreated = ({
    changesets,
}: {
    changesets: boolean
}): JournalEntry =>
    changesets
        ? {
              kind: 'run_branch_created',
              ticket: null,
              role: null,
              content: {
                  branch: RUN_BRANCH,
                  path: RUN_BRANCH_PATH,
                  base_sha: 'b0',
                  changesets: true,
              },
          }
        : runBranchCreated()

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

/** The prompt of the one agent launch (a ticket's or a final fixer's) now. */
const launchPrompt = (entries: JournalEntry[]): string => {
    const steps = stepsAfter(entries)
    const step = steps.find(
        (each) =>
            each.type === 'launch_agent' || each.type === 'launch_final_fixer'
    )
    if (step?.type !== 'launch_agent' && step?.type !== 'launch_final_fixer') {
        throw new Error(steps.map(({ type }) => type).join(', '))
    }
    return step.prompt
}

const rulesLensPrompt = (entries: JournalEntry[]): string => {
    const steps = stepsAfter(entries)
    const step = steps.find(
        (each) => each.type === 'launch_lens' && each.lens === 'rules'
    )
    if (step?.type !== 'launch_lens') throw new Error('no rules lens')
    return step.prompt
}

/** A prompt's sentences and lines, one each. */
const sentences = (prompt: string): string[] => prompt.split(/\n|(?<=[.!?])\s+/)

/** Some sentence tells the agent not to write a changeset. */
const saysNoChangesets = (prompt: string): boolean =>
    sentences(prompt).some((sentence) =>
        /\b(don't|do not|never)\b[^.]*\b(write|add|create)\b[^.]*\bchangesets?\b/i.test(
            sentence
        )
    )

/** Some sentence says the engine adds the run's changeset at PR time. */
const saysEngineAddsChangeset = (prompt: string): boolean =>
    sentences(prompt).some(
        (sentence) =>
            /\bengine\b/i.test(sentence) &&
            /\b(adds|writes|commits)\b/i.test(sentence) &&
            /\bchangeset\b/i.test(sentence) &&
            /\b(PR|pull request)\b/i.test(sentence)
    )

/** Ticket #11 up to its test-writer's launch. */
const toTestWriter = ({ changesets }: { changesets: boolean }) => [
    branchCreated({ changesets }),
    ...ticketBuilt({ ticket: 11 }).slice(0, 2),
]

/** Ticket #11 up to its implementer's launch. */
const toImplementer = ({ changesets }: { changesets: boolean }) => [
    branchCreated({ changesets }),
    ...ticketBuilt({ ticket: 11 }).slice(0, 6),
]

/** Ticket #11 pushed, then a final review round with a test and a code finding. */
const toFinalFix = ({ changesets }: { changesets: boolean }) => [
    branchCreated({ changesets }),
    ...ticketBuilt({ ticket: 11 }),
    ...lensRound({
        round: 1,
        findings: {
            security: [lensFinding({ id: 'S1', title: 'Sum trusts input' })],
            architecture: [
                lensFinding({
                    id: 'A1',
                    kind: 'test',
                    title: 'Tests reach into helpers',
                    file: 'src/sum.test.ts',
                }),
            ],
        },
    }),
    finalReviewFixing({ round: 1 }),
]

/** The final review's test-writer fixer answered its one finding. */
const testWriterFixed = (): JournalEntry =>
    testsWritten({
        ticket: null,
        finding_responses: [
            { finding_id: 'architecture-A1', response: 'fixed', reason: '' },
        ],
    })

/** The final review's first round, its lenses about to launch. */
const toLenses = ({ changesets }: { changesets: boolean }) => [
    branchCreated({ changesets }),
    ...ticketBuilt({ ticket: 11 }),
    finalReviewStarted({ round: 1 }),
]

// Each test checks the repo without changesets too: its prompts say
// nothing about changesets, so the text comes from the changesets config.
describe('agents in a repo with changesets (#507)', () => {
    test("the test-writer's prompt says not to write changesets, only in a repo with changesets", () => {
        expect(
            saysNoChangesets(launchPrompt(toTestWriter({ changesets: true })))
        ).toBe(true)
        expect(launchPrompt(toTestWriter({ changesets: false }))).not.toMatch(
            /changeset/i
        )
    })

    test("the implementer's prompt says not to write changesets, only in a repo with changesets", () => {
        expect(
            saysNoChangesets(launchPrompt(toImplementer({ changesets: true })))
        ).toBe(true)
        expect(launchPrompt(toImplementer({ changesets: false }))).not.toMatch(
            /changeset/i
        )
    })

    test("the final review's test-writer fixer is told not to write changesets, only in a repo with changesets", () => {
        const prompt = launchPrompt(toFinalFix({ changesets: true }))
        expect(prompt).toContain("fixing the final review's test findings")
        expect(saysNoChangesets(prompt)).toBe(true)
        expect(launchPrompt(toFinalFix({ changesets: false }))).not.toMatch(
            /changeset/i
        )
    })

    test("the final review's implementer fixer is told not to write changesets, only in a repo with changesets", () => {
        const prompt = launchPrompt([
            ...toFinalFix({ changesets: true }),
            testWriterFixed(),
        ])
        expect(prompt).toContain("fixing the final review's code findings")
        expect(saysNoChangesets(prompt)).toBe(true)
        expect(
            launchPrompt([
                ...toFinalFix({ changesets: false }),
                testWriterFixed(),
            ])
        ).not.toMatch(/changeset/i)
    })

    test("the rules lens is told the engine adds the run's changeset at PR time, only in a repo with changesets", () => {
        expect(
            saysEngineAddsChangeset(
                rulesLensPrompt(toLenses({ changesets: true }))
            )
        ).toBe(true)
        expect(
            saysEngineAddsChangeset(
                rulesLensPrompt(toLenses({ changesets: false }))
            )
        ).toBe(false)
    })
})

/**
 * Every reviewer, not only the rules lens, is told the engine writes the
 * run's changeset (#545): 12 change requests rested only on a "no
 * changeset" finding.
 */

/** The four lenses besides rules. */
const OTHER_LENSES: LensName[] = [
    'architecture',
    'simplification',
    'security',
    'integration',
]

/** Some sentence tells the reviewer to raise no finding asking for a changeset. */
const saysNoChangesetFindings = (prompt: string): boolean =>
    sentences(prompt).some(
        (sentence) =>
            /\bfindings?\b/i.test(sentence) &&
            /\bchangeset\b/i.test(sentence) &&
            /\b(no|not|don't|never)\b/i.test(sentence)
    )

/** Both halves of the reviewer changeset guidance. */
const hasReviewerGuidance = (prompt: string): boolean =>
    saysEngineAddsChangeset(prompt) && saysNoChangesetFindings(prompt)

/** The prompt of the ticket-reviewer's launch now. */
const reviewerPrompt = (entries: JournalEntry[]): string => {
    const steps = stepsAfter(entries)
    const step = steps.find(
        (each) =>
            each.type === 'launch_agent' && each.role === 'ticket-reviewer'
    )
    if (step?.type !== 'launch_agent') {
        throw new Error(steps.map(({ type }) => type).join(', '))
    }
    return step.prompt
}

/** The prompt of this lens's launch now. */
const lensPrompt = (entries: JournalEntry[], lens: LensName): string => {
    const steps = stepsAfter(entries)
    const step = steps.find(
        (each) => each.type === 'launch_lens' && each.lens === lens
    )
    if (step?.type !== 'launch_lens') {
        throw new Error(
            `no ${lens} lens: ${steps.map(({ type }) => type).join(', ')}`
        )
    }
    return step.prompt
}

const REVIEW_FINDING = finding({ id: 'R1-1', title: 'Sum drops negatives' })

/** Ticket #11 committed green, its first reviewer about to launch. */
const toReviewer = ({ changesets }: { changesets: boolean }) => [
    branchCreated({ changesets }),
    ...ticketBuilt({ ticket: 11 }).slice(0, 10),
]

/** Ticket #11's first review fix round committed, its re-reviewer about to launch. */
const toReReview = ({ changesets }: { changesets: boolean }) => [
    ...toReviewer({ changesets }),
    reviewed({ ticket: 11, findings: [REVIEW_FINDING] }),
    implemented({
        ticket: 11,
        finding_responses: [
            { finding_id: 'R1-1', response: 'fixed', reason: '' },
        ],
    }),
    gatesRun({ ticket: 11, target: 'ticket', ok: true }),
    leftoverScan({ ticket: 11, stage: 'fix' }),
    commitMade({
        ticket: 11,
        stage: 'fix',
        sha: 'fix-1-sha',
        files: ['src/sum.ts'],
    }),
]

/**
 * The final review's second round, after each of the four other lenses
 * raised a code finding that was fixed and pushed: those four about to
 * launch again.
 */
const toSecondRound = ({ changesets }: { changesets: boolean }) => [
    branchCreated({ changesets }),
    ...ticketBuilt({ ticket: 11 }),
    ...lensRound({
        round: 1,
        findings: Object.fromEntries(
            OTHER_LENSES.map((lens) => [lens, [lensFinding({ id: 'F1' })]])
        ),
    }),
    finalReviewFixing({ round: 1 }),
    implemented({
        ticket: null,
        finding_responses: OTHER_LENSES.map((lens) => ({
            finding_id: `${lens}-F1`,
            response: 'fixed' as const,
            reason: '',
        })),
    }),
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
        lenses: OTHER_LENSES,
        files: ['src/sum.ts'],
    }),
]

describe('every reviewer in a repo with changesets (#545)', () => {
    test("the ticket-reviewer's first review is told the engine adds the run's changeset and to raise no finding asking for one", () => {
        expect(
            hasReviewerGuidance(
                reviewerPrompt(toReviewer({ changesets: true }))
            )
        ).toBe(true)
    })

    test("the ticket-reviewer's re-review is told the engine adds the run's changeset and to raise no finding asking for one", () => {
        const prompt = reviewerPrompt(toReReview({ changesets: true }))
        expect(prompt).toContain('git diff green-sha..fix-1-sha')
        expect(hasReviewerGuidance(prompt)).toBe(true)
    })

    test("the architecture lens is told the engine adds the run's changeset, in the first and a later round", () => {
        expect(
            hasReviewerGuidance(
                lensPrompt(toLenses({ changesets: true }), 'architecture')
            )
        ).toBe(true)
        expect(
            hasReviewerGuidance(
                lensPrompt(toSecondRound({ changesets: true }), 'architecture')
            )
        ).toBe(true)
    })

    test("the simplification lens is told the engine adds the run's changeset, in the first and a later round", () => {
        expect(
            hasReviewerGuidance(
                lensPrompt(toLenses({ changesets: true }), 'simplification')
            )
        ).toBe(true)
        expect(
            hasReviewerGuidance(
                lensPrompt(
                    toSecondRound({ changesets: true }),
                    'simplification'
                )
            )
        ).toBe(true)
    })

    test("the security lens is told the engine adds the run's changeset, in the first and a later round", () => {
        expect(
            hasReviewerGuidance(
                lensPrompt(toLenses({ changesets: true }), 'security')
            )
        ).toBe(true)
        expect(
            hasReviewerGuidance(
                lensPrompt(toSecondRound({ changesets: true }), 'security')
            )
        ).toBe(true)
    })

    test("the integration lens is told the engine adds the run's changeset, in the first and a later round", () => {
        expect(
            hasReviewerGuidance(
                lensPrompt(toLenses({ changesets: true }), 'integration')
            )
        ).toBe(true)
        expect(
            hasReviewerGuidance(
                lensPrompt(toSecondRound({ changesets: true }), 'integration')
            )
        ).toBe(true)
    })

    test("the writers keep their changeset section as it was, and get none of the reviewer's guidance the ticket-reviewer now gets", () => {
        expect(
            hasReviewerGuidance(
                reviewerPrompt(toReviewer({ changesets: true }))
            )
        ).toBe(true)
        const writerSection = [
            '## The engine writes the changeset',
            "Don't write changesets, even if the repo's rules ask for one: the engine writes the run's one changeset when it opens the PR. " +
                'A new file you add in `.changeset/` is removed before the commit. ' +
                'A finding that only asks for a changeset is answered by this: answer it "wont_fix" and say the engine adds it.',
        ].join('\n\n')
        const prompts = [
            launchPrompt(toTestWriter({ changesets: true })),
            launchPrompt(toImplementer({ changesets: true })),
            launchPrompt(toFinalFix({ changesets: true })),
            launchPrompt([
                ...toFinalFix({ changesets: true }),
                testWriterFixed(),
            ]),
        ]
        for (const prompt of prompts) {
            expect(prompt).toContain(writerSection)
            expect(prompt).not.toMatch(/raise no finding/i)
            expect(
                prompt.split('## The engine writes the changeset')
            ).toHaveLength(2)
        }
    })

    test('the rules lens keeps its changeset section as it was, once, in every round, while the other lenses beside it get the guidance too', () => {
        const rulesSection = [
            '## The engine writes the changeset',
            "The engine adds the run's one changeset when it opens the PR, so a rule that asks for a changeset is met. " +
                'Raise no finding that only asks for a changeset.',
        ].join('\n\n')
        const secondRound = [
            ...toSecondRound({ changesets: true }).slice(0, -1),
            finalReviewStarted({
                round: 2,
                from_sha: 'g1',
                head_sha: 'fix-1',
                lenses: [...OTHER_LENSES, 'rules'],
                files: ['src/sum.ts'],
            }),
        ]
        for (const prompt of [
            rulesLensPrompt(toLenses({ changesets: true })),
            lensPrompt(secondRound, 'rules'),
        ]) {
            expect(prompt).toContain(rulesSection)
            expect(
                prompt.split('## The engine writes the changeset')
            ).toHaveLength(2)
        }
        for (const lens of OTHER_LENSES) {
            expect(hasReviewerGuidance(lensPrompt(secondRound, lens))).toBe(
                true
            )
        }
    })

    test('the reviewer guidance comes from the changesets config: every reviewer and lens has it with one, and none mentions changesets without one, in any round', () => {
        expect(
            [
                reviewerPrompt(toReviewer({ changesets: true })),
                reviewerPrompt(toReReview({ changesets: true })),
                ...OTHER_LENSES.map((lens) =>
                    lensPrompt(toLenses({ changesets: true }), lens)
                ),
                ...OTHER_LENSES.map((lens) =>
                    lensPrompt(toSecondRound({ changesets: true }), lens)
                ),
            ].every(hasReviewerGuidance)
        ).toBe(true)
        const prompts = [
            reviewerPrompt(toReviewer({ changesets: false })),
            reviewerPrompt(toReReview({ changesets: false })),
            ...[...OTHER_LENSES, 'rules' as const].map((lens) =>
                lensPrompt(toLenses({ changesets: false }), lens)
            ),
            ...OTHER_LENSES.map((lens) =>
                lensPrompt(toSecondRound({ changesets: false }), lens)
            ),
        ]
        for (const prompt of prompts) {
            expect(prompt).not.toMatch(/changeset/i)
        }
    })
})
