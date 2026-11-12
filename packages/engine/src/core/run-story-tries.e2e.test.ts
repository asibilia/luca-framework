import { describe, expect, test } from 'bun:test'

import type { JournalRecord } from '../journal/journal-record'
import { happyTurns, practiceTracker } from '../testing/practice-repo'
import {
    invalidAnswer,
    noFeedbackAnswer,
    problemsOf,
    recordsOf,
    shareStoryRun,
    storyAnswer,
    storyWriterCalls,
    storyWriterTurn,
    tagsAfterPullRequest,
    type StoryRun,
} from '../testing/story-run-fixtures'
import { TrackerError } from '../tracker/tracker'

/**
 * The story step's tries and skips, end to end (#743): a story that fails
 * `readStory` goes back to the same session with every problem named, a
 * turn with no result gets a fresh story-writer, three failed tries skip
 * the story, and so does a save the tracker refuses. A skipped story never
 * makes the run stuck. Scripted agents, the in-memory tracker, a real
 * practice repo.
 */

const REFUSED =
    'The story was refused. Fix every problem below and answer again with the whole story.'

/** A run of the happy ticket, then these story-writer turns. */
const storyRun = (
    story_turns: ReturnType<typeof storyWriterTurn>[],
    tracker?: ReturnType<typeof practiceTracker>
) =>
    shareStoryRun({
        build: (practice) =>
            practice.run({
                turns: [...Object.values(happyTurns()), ...story_turns],
                tracker,
            }),
    })

const NO_RESULT = storyWriterTurn()

/** The content of the only `story_skipped` record. */
const skippedOf = (run: StoryRun) => {
    const skipped = recordsOf(run.records, 'story_skipped')
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ ticket: null })
    return skipped[0] !== undefined && 'content' in skipped[0]
        ? skipped[0].content
        : null
}

/** The error text of the last story-writer `agent_failed` record. */
const lastFailure = (records: JournalRecord[]): string => {
    const failed = records.findLast(
        (record) =>
            record.kind === 'agent_failed' &&
            record.content.role === 'story-writer'
    )
    return failed?.kind === 'agent_failed' ? failed.content.error : ''
}

/** The skip is followed by the run's usual ending, with no stuck record. */
const expectEndedAfterSkip = (run: StoryRun) => {
    expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
    expect(
        tagsAfterPullRequest(run.records, [
            'story_skipped',
            'worktrees_removed',
            'run_ended',
        ])
    ).toEqual(['story_skipped', 'worktrees_removed', 'run_ended'])
    expect(recordsOf(run.records, 'run_ended').at(-1)).toMatchObject({
        content: { outcome: 'pull_request' },
    })
    expect(
        tagsAfterPullRequest(run.records, [
            'run_stuck',
            'ticket_stuck',
            'final_review_stuck',
        ])
    ).toEqual([])
}

describe('a refused story goes back to the same session', () => {
    const fixed = storyRun([
        storyWriterTurn(invalidAnswer()),
        storyWriterTurn(storyAnswer()),
    ])

    test('agent_finished then story_refused with readStory’s problem lines, one follow-up in the same session naming each, then story_saved', () => {
        const run = fixed()
        const problems = problemsOf(invalidAnswer())

        expect(
            tagsAfterPullRequest(run.records, [
                'agent_finished:story-writer',
                'story_refused',
                'story_saved',
            ])
        ).toEqual([
            'agent_finished:story-writer',
            'story_refused',
            'agent_finished:story-writer',
            'story_saved',
        ])
        expect(recordsOf(run.records, 'story_refused')).toEqual([
            expect.objectContaining({ ticket: null, content: { problems } }),
        ])
        const calls = storyWriterCalls(run.launches)
        expect(calls.map(({ kind }) => kind)).toEqual(['launch', 'follow_up'])
        expect(calls[1]?.session_id).toBe(calls[0]?.session_id ?? '')
        const follow_up = calls[1]?.prompt ?? ''
        expect(follow_up.startsWith(`${REFUSED}\n\n`)).toBe(true)
        const lines = follow_up.split('\n')
        for (const problem of problems) expect(lines).toContain(problem)
        expect(run.tracker.savedStories()).toHaveLength(1)
    })
})

describe('a refused story, then turns with no structured result', () => {
    const mixed = storyRun([
        storyWriterTurn(invalidAnswer()),
        NO_RESULT,
        NO_RESULT,
    ])

    test('the fresh story-writer after a turn with no result gets the last refusal’s problems at the end of its prompt', () => {
        const run = mixed()
        const problems = problemsOf(invalidAnswer())
        const calls = storyWriterCalls(run.launches)

        expect(calls.map(({ kind }) => kind)).toEqual([
            'launch',
            'follow_up',
            'launch',
        ])
        expect(calls[0]?.prompt).not.toContain('## Problems with the last try')
        expect(
            calls[2]?.prompt.endsWith(
                `## Problems with the last try\n\n${problems.join('\n')}\n`
            )
        ).toBe(true)
    })

    test('the three failed tries are counted together, and the skip’s reason is the last one’s kind', () => {
        const run = mixed()

        expect(recordsOf(run.records, 'story_refused')).toHaveLength(1)
        expect(skippedOf(run)).toEqual({
            reason: 'agent_failed',
            detail: lastFailure(run.records),
        })
        expect(lastFailure(run.records)).not.toBe('')
        expectEndedAfterSkip(run)
    })
})

describe('three answers that fail the schema', () => {
    const refused = storyRun([
        storyWriterTurn(noFeedbackAnswer()),
        storyWriterTurn(noFeedbackAnswer()),
        storyWriterTurn(noFeedbackAnswer()),
    ])

    test('an answer with no summary.feedback_wanted is refused', () => {
        const run = refused()
        const problems = problemsOf(noFeedbackAnswer())

        expect(problems.some((line) => line.includes('feedback_wanted'))).toBe(
            true
        )
        expect(recordsOf(run.records, 'story_refused')[0]).toMatchObject({
            ticket: null,
            content: { problems },
        })
    })

    test('skip the story as story_invalid with the problem lines, and the run ends with its pull request', () => {
        const run = refused()

        expect(skippedOf(run)).toEqual({
            reason: 'story_invalid',
            detail: problemsOf(noFeedbackAnswer()).join('\n'),
        })
        expect(run.tracker.savedStories()).toEqual([])
        expectEndedAfterSkip(run)
    })
})

describe('three turns with no structured result', () => {
    const silent = storyRun([NO_RESULT, NO_RESULT, NO_RESULT])

    test('each try is a fresh session, and the story is skipped as agent_failed with the last error', () => {
        const run = silent()
        const calls = storyWriterCalls(run.launches)

        expect(calls.map(({ kind }) => kind)).toEqual([
            'launch',
            'launch',
            'launch',
        ])
        expect(new Set(calls.map(({ session_id }) => session_id)).size).toBe(3)
        expect(lastFailure(run.records)).not.toBe('')
        expect(skippedOf(run)).toEqual({
            reason: 'agent_failed',
            detail: lastFailure(run.records),
        })
        expectEndedAfterSkip(run)
    })
})

describe('a save the tracker refuses', () => {
    const SAVE_ERROR =
        'gh api repos/luca-test/practice/issues/12/comments failed: HTTP 403 Forbidden'

    const failing = (() => {
        const tracker = practiceTracker()
        tracker.nextStorySave(new TrackerError(SAVE_ERROR))
        return storyRun([storyWriterTurn(storyAnswer())], tracker)
    })()

    const moved = (() => {
        const tracker = practiceTracker()
        tracker.nextStorySave({ status: 'head_moved', pr_head_sha: 'abc123' })
        return storyRun([storyWriterTurn(storyAnswer())], tracker)
    })()

    test('a tracker failure that is not a network failure skips the story as save_failed with the error’s text', () => {
        const run = failing()

        expect(skippedOf(run)).toEqual({
            reason: 'save_failed',
            detail: SAVE_ERROR,
        })
        expectEndedAfterSkip(run)
    })

    test('a head that moved skips the story as head_moved with the pull request’s head, then the run ends with its pull request', () => {
        const run = moved()

        expect(skippedOf(run)).toEqual({
            reason: 'head_moved',
            detail: 'abc123',
        })
        expect(recordsOf(run.records, 'story_saved')).toEqual([])
        expectEndedAfterSkip(run)
    })
})
