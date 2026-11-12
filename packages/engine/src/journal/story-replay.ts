/**
 * The PR's story step as replay rebuilds it (#743): its state shape, which
 * records are the story step's, and the step after each record. Story
 * records have `ticket: null`; they never count as the final review's.
 */
import type { JournalRecord } from './journal-record'
import type { StorySkipReason } from './story-entries'

import type { StoryWriterResult } from '../agents/role-results'

/** The story step's state. */
export type StoryState = {
    /** A story-writer started, or a story record was journaled. */
    began: boolean
    /** `story_saved` or `story_skipped` was journaled: the step is over. */
    done: boolean
    /**
     * The latest answer no check has refused yet: its result, the time of
     * its `agent_finished` (the story's `written_at`), and its session.
     */
    answer: {
        result: StoryWriterResult
        time: string
        session_id: string | null
    } | null
    /** The latest `story_refused`'s problem lines, once there is one. */
    problems: string[] | null
    /** Each `story_refused` and each story-writer turn that failed, not by the engine. */
    failed_tries: number
    /** The engine failed to run the story-writer this many times in a row. */
    engine_failures: number
    /** The kind and detail of the latest failure, as a skip would give them. */
    last_failure: { reason: StorySkipReason; detail: string } | null
    /**
     * The session a refused answer came from, while a follow-up can reach
     * it: nothing failed after the refusal, and it was not closed.
     */
    follow_up: string | null
    /** The story-writer's latest session. */
    session: string | null
    /** The reason in `story_skipped`, once the story was skipped (#744). */
    skipped: StorySkipReason | null
    /**
     * The skip was reported: `story_skip_reported`, or the report step
     * ended without one (the private home posts nothing).
     */
    reported: boolean
}

/** A run before any story record. */
export const EMPTY_STORY: StoryState = {
    began: false,
    done: false,
    answer: null,
    problems: null,
    failed_tries: 0,
    engine_failures: 0,
    last_failure: null,
    follow_up: null,
    session: null,
    skipped: null,
    reported: false,
}

/** The story's own record kinds. */
const STORY_KINDS: ReadonlySet<JournalRecord['kind']> = new Set([
    'story_refused',
    'story_saved',
    'story_skipped',
    'story_skip_reported',
])

/**
 * Whether a record is the story step's: one of the story's own kinds, or
 * a story-writer's agent turn record. Replay keeps them out of the final
 * review's.
 *
 * @example
 * isStoryRecord({ kind: 'story_saved', ... }) // true
 */
export const isStoryRecord = (record: JournalRecord): boolean => {
    if (STORY_KINDS.has(record.kind)) return true
    switch (record.kind) {
        case 'agent_started':
        case 'agent_finished':
        case 'agent_failed':
        case 'agent_session':
            return record.content.role === 'story-writer'
        default:
            return false
    }
}

/**
 * The story step after one record: its own records, and the few run-level
 * ones it watches (a closed session, a resume, the report step's end).
 * Any other record leaves it as it is.
 *
 * @example
 * storyAfter({ story: EMPTY_STORY, record }).failed_tries // 1 after a story_refused
 */
export const storyAfter = ({
    story,
    record,
}: {
    story: StoryState
    record: JournalRecord
}): StoryState => {
    switch (record.kind) {
        case 'agent_started':
            return record.content.role === 'story-writer'
                ? { ...story, began: true }
                : story
        case 'agent_finished':
            if (record.content.role !== 'story-writer') return story
            return {
                ...story,
                answer: {
                    result: record.content.result,
                    time: record.time,
                    session_id: record.content.session_id,
                },
                engine_failures: 0,
                follow_up: null,
                session: record.content.session_id ?? story.session,
            }
        case 'story_refused':
            return {
                ...story,
                began: true,
                problems: record.content.problems,
                failed_tries: story.failed_tries + 1,
                last_failure: {
                    reason: 'story_invalid',
                    detail: record.content.problems.join('\n'),
                },
                follow_up: story.answer?.session_id ?? null,
                answer: null,
            }
        case 'agent_failed': {
            if (record.content.role !== 'story-writer') return story
            const { session_gone, failure, error, session_id } = record.content
            // A follow-up found its session gone (#521): no agent ran.
            if (session_gone) return { ...story, follow_up: null }
            const engine = failure === 'engine'
            return {
                ...story,
                failed_tries: story.failed_tries + (engine ? 0 : 1),
                engine_failures: engine ? story.engine_failures + 1 : 0,
                last_failure: { reason: 'agent_failed', detail: error },
                follow_up: null,
                session: session_id ?? story.session,
            }
        }
        case 'agent_session_closed':
            return story.follow_up === record.content.session_id
                ? { ...story, follow_up: null }
                : story
        // A restarted engine takes a cut-off turn again with a fresh agent.
        case 'run_resumed':
            return { ...story, follow_up: null }
        case 'story_saved':
            return { ...story, began: true, done: true, answer: null }
        case 'story_skipped':
            return {
                ...story,
                began: true,
                done: true,
                answer: null,
                skipped: record.content.reason,
            }
        case 'story_skip_reported':
            return { ...story, reported: true }
        case 'step_ended':
            return record.content.step === 'report_story_skip'
                ? { ...story, reported: true }
                : story
        default:
            return story
    }
}
