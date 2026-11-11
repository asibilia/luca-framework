/**
 * Where the PR's story step stands (#743), read from the journal: its
 * pending answer, its failed tries, the session a follow-up can reach, and
 * whether a checkpoint ended it. Pure.
 */
import type { StoryWriterResult } from '../agents/role-results'
import type { JournalRecord } from '../journal/journal-record'
import type { StorySkipReason } from '../journal/story-entries'

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
}

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
}

const isStoryWriter = (record: JournalRecord): boolean =>
    'content' in record &&
    typeof record.content === 'object' &&
    record.content !== null &&
    'role' in record.content &&
    record.content.role === 'story-writer'

/** The story step after one record. */
const storyAfter = ({
    story,
    record,
}: {
    story: StoryState
    record: JournalRecord
}): StoryState => {
    switch (record.kind) {
        case 'agent_started':
            return isStoryWriter(record) ? { ...story, began: true } : story
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
        case 'story_skipped':
            return { ...story, began: true, done: true, answer: null }
        default:
            return story
    }
}

/**
 * The story step's state from a run's records.
 *
 * @example
 * storyStateOf({ records: journal.read() }).failed_tries // 1
 */
export const storyStateOf = ({
    records,
}: {
    records: JournalRecord[]
}): StoryState =>
    records.reduce(
        (story, record) => storyAfter({ story, record }),
        EMPTY_STORY
    )
