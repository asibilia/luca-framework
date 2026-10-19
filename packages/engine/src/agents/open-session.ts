/**
 * One agent session the Claude launcher keeps open between turns, and how it
 * is read: each SDK message goes into the session's summary, and an outcome
 * (a result, a stop, a plan cut-off, an engine failure) goes to the turn
 * waiting for it.
 */
import type { AgentSession, ModelTokens } from './agent-launcher'
import {
    AssistantSchema,
    errorText,
    InitSchema,
    initProblem,
    planCut,
    RateLimitSchema,
    ResultSchema,
    modelTotalsOf,
    stop,
    turnTokens,
    type Outcome,
} from './claude-messages'
import type { createInputChannel } from './input-channel'
import type { AgentRole } from './role-results'

import { planSignal } from '../limits/plan-signals'

/**
 * One running SDK session, as the launcher uses it. The SDK's own `Query`
 * fits this; tests hand in a fake. Messages are read as `unknown` and parsed
 * with the launcher's own schemas.
 */
export type AgentQuerySession = AsyncIterable<unknown> & {
    accountInfo: () => Promise<unknown>
    interrupt: () => Promise<unknown>
    close: () => void
}

/**
 * One agent session the launcher keeps open between turns, so a follow-up
 * reaches the same agent. Its guard hook, sandbox, and options are the ones
 * it was launched with.
 */
export type OpenSession = {
    role: AgentRole
    ticket: number
    cwd: string
    may_edit_tests: boolean
    running: AgentQuerySession
    input: ReturnType<typeof createInputChannel>
    /** What the launcher has seen of the session; per-turn fields reset each turn. */
    summary: AgentSession
    /** The SDK's running tokens per model, as of the session's last result. */
    model_totals: Record<string, ModelTokens>
    /** Resolves the turn waiting for the session's next outcome. */
    waiter: ((outcome: Outcome) => void) | null
    /** A stop or an engine failure: the session is over, with this outcome. */
    ended: Outcome | null
    /** Reads the session's messages until it ends. */
    pump: Promise<void>
    idle_timer: ReturnType<typeof setTimeout> | undefined
    stderr: string[]
}

/** The session's next outcome: a result, a stop, or its end. */
export const nextOutcome = (open: OpenSession): Promise<Outcome> =>
    open.ended !== null
        ? Promise.resolve(open.ended)
        : new Promise<Outcome>((resolve) => {
              open.waiter = resolve
          })

export const deliver = ({
    open,
    outcome,
}: {
    open: OpenSession
    outcome: Outcome
}): void => {
    if (!outcome.ok && outcome.failure !== 'agent') open.ended = outcome
    const waiter = open.waiter
    open.waiter = null
    waiter?.(outcome)
}

export const stderrTail = (open: OpenSession): string =>
    open.stderr.length === 0 ? '' : `\n${open.stderr.join('').slice(-2000)}`

/** Reads one message into the session's summary; an outcome ends the turn. */
export const watch = ({
    open,
    raw,
}: {
    open: OpenSession
    raw: unknown
}): Outcome | null => {
    const { summary } = open
    const init = InitSchema.safeParse(raw)
    if (init.success) {
        summary.session_id = init.data.session_id
        summary.model = init.data.model
        summary.claude_code_version = init.data.claude_code_version
        summary.api_key_source = init.data.apiKeySource
        const problem = initProblem(init.data)
        return problem === null ? null : stop(problem)
    }
    const rateLimit = RateLimitSchema.safeParse(raw)
    if (rateLimit.success) {
        const info = rateLimit.data.rate_limit_info
        summary.rate_limit_events.push({
            ...info,
            arrived_at: new Date().toISOString(),
        })
        const signal = planSignal({ info })
        switch (signal.kind) {
            case 'ok':
                return null
            case 'billing':
                return planCut(signal.reason)
            case 'limit':
                return planCut(
                    `rate_limit_event status=rejected (${signal.rate_limit_type ?? 'unknown'})`
                )
        }
    }
    const assistant = AssistantSchema.safeParse(raw)
    if (assistant.success) {
        if (assistant.data.error !== 'billing_error') return null
        summary.billing_error = true
        return planCut('assistant error billing_error')
    }
    const result = ResultSchema.safeParse(raw)
    if (!result.success) return null
    const done = result.data
    summary.num_turns = done.num_turns
    summary.usage = done.usage
    const totals = modelTotalsOf(done.modelUsage)
    summary.model_usage = turnTokens({
        totals,
        before: open.model_totals,
    })
    open.model_totals = { ...open.model_totals, ...totals }
    summary.total_cost_usd = done.total_cost_usd
    summary.permission_denials = done.permission_denials.map(
        ({ tool_name, tool_use_id }) => ({ tool_name, tool_use_id })
    )
    if (done.subtype === 'success' && !done.is_error) {
        return { ok: true, structured_output: done.structured_output }
    }
    const detail = done.errors.length > 0 ? done.errors.join('; ') : done.result
    return {
        ok: false,
        failure: 'agent',
        error: `The agent's turn ended with ${done.subtype}: ${detail}`,
    }
}

/**
 * Reads a session's messages until it ends, handing each outcome to the turn
 * waiting for it, then calls `on_end`.
 */
export const pumpMessages = async ({
    open,
    on_end,
}: {
    open: OpenSession
    on_end: () => void
}): Promise<void> => {
    try {
        for await (const raw of open.running) {
            const outcome = watch({ open, raw })
            if (outcome === null) continue
            deliver({ open, outcome })
            if (open.ended !== null) break
        }
        if (open.ended !== null) {
            on_end()
            return
        }
        deliver({
            open,
            outcome: {
                ok: false,
                failure: 'engine',
                error: `The agent session ended with no result.${stderrTail(open)}`,
            },
        })
    } catch (error) {
        deliver({
            open,
            outcome: {
                ok: false,
                failure: 'engine',
                error: `The agent session failed: ${errorText(error)}${stderrTail(open)}`,
            },
        })
    }
    on_end()
}
