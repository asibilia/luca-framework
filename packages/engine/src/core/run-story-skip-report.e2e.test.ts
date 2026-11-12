import { describe, expect, test } from 'bun:test'

import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import {
    happyTurns,
    practiceSpec,
    sumTicket,
} from '../testing/practice-repo'
import {
    invalidAnswer,
    recordsOf,
    shareStoryRun,
    storyAnswer,
    storyWriterTurn,
    tagsAfterPullRequest,
    type StoryRun,
} from '../testing/story-run-fixtures'
import {
    createInMemoryTracker,
    type InMemoryTracker,
} from '../tracker/in-memory-tracker'

/**
 * Telling the owner about a skipped story (#744), end to end: the skip
 * comment in the shared home, none in the private home, and the report step
 * across crashes and resumes. Scripted agents, the in-memory tracker, a real
 * practice repo.
 */

const trackerIn = (story_home: 'shared' | 'private'): InMemoryTracker =>
    createInMemoryTracker({
        issues: [practiceSpec(), sumTicket()],
        sub_tickets: { 10: [11] },
        story_home,
    })

const COMMENT_START = 'Luca could not write the review story'

/** The text a skip comment starts with. */
const skipText = ({ reason, pr }: { reason: string; pr: number }) =>
    `Luca could not write the review story for this pull request (${reason}). Run \`/luca-pr-prep ${pr}\` to write it.`

const prNumberOf = (records: JournalRecord[]): number => {
    const opened = records.find(({ kind }) => kind === 'pull_request_opened')
    if (opened?.kind !== 'pull_request_opened') throw new Error('No PR.')
    return opened.content.number
}

const skipComments = (run: { tracker: InMemoryTracker; records: JournalRecord[] }) =>
    run.tracker
        .commentsOn({ number: prNumberOf(run.records) })
        .filter((body) => body.startsWith(COMMENT_START))

/** The `story_skip_reported` records. */
const reportedOf = (records: JournalRecord[]) =>
    recordsOf(records, 'story_skip_reported')

/** The comment id a record holds, or undefined. */
const commentIdOf = (record: JournalRecord | undefined): unknown =>
    record !== undefined &&
    'content' in record &&
    typeof record.content === 'object' &&
    record.content !== null &&
    'comment_id' in record.content
        ? record.content.comment_id
        : undefined

const INVALID_THREE = () => [
    storyWriterTurn(invalidAnswer()),
    storyWriterTurn(invalidAnswer()),
    storyWriterTurn(invalidAnswer()),
]

/** The journal, but the `nth` append of `kind` throws, as if the engine died. */
const crashOnAppend =
    ({ kind, nth }: { kind: string; nth: number }) =>
    (real: Journal): Journal => {
        let seen = 0
        return {
            ...real,
            append: (entry) => {
                if (entry.kind === kind) {
                    seen += 1
                    if (seen === nth) throw new Error('The engine crashed.')
                }
                return real.append(entry)
            },
        }
    }

const storyWriterRecords = (records: JournalRecord[]) =>
    records.filter(
        (record) =>
            'content' in record &&
            typeof record.content === 'object' &&
            record.content !== null &&
            'role' in record.content &&
            record.content.role === 'story-writer'
    )

describe('a skipped story in the shared home', () => {
    const invalid = shareStoryRun({
        build: (practice) =>
            practice.run({
                tracker: trackerIn('shared'),
                turns: [...Object.values(happyTurns()), ...INVALID_THREE()],
            }),
    })

    const moved = shareStoryRun({
        build: (practice) => {
            const tracker = trackerIn('shared')
            tracker.nextStorySave({
                status: 'head_moved',
                pr_head_sha: 'abc123',
            })
            return practice.run({
                tracker,
                turns: [
                    ...Object.values(happyTurns()),
                    storyWriterTurn(storyAnswer()),
                ],
            })
        },
    })

    test('the run journals story_skipped, story_skip_reported, worktrees_removed, run_ended in that order', () => {
        const run = invalid()

        expect(
            tagsAfterPullRequest(run.records, [
                'story_skipped',
                'story_skip_reported',
                'worktrees_removed',
                'run_ended',
            ])
        ).toEqual([
            'story_skipped',
            'story_skip_reported',
            'worktrees_removed',
            'run_ended',
        ])
    })

    test('a story_invalid skip leaves exactly one comment with the story_invalid text', () => {
        const run = invalid()

        const comments = skipComments(run)
        expect(comments).toHaveLength(1)
        expect(
            comments[0]?.startsWith(
                skipText({
                    reason: 'story_invalid',
                    pr: prNumberOf(run.records),
                })
            )
        ).toBe(true)
    })

    test('a head_moved skip leaves a comment with the head_moved text', () => {
        const run = moved()

        const comments = skipComments(run)
        expect(comments).toHaveLength(1)
        expect(
            comments[0]?.startsWith(
                skipText({ reason: 'head_moved', pr: prNumberOf(run.records) })
            )
        ).toBe(true)
    })

    test('story_skip_reported holds the id of the skip comment', async () => {
        const run = invalid()

        const reported = reportedOf(run.records)
        expect(reported).toHaveLength(1)
        expect(reported[0]).toMatchObject({ ticket: null })
        const listed = await run.tracker.listComments({
            number: prNumberOf(run.records),
            since_id: 0,
        })
        const skip = listed.filter(({ body }) => body.startsWith(COMMENT_START))
        expect(skip).toHaveLength(1)
        expect(commentIdOf(reported[0])).toBe(skip[0]?.id)
    })
})

describe('a skipped story in the private home', () => {
    // The report step asks the tracker for the home once the skip is journaled.
    let askedAfterSkip = false
    const priv = shareStoryRun({
        build: (practice) => {
            const base = trackerIn('private')
            const tracker: InMemoryTracker = {
                ...base,
                storyHome: async () => {
                    if (
                        practice.journal
                            .read()
                            .some(({ kind }) => kind === 'story_skipped')
                    ) {
                        askedAfterSkip = true
                    }
                    return base.storyHome()
                },
            }
            return practice.run({
                tracker,
                turns: [...Object.values(happyTurns()), ...INVALID_THREE()],
            })
        },
    })

    test('no comment is posted and no story_skip_reported is journaled', () => {
        const run = priv()

        expect(askedAfterSkip).toBe(true)
        expect(recordsOf(run.records, 'story_skipped')).toHaveLength(1)
        expect(
            run.tracker.commentsOn({ number: prNumberOf(run.records) })
        ).toEqual([])
        expect(reportedOf(run.records)).toEqual([])
    })
})

describe('a crash after the skip comment landed, before story_skip_reported', () => {
    let crashed = false
    const resumed = shareStoryRun({
        build: async (practice) => {
            const tracker = trackerIn('shared')
            await practice
                .run({
                    tracker,
                    turns: [...Object.values(happyTurns()), ...INVALID_THREE()],
                    journal: crashOnAppend({
                        kind: 'story_skip_reported',
                        nth: 1,
                    }),
                })
                .catch(() => {
                    crashed = true
                })
            return practice.run({ resume: true, tracker, turns: [] })
        },
    })

    test('the resume adopts the comment: one skip comment, one story_skip_reported', () => {
        const run = resumed()

        expect(crashed).toBe(true)
        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(skipComments(run)).toHaveLength(1)
        expect(reportedOf(run.records)).toHaveLength(1)
    })
})

describe('a crash after story_skipped, before the skip comment', () => {
    let saves = 0
    let savesAtCrash = 0
    const resumed = shareStoryRun({
        build: async (practice) => {
            const base = trackerIn('shared')
            base.nextStorySave({ status: 'head_moved', pr_head_sha: 'abc123' })
            let crashed = false
            const tracker: InMemoryTracker = {
                ...base,
                saveStory: async (args) => {
                    saves += 1
                    return base.saveStory(args)
                },
                comment: async (args) => {
                    if (
                        !crashed &&
                        args.body.startsWith(COMMENT_START)
                    ) {
                        crashed = true
                        throw new Error('The engine crashed.')
                    }
                    return base.comment(args)
                },
            }
            await practice
                .run({
                    tracker,
                    turns: [
                        ...Object.values(happyTurns()),
                        storyWriterTurn(storyAnswer()),
                    ],
                })
                .catch(() => undefined)
            savesAtCrash = saves
            return practice.run({ resume: true, tracker, turns: [] })
        },
    })

    test('the resume asks the tracker for no further save and journals no story_saved', () => {
        const run = resumed()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(savesAtCrash).toBe(1)
        expect(saves).toBe(savesAtCrash)
        expect(recordsOf(run.records, 'story_saved')).toEqual([])
        expect(skipComments(run)).toHaveLength(1)
    })

    test('the resume journals no further record with role story-writer', () => {
        const run = resumed()

        // The resume went on to report the skip.
        expect(reportedOf(run.records)).toHaveLength(1)
        const all = storyWriterRecords(run.records)
        const before = storyWriterRecords(
            run.records.slice(
                0,
                run.records.findIndex(({ kind }) => kind === 'story_skipped')
            )
        )
        expect(all).toEqual(before)
        expect(run.launches.filter(({ role }) => role === 'story-writer')).toEqual(
            []
        )
    })
})

describe('a resume after story_skip_reported', () => {
    const resumed = shareStoryRun({
        build: async (practice) => {
            const tracker = trackerIn('shared')
            await practice.run({
                tracker,
                turns: [...Object.values(happyTurns()), ...INVALID_THREE()],
            })
            return practice.run({ resume: true, tracker, turns: [] })
        },
    })

    test('leaves exactly one skip comment on the pull request', () => {
        const run = resumed()

        expect(skipComments(run)).toHaveLength(1)
        expect(reportedOf(run.records)).toHaveLength(1)
    })
})

describe('three engine failures in a row on the story-writer', () => {
    const failing = shareStoryRun({
        build: (practice) => {
            const down = (): ReturnType<typeof storyWriterTurn> => ({
                role: 'story-writer',
                ticket: 10,
                failure: 'engine',
                error: 'The engine could not run the story-writer.',
            })
            return practice.run({
                tracker: trackerIn('shared'),
                turns: [...Object.values(happyTurns()), down(), down(), down()],
            })
        },
    })

    test('skip the story with reason agent_failed', () => {
        const run: StoryRun = failing()

        const skipped = recordsOf(run.records, 'story_skipped')
        expect(skipped).toHaveLength(1)
        expect(skipped[0]).toMatchObject({
            ticket: null,
            content: { reason: 'agent_failed' },
        })
        const comments = skipComments(run)
        expect(comments).toHaveLength(1)
        expect(
            comments[0]?.startsWith(
                skipText({
                    reason: 'agent_failed',
                    pr: prNumberOf(run.records),
                })
            )
        ).toBe(true)
    })
})
