/**
 * Memory as replay rebuilds it (#370): its state shape, a run with memory
 * off, and the learner's own agent records.
 */
import { ranCheaper } from './agent-turn-replay'
import type { ReplayedAgentFailure } from './final-review-state'
import type { JournalRecord } from './journal-record'

import type { LearnerResult } from '../agents/role-results'
import type {
    MemoryFeedback,
    MemorySave,
    RecallPoint,
    RecalledMemory,
} from '../memory/memory-schemas'

/**
 * The learner at the end of a run (#370): its answer, or its failed tries,
 * or that the engine gave up on it. Learner records have `ticket: null` and
 * role `learner`; they never count as the final review's.
 */
export type LearnerState = {
    /** Its result, once it finished. */
    result: LearnerResult | null
    /** The seq of its `agent_finished`, for the saves' op ids. */
    result_seq: number | null
    /** Its latest failed turn, if none finished after it. */
    agent_failure: ReplayedAgentFailure | null
    /** Failed tries (agent, result, guard), in all. */
    failed_tries: number
    /** The model its latest agent launched on (#604); `null` in older journals. */
    launched_on: string | null
    /**
     * It used up a try on a model cheaper than Opus (#604), so its later
     * agents run Opus.
     */
    failed_cheaper: boolean
    /** Engine failures in a row. */
    engine_failures: number
    /** Why the engine gave up on it (`learning_skipped`), if it did. */
    skipped: string | null
}

/** Where memory stands in a run (#370), from its records. */
export type MemoryState = {
    /** Memory is on for this run (`run_started.memory`). */
    on: boolean
    /** The project's vault; `null` searches only `default`. */
    project_vault: string | null
    /** Each recall point's memories, by its key, once searched. */
    recalls: Record<string, { point: RecallPoint; memories: RecalledMemory[] }>
    /** Every memory shown in the run, oldest first; may repeat. */
    shown: RecalledMemory[]
    learner: LearnerState
    /** The learner's memories as saved, and the feedback sent. */
    saved: { saves: MemorySave[]; feedback: MemoryFeedback[] } | null
    /** The new memories went on the spec issue (a run with no PR). */
    reported: boolean
}

/** A run with memory off, before any memory record. */
export const EMPTY_MEMORY: MemoryState = {
    on: false,
    project_vault: null,
    recalls: {},
    shown: [],
    learner: {
        result: null,
        result_seq: null,
        agent_failure: null,
        failed_tries: 0,
        launched_on: null,
        failed_cheaper: false,
        engine_failures: 0,
        skipped: null,
    },
    saved: null,
    reported: false,
}

/** The agent kinds a learner's turn journals. */
type LearnerRecord = Extract<
    JournalRecord,
    {
        kind:
            | 'agent_started'
            | 'agent_finished'
            | 'agent_failed'
            | 'agent_session'
    }
>

/** The record if it is one of the learner's agent records, else `null`. */
export const learnerRecordOf = ({
    record,
}: {
    record: JournalRecord
}): LearnerRecord | null => {
    switch (record.kind) {
        case 'agent_started':
        case 'agent_finished':
        case 'agent_failed':
        case 'agent_session':
            return record.content.role === 'learner' ? record : null
        default:
            return null
    }
}

/**
 * The learner after one of its records: its answer ends any failure; a
 * failed turn counts a try (or an engine failure in a row), like any
 * agent's.
 */
export const learnerAfter = ({
    learner,
    record,
}: {
    learner: LearnerState
    record: LearnerRecord
}): LearnerState => {
    switch (record.kind) {
        case 'agent_started':
            return { ...learner, launched_on: record.content.model }
        case 'agent_session':
            return learner
        case 'agent_finished':
            return record.content.role === 'learner'
                ? {
                      ...learner,
                      result: record.content.result,
                      result_seq: record.seq,
                      agent_failure: null,
                      engine_failures: 0,
                  }
                : learner
        case 'agent_failed': {
            const { role, error, failure, session_id } = record.content
            const agent_failure = { role, error, failure, session_id }
            return failure === 'engine'
                ? {
                      ...learner,
                      agent_failure,
                      engine_failures: learner.engine_failures + 1,
                  }
                : {
                      ...learner,
                      agent_failure,
                      engine_failures: 0,
                      failed_tries: learner.failed_tries + 1,
                      failed_cheaper:
                          learner.failed_cheaper ||
                          ranCheaper(learner.launched_on),
                  }
        }
    }
}
