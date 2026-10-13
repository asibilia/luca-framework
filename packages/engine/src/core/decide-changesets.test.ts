import { describe, expect, test } from 'bun:test'

import { decideSteps, type EngineAction } from './decide'

import type { JournalEntry } from '../journal/journal-record'
import {
    intakePassed,
    practiceTicket,
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
