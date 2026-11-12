import { describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { Journal } from '../journal/journal'
import { replayRun, type RunState } from '../journal/replay'
import type { EngineClock } from '../limits/limit-wait'
import { SPEC_OWNER, specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    happyTurns,
    IMPLEMENTER_RESULT,
    practiceTracker,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'
import {
    answerServing,
    c3Serving,
    callLines,
    NOT_IN_FORM,
    NOT_THIS_RUN,
    recordsOf,
    refusedProblems,
    sectionOf,
    shareStoryRun,
    SPEC_URL,
    storyPrompt,
    storyWriterTurn,
    T11_URL,
    T12_URL,
    type StoryRun,
} from '../testing/story-run-fixtures'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * A run's story names the ask each change serves (#745), end to end: the
 * story-writer's prompt holds the run's spec and built tickets and what the
 * run was unsure about, and a story whose serves refs point at the run's
 * spec and built tickets is saved. Scripted agents, the in-memory tracker,
 * a real practice repo. The practice run is on spec #10 and builds ticket
 * #11 (the spec's #12 and #14). The refused refs are in
 * `run-story-serves.e2e.test.ts`.
 */

/** The changes of the one saved story, by id. */
const savedRefs = (run: StoryRun): Record<string, unknown> => {
    const [saved] = run.tracker.savedStories()
    if (saved === undefined) throw new Error('No story was saved.')
    return Object.fromEntries(
        saved.story.stops
            .flatMap(({ changes }) => changes)
            .map(({ id, serves }) => [id, serves.refs])
    )
}

/**
 * A clock whose waits let a scripted person act once `when` holds for the
 * run's state; `act` runs at most once.
 */
const personClock = ({
    journal,
    when,
    act,
}: {
    journal: Journal
    when: (state: RunState) => boolean
    act: () => void
}): EngineClock => {
    let acted = false
    return {
        now: () => Date.now(),
        sleep: async () => {
            await Bun.sleep(5)
            if (acted) return
            if (!when(replayRun({ records: journal.read() }))) return
            acted = true
            act()
        },
    }
}

describe('a run that built ticket #11 and skipped ticket #12', () => {
    const SPEC = specIssue({ number: 10, title: 'Add a sum helper' })
    const T11_CRITERIA = ['Sum of 1 and 2 is 3.', 'Sum of no numbers is 0.']

    const asks = shareStoryRun({
        build: (practice) => {
            const tracker = createInMemoryTracker({
                issues: [
                    SPEC,
                    ticketIssue({
                        number: 11,
                        title: 'Sum two numbers',
                        criteria: T11_CRITERIA,
                    }),
                    ticketIssue({
                        number: 12,
                        title: 'Add product',
                        criteria: ['product multiplies'],
                    }),
                ],
                sub_tickets: { 10: [11, 12] },
                engine_login: SPEC_OWNER,
            })
            const { testWriter, implementer, reviewer } = happyTurns()
            const clock = personClock({
                journal: practice.journal,
                when: (state) =>
                    (state.tickets[12]?.stuck_report ?? null) !== null &&
                    (state.tickets[11]?.pushed ?? null) !== null,
                act: () => {
                    tracker.addComment({
                        number: 10,
                        author: SPEC_OWNER,
                        body: 'skip #12',
                    })
                },
            })
            const turns: ScriptedTurn[] = [
                {
                    ...testWriter,
                    result: {
                        ...TEST_WRITER_RESULT,
                        assumptions: ['Empty input returns 0.'],
                    },
                },
                implementer,
                reviewer,
                {
                    role: 'test-writer',
                    ticket: 12,
                    result: {
                        outcome: 'nothing_new_to_test',
                        summary: 'Nothing to test.',
                    },
                },
                storyWriterTurn(
                    c3Serving({
                        label: 'ticket #12, AC1',
                        url: T12_URL,
                        quote: 'product multiplies',
                    })
                ),
                storyWriterTurn(
                    answerServing({
                        changes: [
                            {
                                id: 'c3',
                                refs: [
                                    { label: '#14', url: T11_URL, quote: null },
                                ],
                            },
                            {
                                id: 'c4',
                                refs: [
                                    {
                                        label: 'ticket #99, AC1',
                                        url: T11_URL,
                                        quote: 'Sum of 1 and 2 is 3.',
                                    },
                                ],
                            },
                        ],
                    })
                ),
                storyWriterTurn(
                    answerServing({
                        changes: [
                            {
                                id: 'c3',
                                refs: [
                                    {
                                        label: 'ticket #11, AC2',
                                        url: T11_URL,
                                        quote: 'Sum of no numbers is 0.',
                                    },
                                ],
                            },
                            {
                                id: 'c4',
                                refs: [
                                    {
                                        label: 'spec #10',
                                        url: SPEC_URL,
                                        quote: null,
                                    },
                                ],
                            },
                            {
                                id: 'c5',
                                refs: [
                                    {
                                        label: 'ticket #011, AC02',
                                        url: T11_URL,
                                        quote: 'Sum of no numbers is 0.',
                                    },
                                ],
                            },
                            {
                                id: 'c6',
                                refs: [
                                    {
                                        label: 'ticket #11, AC1',
                                        url: T11_URL,
                                        quote: '  Sum of 1  and 2   is 3. ',
                                    },
                                ],
                            },
                        ],
                    })
                ),
            ]
            return practice.run({ tracker, clock, stop_before: [], turns })
        },
    })

    test('the prompt holds the spec line, its URL next, and its body between two lines of six tildes', () => {
        const run = asks()
        const lines = storyPrompt(run).split('\n')
        const at = lines.indexOf('Spec #10: Add a sum helper')

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(at).toBeGreaterThan(-1)
        expect(lines[at + 1]).toBe(SPEC_URL)
        expect(lines[at + 2]).toBe('~~~~~~')
        const end = lines.indexOf('~~~~~~', at + 3)
        expect(end).toBeGreaterThan(at + 2)
        expect(
            lines
                .slice(at + 3, end)
                .join('\n')
                .trim()
        ).toBe(SPEC.body.trim())
    })

    test('the prompt holds the built ticket’s line, its URL next, then one line per acceptance criterion', () => {
        const lines = storyPrompt(asks()).split('\n')
        const at = lines.indexOf('Ticket #11: Sum two numbers')

        expect(at).toBeGreaterThan(-1)
        expect(lines.slice(at + 1, at + 4)).toEqual([
            T11_URL,
            'AC1: Sum of 1 and 2 is 3.',
            'AC2: Sum of no numbers is 0.',
        ])
    })

    test('the prompt holds the six section headings in order', () => {
        const lines = storyPrompt(asks()).split('\n')
        const at = [
            '## Pull request',
            '## Changed files',
            '## Diff',
            "## The run's asks",
            '## What the run was unsure about',
            '## Rule files',
        ].map((heading) => lines.indexOf(heading))

        expect(at.every((index) => index >= 0)).toBe(true)
        expect(at).toEqual(at.toSorted((a, b) => a - b))
    })

    test('the unsure section holds the ticket’s assumption under Assumptions agents made:, and no Open findings: line', () => {
        const lines = sectionOf(
            storyPrompt(asks()),
            '## What the run was unsure about'
        ).split('\n')
        const at = lines.indexOf('Assumptions agents made:')

        expect(at).toBeGreaterThan(-1)
        expect(lines[at + 1]).toBe('- #11: Empty input returns 0.')
        expect(lines).not.toContain('Open findings:')
    })

    test('the skipped ticket is not in the prompt, and a serves ref to it is a failed try that does not point at the run', () => {
        const run = asks()
        const prompt = storyPrompt(run)
        const line = `"c3": serves ref "ticket #12, AC1" ${NOT_THIS_RUN}`

        expect(prompt).toContain('Sum two numbers')
        expect(prompt).not.toContain('Add product')
        expect(refusedProblems(run.records)[0]).toEqual([line])
        expect(callLines(run, 1)).toContain(line)
    })

    test('a label in neither form and a ticket the run did not build give two lines, the first change’s first, and the follow-up holds them', () => {
        const run = asks()
        const not_in_form = `"c3": serves ref "#14" ${NOT_IN_FORM}`
        const not_built = `"c4": serves ref "ticket #99, AC1" ${NOT_THIS_RUN}`

        expect(refusedProblems(run.records)[1]).toEqual([
            not_in_form,
            not_built,
        ])
        expect(callLines(run, 2)).toContain(not_in_form)
        expect(callLines(run, 2)).toContain(not_built)
    })

    test('a story whose refs name the spec, a criterion by its text, a criterion with leading zeros, and one with extra spaces is saved', () => {
        const run = asks()
        const refs = savedRefs(run)

        expect(recordsOf(run.records, 'story_saved')).toHaveLength(1)
        expect(refs.c3).toEqual([
            {
                label: 'ticket #11, AC2',
                url: T11_URL,
                quote: 'Sum of no numbers is 0.',
            },
        ])
        expect(refs.c4).toEqual([
            { label: 'spec #10', url: SPEC_URL, quote: null },
        ])
        expect(refs.c5).toEqual([
            expect.objectContaining({ label: 'ticket #011, AC02' }),
        ])
        expect(refs.c6).toEqual([
            expect.objectContaining({ label: 'ticket #11, AC1' }),
        ])
    })
})

/** A security lens that keeps asking for the same change. */
const stubbornLens = (): ScriptedTurn => ({
    role: 'security-lens',
    ticket: 10,
    result: {
        verdict: 'changes_requested',
        findings: [
            {
                id: 'security-S2',
                severity: 'blocker',
                kind: 'code',
                file: 'src/sum.ts',
                title: 'Sum overflows silently',
                detail: 'Past the safe integers it loses precision.',
            },
        ],
        rulings: [],
        summary: 'The security lens looked.',
        assumptions: [],
    },
})

/** A final fixer that declines the finding and edits nothing. */
const refusingFixer = (): ScriptedTurn => ({
    role: 'implementer',
    ticket: 10,
    result: {
        ...IMPLEMENTER_RESULT,
        finding_responses: [
            { finding_id: 'security-S2', response: 'wont_fix', reason: 'No.' },
        ],
    },
})

describe('a run shipped with an open finding', () => {
    const shipped = shareStoryRun({
        build: async (practice) => {
            const tracker = practiceTracker()
            const stuck = await practice.run({
                tracker,
                turns: [
                    ...Object.values(happyTurns()),
                    stubbornLens(),
                    refusingFixer(),
                    stubbornLens(),
                    refusingFixer(),
                    stubbornLens(),
                    refusingFixer(),
                    stubbornLens(),
                ],
            })
            if (stuck.action.type !== 'wait_for_reply') {
                throw new Error('The final review did not get stuck.')
            }
            tracker.addComment({ number: 10, author: SPEC_OWNER, body: 'ship' })
            return practice.run({
                tracker,
                resume: true,
                stop_before: [],
                clock: { now: () => Date.now(), sleep: async () => undefined },
                turns: [
                    storyWriterTurn(
                        c3Serving({
                            label: 'Ticket #11, AC2',
                            url: T11_URL,
                            quote: 'sum of no numbers is zero',
                        })
                    ),
                    storyWriterTurn(
                        c3Serving({
                            label: 'ticket #11, AC2',
                            url: T11_URL,
                            quote: 'sum adds two numbers',
                        })
                    ),
                    storyWriterTurn(
                        answerServing({
                            changes: [
                                {
                                    id: 'c3',
                                    refs: [
                                        {
                                            label: 'ticket #11, AC2',
                                            url: T11_URL,
                                            quote: 'sum of no numbers is zero',
                                        },
                                    ],
                                },
                            ],
                            source: 'author',
                        })
                    ),
                ],
            })
        },
    })

    test('the unsure section holds Open findings: then the finding’s line from the pull request body', () => {
        const run = shipped()
        const lines = sectionOf(
            storyPrompt(run),
            '## What the run was unsure about'
        ).split('\n')
        const at = lines.indexOf('Open findings:')

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(at).toBeGreaterThan(-1)
        expect(lines[at + 1]).toBe(
            '- security lens, blocker (src/sum.ts): security-S2 Sum overflows silently'
        )
    })

    test('a label with a capital T is not in either form', () => {
        const [first] = refusedProblems(shipped().records)

        expect(first).toHaveLength(1)
        expect(first?.[0]?.endsWith(NOT_IN_FORM)).toBe(true)
    })

    test('a ticket ref quoting another criterion is refused, and the follow-up holds its line', () => {
        const run = shipped()
        const line =
            '"c3": serves ref "ticket #11, AC2" has a quote that is not that criterion\'s text'

        expect(refusedProblems(run.records)[1]).toEqual([line])
        expect(callLines(run, 2)).toContain(line)
    })

    test('the saved story keeps the author source the answer gave', () => {
        const run = shipped()
        const [saved] = run.tracker.savedStories()

        expect(saved?.story.summary.feedback_wanted.source).toBe('author')
    })
})
