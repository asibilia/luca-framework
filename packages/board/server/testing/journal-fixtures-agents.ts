/**
 * Journal records about an agent's turn: its start, its answer or failure,
 * its session's summary, and the messages agents send one another.
 */
import { entry, RESULTS, type Entry } from './journal-fixture-base'
import type { rateLimit, unifiedRateLimit } from './journal-fixtures-plan'

/** A launch, or with `follow_up_of`, a follow-up in that session. */
export const agentStarted = ({
    ticket,
    role,
    follow_up_of = null,
}: {
    ticket: number | null
    role: string
    follow_up_of?: string | null
}): Entry =>
    entry({
        kind: 'agent_started',
        ticket,
        role,
        content: {
            role,
            prompt:
                follow_up_of === null
                    ? `You are the ${role}.`
                    : 'The check failed. Fix it.',
            follow_up_of,
        },
    })

/** The session id a role's agent on a ticket runs in, in these fixtures. */
export const sessionOf = ({
    ticket,
    role,
}: {
    ticket: number
    role: string
}): string => `session-${role}-${ticket}`

export const agentFinished = ({
    ticket,
    role,
    result,
}: {
    ticket: number
    role: string
    result?: unknown
}): Entry =>
    entry({
        kind: 'agent_finished',
        ticket,
        role,
        content: {
            role,
            result: result ?? RESULTS[role],
            session_id: sessionOf({ ticket, role }),
        },
    })

export const agentFailed = ({
    ticket,
    role,
    error,
    failure = 'agent',
}: {
    ticket: number
    role: string
    error: string
    failure?: 'agent' | 'result' | 'guard' | 'engine'
}): Entry =>
    entry({
        kind: 'agent_failed',
        ticket,
        role,
        content: {
            role,
            error,
            failure,
            session_id:
                failure === 'engine' ? null : sessionOf({ ticket, role }),
        },
    })

/** The launcher's summary of one agent turn's session. */
export const agentSession = ({
    ticket,
    role,
    input = 0,
    output = 0,
    cache_read = 0,
    cache_creation = 0,
    rate_limits = [],
}: {
    /** `null` for the final review's agents and the learner. */
    ticket: number | null
    role: string
    input?: number
    output?: number
    cache_read?: number
    cache_creation?: number
    rate_limits?: (
        | ReturnType<typeof rateLimit>
        | ReturnType<typeof unifiedRateLimit>
    )[]
}): Entry =>
    entry({
        kind: 'agent_session',
        ticket,
        role,
        content: {
            role,
            session: {
                session_id: sessionOf({ ticket: ticket ?? 0, role }),
                model: 'claude-opus-5-5',
                claude_code_version: '2.9.0',
                api_key_source: 'none',
                subscription_type: 'max',
                num_turns: 7,
                duration_ms: 12_000,
                usage: {
                    input_tokens: input,
                    output_tokens: output,
                    cache_read_input_tokens: cache_read,
                    cache_creation_input_tokens: cache_creation,
                },
                total_cost_usd: 0.12,
                permission_denials: [],
                guard_denials: [],
                rate_limit_events: rate_limits,
            },
        },
    })

/** An address, as the engine writes it: `<role>#<ticket>`. */
const address = ({ role, ticket }: { role: string; ticket: number }) =>
    `${role}#${ticket}`

export const agentMessage = ({
    ticket,
    role,
    id,
    to,
    text,
    status = 'queued',
    reason = null,
}: {
    ticket: number
    role: string
    id: string
    to: string
    text: string
    status?: 'queued' | 'not_delivered' | 'refused'
    reason?: string | null
}): Entry =>
    entry({
        kind: 'agent_message',
        ticket,
        role,
        content: {
            id,
            from: address({ role, ticket }),
            to,
            text,
            status,
            recipients: status === 'queued' ? [to] : [],
            reason,
        },
    })

export const agentMessageDelivered = ({
    ticket,
    role,
    ids,
}: {
    ticket: number
    role: string
    ids: string[]
}): Entry =>
    entry({
        kind: 'agent_message_delivered',
        ticket,
        role,
        content: {
            to: address({ role, ticket }),
            ids,
            tool_name: 'Edit',
            text: 'A message from another agent: ...',
        },
    })
