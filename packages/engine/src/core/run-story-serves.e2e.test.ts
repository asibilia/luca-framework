import { describe, expect, test } from 'bun:test'

import { story } from '../story/testing/story-fixtures'
import { happyTurns } from '../testing/practice-repo'
import {
    answerServing,
    c3Serving,
    callLines,
    NOT_IN_FORM,
    NOT_THIS_RUN,
    recordsOf,
    refusedProblems,
    shareStoryRun,
    SPEC_URL,
    storyWriterTurn,
    T11_URL,
    type StoryAnswer,
} from '../testing/story-run-fixtures'

/**
 * Serves refs the engine refuses (#745), end to end: a ref that does not
 * point at the run's spec or a ticket it built, names a criterion the
 * ticket lacks, or has another issue's url is a failed try with one exact
 * problem line, sent back to the same session; three in a row skip the
 * story. Scripted agents, the in-memory tracker, a real practice repo on
 * spec #10 that builds ticket #11 ("Add sum": "sum adds two numbers", "sum
 * of no numbers is zero").
 */

const OTHER_ISSUE_URL = 'https://github.com/acme/app/issues/999'

describe('three answers that fail the serves check', () => {
    const failing = shareStoryRun({
        build: (practice) =>
            practice.run({
                turns: [
                    ...Object.values(happyTurns()),
                    storyWriterTurn(
                        c3Serving({
                            label: 'ticket #99, AC1',
                            url: T11_URL,
                            quote: 'sum adds two numbers',
                        })
                    ),
                    storyWriterTurn(
                        c3Serving({
                            label: 'ticket #11, AC9',
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
                                            label: 'ticket #10, AC1',
                                            url: SPEC_URL,
                                            quote: 'sum adds two numbers',
                                        },
                                    ],
                                },
                                {
                                    id: 'c4',
                                    refs: [
                                        {
                                            label: 'spec #11',
                                            url: T11_URL,
                                            quote: null,
                                        },
                                    ],
                                },
                            ],
                        })
                    ),
                ],
            }),
    })

    const NOT_BUILT = `"c3": serves ref "ticket #99, AC1" ${NOT_THIS_RUN}`
    const NO_CRITERION =
        '"c3": serves ref "ticket #11, AC9" names a criterion that ticket #11 does not have'
    const SWAPPED = [
        `"c3": serves ref "ticket #10, AC1" ${NOT_THIS_RUN}`,
        `"c4": serves ref "spec #11" ${NOT_THIS_RUN}`,
    ]

    test('a ref to a ticket the run did not build is refused, and the follow-up holds its line', () => {
        const run = failing()

        expect(refusedProblems(run.records)[0]).toEqual([NOT_BUILT])
        expect(callLines(run, 1)).toContain(NOT_BUILT)
    })

    test('a ref to a criterion the ticket lacks is refused, and the follow-up holds its line', () => {
        const run = failing()

        expect(refusedProblems(run.records)[1]).toEqual([NO_CRITERION])
        expect(callLines(run, 2)).toContain(NO_CRITERION)
    })

    test('a ticket label naming the spec and a spec label naming the ticket each do not point at the run', () => {
        expect(refusedProblems(failing().records)[2]).toEqual(SWAPPED)
    })

    test('each story_refused holds its try’s problem lines', () => {
        expect(refusedProblems(failing().records)).toEqual([
            [NOT_BUILT],
            [NO_CRITERION],
            SWAPPED,
        ])
    })

    test('the third failed serves check skips the story as story_invalid', () => {
        const run = failing()

        expect(recordsOf(run.records, 'story_skipped')).toEqual([
            expect.objectContaining({
                ticket: null,
                content: {
                    reason: 'story_invalid',
                    detail: SWAPPED.join('\n'),
                },
            }),
        ])
        expect(run.tracker.savedStories()).toEqual([])
    })
})

describe('a schema problem, a url of another issue, and a label in neither form', () => {
    const schemaAndServes = (): StoryAnswer => ({
        ...c3Serving({ label: '#14', url: T11_URL, quote: null }),
        map: { ...story().map, entry_path: 'src/nowhere.ts' },
    })

    const mixed = shareStoryRun({
        build: (practice) =>
            practice.run({
                turns: [
                    ...Object.values(happyTurns()),
                    storyWriterTurn(schemaAndServes()),
                    storyWriterTurn(
                        c3Serving({
                            label: 'ticket #11, AC2',
                            url: SPEC_URL,
                            quote: 'sum of no numbers is zero',
                        })
                    ),
                    storyWriterTurn(
                        answerServing({
                            changes: [
                                {
                                    id: 'c3',
                                    refs: [
                                        {
                                            label: 'ticket #11, AC1',
                                            url: OTHER_ISSUE_URL,
                                            quote: 'sum adds two numbers',
                                        },
                                    ],
                                },
                                {
                                    id: 'c4',
                                    refs: [
                                        {
                                            label: '#14',
                                            url: T11_URL,
                                            quote: null,
                                        },
                                    ],
                                },
                            ],
                        })
                    ),
                ],
            }),
    })

    test('an answer that fails the schema is refused with no serves line, though its "#14" ref gets one once the schema passes', () => {
        const [first, , third] = refusedProblems(mixed().records)

        expect(first?.length ?? 0).toBeGreaterThan(0)
        expect(first?.filter((line) => line.includes('serves ref'))).toEqual([])
        expect(third).toContain(`"c4": serves ref "#14" ${NOT_IN_FORM}`)
    })

    test('a ticket ref with the spec’s url is refused, and the follow-up holds its line', () => {
        const run = mixed()
        const line =
            '"c3": serves ref "ticket #11, AC2" has the url of a different issue than its label names'

        expect(refusedProblems(run.records)[1]).toEqual([line])
        expect(callLines(run, 2)).toContain(line)
    })

    test('a ref whose url is neither the spec’s nor a built ticket’s does not point at the run', () => {
        expect(refusedProblems(mixed().records)[2]?.[0]).toBe(
            `"c3": serves ref "ticket #11, AC1" ${NOT_THIS_RUN}`
        )
    })
})
