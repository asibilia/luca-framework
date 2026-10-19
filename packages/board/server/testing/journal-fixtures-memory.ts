/**
 * Journal records about memory: a recall, the learner's turn, and the
 * memories it saved and reported.
 */
import { entry, type Entry } from './journal-fixture-base'

/** A memory search at a recall point (#370); a vault in `failed` failed. */
export const memoryRecalled = ({
    ticket = null,
    point,
    memories = 1,
    failed = [],
}: {
    ticket?: number | null
    point: string
    /** How many memories it showed. */
    memories?: number
    /** The vaults whose search failed. */
    failed?: string[]
}): Entry =>
    entry({
        kind: 'memory_recalled',
        ticket,
        content: {
            point,
            key: ticket === null ? point : `${point}:${ticket}`,
            query: 'q',
            vaults: [
                ...failed.map((vault) => ({
                    vault,
                    ok: false,
                    error: 'MuninnDB did not answer within 10000 ms.',
                    found: 0,
                })),
                { vault: 'default', ok: true, error: null, found: memories },
            ],
            memories: Array.from({ length: memories }, (_, index) => ({
                id: `m-${index + 1}`,
                vault: 'default',
                concept: `pitfall:m-${index + 1}`,
                content: 'A lesson.',
                score: 0.9,
            })),
        },
    })

/** The learner's turn started: no ticket, role `learner`. */
export const learnerStarted = (): Entry =>
    entry({
        kind: 'agent_started',
        role: 'learner',
        content: { role: 'learner', prompt: 'digest', follow_up_of: null },
    })

/** The learner's answer, with this many proposed memories. */
export const learnerFinished = ({
    memories = 2,
    helped = ['m-1'],
}: {
    memories?: number
    helped?: string[]
} = {}): Entry =>
    entry({
        kind: 'agent_finished',
        role: 'learner',
        content: {
            role: 'learner',
            session_id: 'session-learner',
            result: {
                memories: Array.from({ length: memories }, (_, index) => ({
                    type: 'pitfall',
                    concept: `lesson-${index + 1}`,
                    content: 'c',
                    summary: 's',
                })),
                helped,
            },
        },
    })

export const learnerFailed = (): Entry =>
    entry({
        kind: 'agent_failed',
        role: 'learner',
        content: {
            role: 'learner',
            error: 'No structured output.',
            failure: 'result',
            session_id: 'session-learner',
        },
    })

/** The learner's memories, by outcome. */
export const memoriesSaved = ({
    outcomes,
}: {
    outcomes: ('added' | 'updated' | 'refused' | 'failed')[]
}): Entry =>
    entry({
        kind: 'memories_saved',
        content: {
            saves: outcomes.map((outcome, index) => ({
                type: 'pitfall',
                concept: `pitfall:lesson-${index + 1}`,
                vault: outcome === 'refused' ? null : 'default',
                outcome,
                id:
                    outcome === 'added' || outcome === 'updated'
                        ? `id-${index + 1}`
                        : null,
                similar: null,
                error: null,
            })),
            feedback: [],
        },
    })

export const learningSkipped = (): Entry =>
    entry({
        kind: 'learning_skipped',
        content: { reason: 'The learner failed 3 tries; the last one: x' },
    })

export const memoriesReported = ({ count }: { count: number }): Entry =>
    entry({ kind: 'memories_reported', content: { comment_id: 900, count } })
