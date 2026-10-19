import { describe, expect, test } from 'bun:test'

import { decide, decideSteps } from './decide'
import { MAX_RUN_NOTES } from './decide-build'
import { decideAfter, stepsUpTo, TICKET } from './decide-build-helpers'

import {
    baselineTests,
    commitMade,
    gatesRun,
    implemented,
    intakePassed,
    leftoverScan,
    practiceTicket,
    redCheck,
    runBranchCreated,
    testsWritten,
    ticketBuilt,
    ticketWorktreeCreated,
    withInstalls,
} from '../testing/build-fixtures'
import { finalReviewStarted } from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * The decision steps for the run notes agents hand on to later agents. The
 * helpers are in `decide-build-helpers.ts`.
 */

describe('decision step: run notes', () => {
    const SECTION = '## Run notes from earlier agents in this run'

    /** Ticket #11 up to its red commit, with the test-writer's notes. */
    const redCommitted = (run_notes: string[]) => [
        runBranchCreated(),
        ticketWorktreeCreated({ ticket: 11 }),
        baselineTests({ ticket: 11 }),
        testsWritten({ ticket: 11, run_notes }),
        redCheck({ ticket: 11, ok: true }),
        leftoverScan({ ticket: 11, stage: 'red' }),
        commitMade({ ticket: 11, stage: 'red' }),
    ]

    const promptOf = (action: ReturnType<typeof decideAfter>): string => {
        if (action.type !== 'launch_agent') throw new Error(action.type)
        return action.prompt
    }

    test("an earlier agent's notes reach a later agent's prompt, with who wrote them", () => {
        const prompt = promptOf(
            decideAfter(redCommitted(['Tests run with bun test.']))
        )
        expect(prompt).toContain(
            `${SECTION}\n\n- Tests run with bun test. (test-writer, #11)`
        )
    })

    test('with no notes yet, the prompt has no notes section', () => {
        expect(promptOf(decideAfter(stepsUpTo(1)))).not.toContain('Run notes')
        expect(promptOf(decideAfter(redCommitted([])))).not.toContain(
            'Run notes'
        )
    })

    test(`only the ${MAX_RUN_NOTES} newest notes are handed on, oldest first`, () => {
        const notes = Array.from({ length: 12 }, (_, index) => `n${index + 1}`)
        const prompt = promptOf(decideAfter(redCommitted(notes)))
        const listed = prompt
            .split('\n')
            .filter((line) => line.endsWith('(test-writer, #11)'))
        expect(listed).toEqual(
            notes.slice(2).map((note) => `- ${note} (test-writer, #11)`)
        )
    })

    test('the same note twice is listed once, where it was last written', () => {
        const prompt = promptOf(
            decideAfter([
                ...redCommitted(['Uses bun.', 'Lint bans console.log.']),
                implemented({ ticket: 11, run_notes: ['Uses bun.'] }),
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
                leftoverScan({ ticket: 11, stage: 'green' }),
                commitMade({ ticket: 11, stage: 'green' }),
            ])
        )
        expect(prompt).toContain(
            '- Lint bans console.log. (test-writer, #11)\n- Uses bun. (implementer, #11)'
        )
        expect(prompt.match(/Uses bun\./g)).toHaveLength(1)
    })

    test("a later ticket's agents get an earlier ticket's notes", () => {
        const second = practiceTicket({ number: 12, title: 'Add product' })
        const action = decide({
            records: recordsFrom({
                entries: [
                    ...intakePassed({ tickets: [TICKET, second] }),
                    ...withInstalls({
                        entries: [
                            runBranchCreated(),
                            ...ticketBuilt({ ticket: 11 }).map((entry) =>
                                entry.kind === 'agent_finished' &&
                                entry.content.role === 'implementer'
                                    ? implemented({
                                          ticket: 11,
                                          run_notes: [
                                              'Exports go through src/index.ts.',
                                          ],
                                      })
                                    : entry
                            ),
                            ticketWorktreeCreated({ ticket: 12 }),
                            baselineTests({ ticket: 12 }),
                        ],
                    }),
                ],
            }),
        })
        expect(action).toMatchObject({ role: 'test-writer', ticket: 12 })
        expect(promptOf(action)).toContain(
            '- Exports go through src/index.ts. (implementer, #11)'
        )
    })

    test('the reviewer gets the notes too', () => {
        const prompt = promptOf(
            decideAfter([
                ...redCommitted(['Uses bun.']),
                implemented({ ticket: 11 }),
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
                leftoverScan({ ticket: 11, stage: 'green' }),
                commitMade({ ticket: 11, stage: 'green' }),
            ])
        )
        expect(prompt).toContain('# Your role: ticket-reviewer')
        expect(prompt).toContain('- Uses bun. (test-writer, #11)')
    })

    test("the final review's lenses get the run's notes too", () => {
        const steps = decideSteps({
            records: recordsFrom({
                entries: [
                    ...intakePassed({ tickets: [TICKET] }),
                    ...withInstalls({
                        entries: [
                            runBranchCreated(),
                            ...ticketBuilt({ ticket: 11 }).map((entry) =>
                                entry.kind === 'agent_finished' &&
                                entry.content.role === 'test-writer'
                                    ? testsWritten({
                                          ticket: 11,
                                          run_notes: ['Uses bun.'],
                                      })
                                    : entry
                            ),
                            finalReviewStarted({ round: 1 }),
                        ],
                    }),
                ],
            }),
        })

        const lenses = steps.flatMap((step) =>
            step.type === 'launch_lens' ? [step.prompt] : []
        )
        expect(lenses).toHaveLength(5)
        for (const prompt of lenses) {
            expect(prompt).toContain('- Uses bun. (test-writer, #11)')
        }
    })

    test('a follow-up does not repeat the notes', () => {
        const action = decideAfter([
            runBranchCreated(),
            ticketWorktreeCreated({ ticket: 11 }),
            baselineTests({ ticket: 11 }),
            testsWritten({ ticket: 11, run_notes: ['Uses bun.'] }),
            redCheck({ ticket: 11, ok: false }),
        ])
        if (action.type !== 'follow_up_agent') throw new Error(action.type)
        expect(action.message).not.toContain('Run notes')
    })
})
