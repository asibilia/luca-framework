import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { Journal } from '../journal/journal'
import type { EngineClock } from '../limits/limit-wait'
import {
    createPracticeRepo,
    happyTurns,
    PRACTICE_ENGINE_CONFIG,
    practiceTracker,
} from '../testing/practice-repo'
import {
    recordsOf,
    storyAnswer,
    storyWriterCalls,
    storyWriterTurn,
} from '../testing/story-run-fixtures'
import type { InMemoryTracker } from '../tracker/in-memory-tracker'
import { TrackerError } from '../tracker/tracker'

/**
 * The story step across crashes, resumes, network waits and engine
 * failures, end to end (#744): checkpoints hold, a cut-off turn is taken
 * again, a finished answer is reused, a save is never doubled, and a
 * skip's comment is posted once. Scripted agents, the in-memory tracker,
 * a real practice repo.
 */

const CRASHED = 'The engine crashed.'

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-story-crash-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** The journal, but the first append that `crashes` picks throws instead. */
const crashOn =
    (crashes: (entry: Parameters<Journal['append']>[0]) => boolean) =>
    (real: Journal): Journal => {
        let crashed = false
        return {
            ...real,
            append: (entry) => {
                if (!crashed && crashes(entry)) {
                    crashed = true
                    throw new Error(CRASHED)
                }
                return real.append(entry)
            },
        }
    }

/** `kind` is a plain string: `story_skip_reported` is a kind #744 adds. */
const crashOnKind = (kind: string) => crashOn((entry) => entry.kind === kind)

const isStoryWriter = (record: object): boolean =>
    'content' in record &&
    typeof record.content === 'object' &&
    record.content !== null &&
    'role' in record.content &&
    record.content.role === 'story-writer'

/**
 * The tracker, counting its story saves; with `crash_save` its first save
 * throws as if the engine died, and with `crash_skip_comment` so does its
 * first skip comment, before it lands.
 */
const watched = ({
    tracker,
    crash_save,
    crash_skip_comment,
}: {
    tracker: InMemoryTracker
    crash_save?: boolean
    crash_skip_comment?: boolean
}): InMemoryTracker & { saves: () => number } => {
    let saves = 0
    let save_crashed = crash_save !== true
    let comment_crashed = crash_skip_comment !== true
    return {
        ...tracker,
        saveStory: async (args) => {
            saves += 1
            if (!save_crashed) {
                save_crashed = true
                throw new Error(CRASHED)
            }
            return tracker.saveStory(args)
        },
        comment: async (args) => {
            if (
                !comment_crashed &&
                args.body.startsWith('Luca could not write the review story')
            ) {
                comment_crashed = true
                throw new Error(CRASHED)
            }
            return tracker.comment(args)
        },
        saves: () => saves,
    }
}

const HAPPY = Object.values(happyTurns())

/** The skip comments on the run's only pull request. */
const skipComments = (tracker: InMemoryTracker): string[] => {
    const number = tracker.pullRequests()[0]?.number ?? -1
    return tracker
        .commentsOn({ number })
        .filter((body) =>
            body.startsWith('Luca could not write the review story')
        )
}

/** A tracker whose next story save answers that the head moved. */
const movedTracker = (): InMemoryTracker => {
    const tracker = practiceTracker()
    tracker.nextStorySave({ status: 'head_moved', pr_head_sha: 'abc123' })
    return tracker
}

describe('a crash around the skip comment', () => {
    test('a crash after the skip comment landed and before story_skip_reported: the resume adopts it, one comment and one story_skip_reported', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = movedTracker()

        await expect(
            practice.run({
                turns: [...HAPPY, storyWriterTurn(storyAnswer())],
                tracker,
                journal: crashOnKind('story_skip_reported'),
            })
        ).rejects.toThrow(CRASHED)
        expect(skipComments(tracker)).toHaveLength(1)

        const { action, records } = await practice.run({
            resume: true,
            turns: [],
            tracker,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(skipComments(tracker)).toHaveLength(1)
        expect(recordsOf(records, 'story_skip_reported')).toHaveLength(1)
    }, 120_000)

    test('a crash after story_skipped as head_moved and before the skip comment: the resume asks for no further save and journals no story_saved', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = watched({
            tracker: movedTracker(),
            crash_skip_comment: true,
        })

        await expect(
            practice.run({
                turns: [...HAPPY, storyWriterTurn(storyAnswer())],
                tracker,
            })
        ).rejects.toThrow(CRASHED)
        expect(tracker.saves()).toBe(1)

        const { records } = await practice.run({
            resume: true,
            turns: [],
            tracker,
        })

        expect(tracker.saves()).toBe(1)
        expect(tracker.savedStories()).toEqual([])
        expect(recordsOf(records, 'story_saved')).toEqual([])
        expect(skipComments(tracker)).toHaveLength(1)
    }, 120_000)
})

describe('a crash around the story-writer’s turn', () => {
    test('a crash after a valid agent_finished and before the save: the resume starts no story-writer and journals story_saved', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = watched({
            tracker: practiceTracker(),
            crash_save: true,
        })

        await expect(
            practice.run({
                turns: [...HAPPY, storyWriterTurn(storyAnswer())],
                tracker,
            })
        ).rejects.toThrow(CRASHED)
        const before = practice.journal.read().length

        const resumed = await practice.run({
            resume: true,
            turns: [],
            tracker,
        })

        expect(storyWriterCalls(resumed.launches)).toEqual([])
        expect(
            practice.journal
                .read()
                .slice(before)
                .filter(
                    (record) =>
                        record.kind === 'agent_started' && isStoryWriter(record)
                )
        ).toEqual([])
        expect(recordsOf(resumed.records, 'story_saved')).toHaveLength(1)
        expect(tracker.savedStories()).toHaveLength(1)
    }, 120_000)

    test('a crash after agent_started and before agent_finished: the resume starts a fresh story-writer and journals story_saved', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = practiceTracker()

        await expect(
            practice.run({
                turns: [...HAPPY, storyWriterTurn(storyAnswer())],
                tracker,
                journal: crashOn(
                    (entry) =>
                        entry.kind === 'agent_finished' && isStoryWriter(entry)
                ),
            })
        ).rejects.toThrow(CRASHED)

        const resumed = await practice.run({
            resume: true,
            turns: [],
            tracker,
        })

        expect(
            storyWriterCalls(resumed.launches).map(({ kind }) => kind)
        ).toEqual(['launch'])
        expect(recordsOf(resumed.records, 'story_saved')).toHaveLength(1)
    }, 120_000)
})

describe('a crash around the save', () => {
    test('a crash after the tracker saved the story and before story_saved: one story on the tracker and one story_saved', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = practiceTracker()

        await expect(
            practice.run({
                turns: [...HAPPY, storyWriterTurn(storyAnswer())],
                tracker,
                journal: crashOnKind('story_saved'),
            })
        ).rejects.toThrow(CRASHED)

        const { records } = await practice.run({
            resume: true,
            turns: [],
            tracker,
        })

        const number = tracker.pullRequests()[0]?.number
        expect(
            tracker
                .savedStories()
                .filter(({ pr_number }) => pr_number === number)
        ).toHaveLength(1)
        expect(recordsOf(records, 'story_saved')).toHaveLength(1)
    }, 120_000)

    test('a resume after story_saved journals no story-writer record and asks for no further save', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = watched({ tracker: practiceTracker() })

        await expect(
            practice.run({
                turns: [...HAPPY, storyWriterTurn(storyAnswer())],
                tracker,
                journal: crashOnKind('worktrees_removed'),
            })
        ).rejects.toThrow(CRASHED)
        expect(recordsOf(practice.journal.read(), 'story_saved')).toHaveLength(
            1
        )
        const saves = tracker.saves()
        const before = practice.journal.read().length

        await practice.run({ resume: true, turns: [], tracker })

        expect(
            practice.journal.read().slice(before).filter(isStoryWriter)
        ).toEqual([])
        expect(tracker.saves()).toBe(saves)
    }, 120_000)
})

describe('a resume after a skipped story was reported', () => {
    test('journals no story-writer record and leaves exactly one skip comment', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = movedTracker()

        await expect(
            practice.run({
                turns: [...HAPPY, storyWriterTurn(storyAnswer())],
                tracker,
                journal: crashOnKind('worktrees_removed'),
            })
        ).rejects.toThrow(CRASHED)
        const reported = recordsOf(
            practice.journal.read(),
            'story_skip_reported'
        )
        expect(reported).toHaveLength(1)
        const before = practice.journal.read().length

        await practice.run({ resume: true, turns: [], tracker })

        expect(
            practice.journal.read().slice(before).filter(isStoryWriter)
        ).toEqual([])
        expect(skipComments(tracker)).toHaveLength(1)
    }, 120_000)
})

describe('an old journal and the network', () => {
    test('a resume whose journal has worktrees_removed after pull_request_opened and no story record journals no story-writer record', async () => {
        const practice = await createPracticeRepo({
            root,
            config: { ...PRACTICE_ENGINE_CONFIG, pr_story: false },
        })
        const tracker = practiceTracker()

        await expect(
            practice.run({
                turns: HAPPY,
                tracker,
                journal: crashOnKind('run_ended'),
            })
        ).rejects.toThrow(CRASHED)
        const kinds = practice.journal.read().map(({ kind }) => kind)
        expect(kinds.lastIndexOf('worktrees_removed')).toBeGreaterThan(
            kinds.indexOf('pull_request_opened')
        )
        // As an engine older than the story step left it: the story is on.
        practice.journal.append({
            kind: 'config_reloaded',
            ticket: null,
            role: null,
            content: {
                changes: [{ field: 'pr_story', from: false, to: true }],
            },
        })

        const resumed = await practice.run({
            resume: true,
            turns: [],
            tracker,
        })

        expect(resumed.records.filter(isStoryWriter)).toEqual([])
        expect(storyWriterCalls(resumed.launches)).toEqual([])
    }, 120_000)

    test('a save that throws a network TrackerError waits for the network, then saves the story', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = practiceTracker()
        tracker.nextStorySave(
            new TrackerError('error connecting to api.github.com', {
                network: true,
            })
        )
        let now = Date.now()
        const clock: EngineClock = {
            now: () => now,
            sleep: async (ms) => {
                now += ms
            },
        }

        const { records } = await practice.run({
            turns: [...HAPPY, storyWriterTurn(storyAnswer())],
            tracker,
            clock,
        })

        const kinds = records.map(({ kind }) => kind)
        expect(kinds).toContain('network_wait_started')
        expect(kinds.indexOf('story_saved')).toBeGreaterThan(
            kinds.indexOf('network_wait_started')
        )
        expect(recordsOf(records, 'story_saved')).toHaveLength(1)
        expect(recordsOf(records, 'story_skipped')).toEqual([])
        expect(tracker.savedStories()).toHaveLength(1)
    }, 120_000)
})

describe('engine failures on the story-writer', () => {
    test('three engine failures in a row skip the story as agent_failed with the last raw error', async () => {
        const practice = await createPracticeRepo({ root })
        const failing = (n: number) => ({
            ...storyWriterTurn(),
            failure: 'engine' as const,
            error: `The Claude Code process exited with code ${n}.`,
        })

        const tracker = practiceTracker()

        const { records } = await practice.run({
            turns: [...HAPPY, failing(1), failing(2), failing(3)],
            tracker,
        })

        expect(recordsOf(records, 'story_skipped')).toEqual([
            expect.objectContaining({
                ticket: null,
                content: {
                    reason: 'agent_failed',
                    detail: 'The Claude Code process exited with code 3.',
                },
            }),
        ])
        // The skip is reported on the pull request (the in-memory tracker's
        // home is shared), naming its reason.
        const number = tracker.pullRequests()[0]?.number ?? -1
        expect(
            skipComments(tracker).filter((body) =>
                body.startsWith(
                    `Luca could not write the review story for this pull request (agent_failed). Run \`/luca-pr-prep ${number}\` to write it.`
                )
            )
        ).toHaveLength(1)
    }, 120_000)
})
