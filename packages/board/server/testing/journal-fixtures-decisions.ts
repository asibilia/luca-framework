/**
 * Journal records about the decision model: a question asked of Jev, its
 * answer, and (in old journals) its failure.
 */
import { entry, type Entry } from './journal-fixture-base'

const JEV_REQUEST = {
    state: { ticket: '#11 Add sum' },
    questions: {
        model: {
            type: 'choice',
            instructions: 'Which model should build this ticket?',
            criteria: { 'claude-opus-5-5': null, 'claude-sonnet-5': null },
        },
    },
}

export const jevAsked = ({ ticket }: { ticket: number | null }): Entry =>
    entry({
        kind: 'jev_asked',
        ticket,
        content: {
            job: 'ticket_model',
            request: JEV_REQUEST,
            fixed: { model: 'claude-opus-5-5' },
        },
    })

export const jevAnswered = ({
    ticket,
    asked_seq,
}: {
    ticket: number | null
    asked_seq: number
}): Entry =>
    entry({
        kind: 'jev_answered',
        ticket,
        content: {
            job: 'ticket_model',
            asked_seq,
            answers: {
                model: {
                    value: 'claude-sonnet-5',
                    confidence: 0.7,
                    raw: { choice: 'claude-sonnet-5', confidence: 0.7 },
                },
            },
            ms: 420,
        },
    })

/**
 * A failed ask as old journals hold it, from before Clef (#534): Jev's
 * `missing_key`, kept so the board is shown still to read them.
 */
export const jevFailed = ({
    ticket,
    asked_seq,
}: {
    ticket: number | null
    asked_seq: number
}): Entry =>
    entry({
        kind: 'jev_failed',
        ticket,
        content: {
            job: 'ticket_model',
            asked_seq,
            reason: 'missing_key',
            error: 'No TYPESAFE_API_KEY is set.',
            ms: 0,
        },
    })
