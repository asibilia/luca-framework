import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'

import {
    query as sdkQuery,
    type EffortLevel,
    type Options,
    type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import {
    AgentSessionSchema,
    type AgentLauncher,
    type AgentSession,
    type AgentTurn,
} from './agent-launcher'
import {
    AGENT_EFFORT,
    agentEnv,
    agentOptions,
    CLAUDE_MODEL,
    checkModel,
} from './claude-options'
import type { AgentRole } from './role-results'

import { createGuardHook } from '../guards/guard-hook'
import { guardRoleOf } from '../guards/role-rules'
import { runCommand } from '../shell/run-command'

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

/** Starts an SDK session: the SDK's `query`, or a fake in tests. */
export type AgentQuery = (params: {
    prompt: AsyncIterable<SDKUserMessage>
    options: Options
}) => AgentQuerySession

/** A turn gives up after this long unless told otherwise: 40 minutes. */
export const DEFAULT_TURN_TIMEOUT_MS = 40 * 60_000

/**
 * A session left open for follow-ups closes after sitting idle this long
 * unless told otherwise: 30 minutes.
 */
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60_000

/** The Claude plans an agent may run on. */
const PLANS = ['pro', 'max', 'team', 'enterprise']

const AccountSchema = z.looseObject({
    subscriptionType: z.string().optional(),
    apiKeySource: z.string().optional(),
    apiProvider: z.string().optional(),
})

const InitSchema = z.object({
    type: z.literal('system'),
    subtype: z.literal('init'),
    apiKeySource: z.string(),
    model: z.string(),
    claude_code_version: z.string().nullable().default(null),
    session_id: z.string().nullable().default(null),
    tools: z.array(z.string()).default([]),
    mcp_servers: z.array(z.object({ name: z.string() })).default([]),
})

const RateLimitSchema = z.object({
    type: z.literal('rate_limit_event'),
    rate_limit_info: z.looseObject({
        status: z.string().optional(),
        rateLimitType: z.string().optional(),
        isUsingOverage: z.boolean().optional(),
        overageInUse: z.boolean().optional(),
    }),
})

const AssistantSchema = z.object({
    type: z.literal('assistant'),
    error: z.string().optional(),
})

const ResultSchema = z.object({
    type: z.literal('result'),
    subtype: z.string(),
    is_error: z.boolean().default(false),
    num_turns: z.number().int().min(0).default(0),
    duration_ms: z.number().min(0).default(0),
    total_cost_usd: z.number().default(0),
    usage: z
        .object({
            input_tokens: z.number().default(0),
            output_tokens: z.number().default(0),
            cache_read_input_tokens: z.number().default(0),
            cache_creation_input_tokens: z.number().default(0),
        })
        .default({
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
        }),
    permission_denials: z
        .array(z.object({ tool_name: z.string(), tool_use_id: z.string() }))
        .default([]),
    structured_output: z.unknown().optional(),
    result: z.string().default(''),
    errors: z.array(z.string()).default([]),
    session_id: z.string().optional(),
})

type Failed = { ok: false; failure: 'agent' | 'engine' | 'stop'; error: string }

type Outcome = { ok: true; structured_output: unknown } | Failed

const stop = (error: string): Failed => ({ ok: false, failure: 'stop', error })

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/** Why the account may not run agents, or `null` if it may. */
const accountProblem = (raw: unknown): string | null => {
    const parsed = AccountSchema.safeParse(raw)
    if (!parsed.success)
        return 'accountInfo() gave an answer of the wrong shape'
    const { subscriptionType, apiKeySource, apiProvider } = parsed.data
    const plan = (subscriptionType ?? '').toLowerCase()
    if (!PLANS.some((name) => plan.includes(name))) {
        return `no Claude subscription (subscriptionType=${subscriptionType ?? 'none'})`
    }
    if (apiKeySource !== undefined && apiKeySource !== 'none') {
        return `an API key is in use (apiKeySource=${apiKeySource})`
    }
    if (apiProvider !== undefined && apiProvider !== 'firstParty') {
        return `not Anthropic's own API (apiProvider=${apiProvider})`
    }
    return null
}

/** Why an init message is unsafe to go on with, or `null` if it is fine. */
const initProblem = (init: z.infer<typeof InitSchema>): string | null => {
    if (init.apiKeySource !== 'none') {
        return `init apiKeySource=${init.apiKeySource} (expected "none")`
    }
    const model = checkModel({ model: init.model })
    if (model !== null) return `init model: ${model}`
    const servers = init.mcp_servers
        .map(({ name }) => name)
        .filter((name) => name !== 'luca')
    const tools = init.tools.filter(
        (tool) => tool.startsWith('mcp__') && !tool.startsWith('mcp__luca__')
    )
    if (servers.length > 0 || tools.length > 0) {
        return `foreign MCP servers or tools: ${[...servers, ...tools].join(', ')}`
    }
    return null
}

/** Why a rate-limit event must stop the run, or `null`. Waits are #368's. */
const rateLimitProblem = (
    info: z.infer<typeof RateLimitSchema>['rate_limit_info']
): string | null => {
    const kind = info.rateLimitType ?? 'unknown'
    if (info.status === 'rejected') {
        return `rate_limit_event status=rejected (${kind})`
    }
    if (info.isUsingOverage === true) {
        return `rate_limit_event isUsingOverage=true (${kind})`
    }
    if (info.overageInUse === true) {
        return `rate_limit_event overageInUse=true (${kind})`
    }
    if (info.rateLimitType === 'overage')
        return 'rate_limit_event rateLimitType=overage'
    return null
}

/** A queue the SDK reads the agent's prompt from (streaming-input mode). */
const createInputChannel = () => {
    const queue: SDKUserMessage[] = []
    let wake: (() => void) | null = null
    let closed = false
    const poke = () => {
        wake?.()
        wake = null
    }
    const iterate = async function* (): AsyncGenerator<SDKUserMessage> {
        while (true) {
            const next = queue.shift()
            if (next !== undefined) {
                yield next
                continue
            }
            if (closed) return
            await new Promise<void>((resolve) => {
                wake = resolve
            })
        }
    }
    return {
        push: (message: SDKUserMessage) => {
            queue.push(message)
            poke()
        },
        close: () => {
            closed = true
            poke()
        },
        iterable: iterate(),
    }
}

const realClaudePath = (): string => {
    const found = Bun.which('claude')
    if (found === null) throw new Error('No `claude` binary on PATH.')
    return realpathSync(found)
}

const commonGitDir = async ({ cwd }: { cwd: string }): Promise<string> => {
    const result = await runCommand({
        cmd: ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'],
        cwd,
        timeout_ms: 30_000,
    })
    if (result.exit_code !== 0) {
        throw new Error(`git rev-parse failed in ${cwd}: ${result.stderr}`)
    }
    return realpathSync(result.stdout.trim())
}

/**
 * One agent session the launcher keeps open between turns, so a follow-up
 * reaches the same agent. Its guard hook, sandbox, and options are the ones
 * it was launched with.
 */
type OpenSession = {
    role: AgentRole
    ticket: number
    cwd: string
    may_edit_tests: boolean
    running: AgentQuerySession
    input: ReturnType<typeof createInputChannel>
    /** What the launcher has seen of the session; per-turn fields reset each turn. */
    summary: AgentSession
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
const nextOutcome = (open: OpenSession): Promise<Outcome> =>
    open.ended !== null
        ? Promise.resolve(open.ended)
        : new Promise<Outcome>((resolve) => {
              open.waiter = resolve
          })

const deliver = ({
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

const stderrTail = (open: OpenSession): string =>
    open.stderr.length === 0 ? '' : `\n${open.stderr.join('').slice(-2000)}`

/** Reads one message into the session's summary; an outcome ends the turn. */
const watch = ({
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
        summary.rate_limit_events.push(info)
        const problem = rateLimitProblem(info)
        return problem === null ? null : stop(problem)
    }
    const assistant = AssistantSchema.safeParse(raw)
    if (assistant.success) {
        return assistant.data.error === 'billing_error'
            ? stop('assistant error billing_error')
            : null
    }
    const result = ResultSchema.safeParse(raw)
    if (!result.success) return null
    const done = result.data
    summary.num_turns = done.num_turns
    summary.usage = done.usage
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
const pumpMessages = async ({
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

/**
 * The real agent launcher: one Claude Agent SDK session per agent, with
 * every guard on. Per launch it:
 *
 * 1. refuses a Fable or non-Claude model before starting anything;
 * 2. builds the role's locked-down options (`agentOptions`) with the guard
 *    hook (honoring `may_edit_tests`), the sandbox, and a clean environment;
 * 3. checks `accountInfo()` for a Claude plan and no API key BEFORE the
 *    prompt is sent;
 * 4. watches the messages: an unsafe init (API key, wrong model, foreign
 *    MCP), a rejected rate limit, overage, or a billing error stops the run;
 * 5. returns the result's structured output and the session's id (from its
 *    init message).
 *
 * The session stays open after its turn, in streaming-input mode, so
 * `followUp` can send it another message; the same watch applies to every
 * turn. A stop, an engine failure, or a timeout closes the session, and so
 * does sitting idle past `idle_timeout_ms`. `closeAll` closes every session
 * still open; call it when the run ends.
 *
 * `query` and `claude_path` are for tests; they default to the SDK's
 * `query` and the real path of the `claude` on PATH.
 *
 * @example
 * const launcher = createClaudeLauncher({})
 * const turn = await launcher.launch({ role: 'implementer', ticket: 11, prompt, cwd, may_edit_tests: false, config })
 * // ... later, in a fix loop:
 * if (turn.ok) await launcher.followUp({ session_id: turn.session_id, role: 'implementer', ticket: 11, message, cwd, config })
 * await launcher.closeAll()
 */
export const createClaudeLauncher = ({
    model,
    effort,
    query,
    claude_path,
    turn_timeout_ms,
    idle_timeout_ms,
}: {
    /** Defaults to `CLAUDE_MODEL`, Claude Opus 5.5. */
    model?: string
    /** Defaults to `AGENT_EFFORT`, the same for every role. */
    effort?: EffortLevel
    query?: AgentQuery
    claude_path?: string
    /** Defaults to `DEFAULT_TURN_TIMEOUT_MS`. */
    turn_timeout_ms?: number
    /** Defaults to `DEFAULT_IDLE_TIMEOUT_MS`. */
    idle_timeout_ms?: number
}): AgentLauncher & { closeAll: () => Promise<void> } => {
    const useModel = model ?? CLAUDE_MODEL
    const useEffort = effort ?? AGENT_EFFORT
    const startQuery: AgentQuery = query ?? sdkQuery
    const timeoutMs = turn_timeout_ms ?? DEFAULT_TURN_TIMEOUT_MS
    const idleMs = idle_timeout_ms ?? DEFAULT_IDLE_TIMEOUT_MS
    const sessions = new Map<string, OpenSession>()

    const close = async (open: OpenSession): Promise<void> => {
        clearTimeout(open.idle_timer)
        for (const [id, each] of sessions) {
            if (each === open) sessions.delete(id)
        }
        open.input.close()
        open.running.close()
        await Promise.race([open.pump, Bun.sleep(5_000)])
    }

    /** Keeps a session open for follow-ups until it sits idle too long. */
    const keepOpen = (open: OpenSession, session_id: string): void => {
        sessions.set(session_id, open)
        clearTimeout(open.idle_timer)
        open.idle_timer = setTimeout(() => void close(open), idleMs)
        open.idle_timer.unref?.()
    }

    /** Resets the summary's per-turn fields; the session's own stay. */
    const startTurn = (open: OpenSession): void => {
        clearTimeout(open.idle_timer)
        const fresh = AgentSessionSchema.parse({})
        open.summary = {
            ...fresh,
            session_id: open.summary.session_id,
            model: open.summary.model,
            claude_code_version: open.summary.claude_code_version,
            api_key_source: open.summary.api_key_source,
            subscription_type: open.summary.subscription_type,
        }
    }

    /**
     * Sends one message and waits for the turn's outcome. A success or an
     * agent failure keeps the session open for follow-ups; a stop, an
     * engine failure, or a timeout closes it.
     */
    const runTurn = async ({
        open,
        message,
        started,
        fallback_id,
    }: {
        open: OpenSession
        message: string
        started: number
        /** The id to report if the session never named itself. */
        fallback_id: string
    }): Promise<AgentTurn> => {
        const waiting = nextOutcome(open)
        open.input.push({
            type: 'user',
            message: { role: 'user', content: message },
            parent_tool_use_id: null,
        })
        let timer: ReturnType<typeof setTimeout> | undefined
        const timedOut = new Promise<'timeout'>((resolve) => {
            timer = setTimeout(() => resolve('timeout'), timeoutMs)
        })
        const raced = await Promise.race([waiting, timedOut])
        clearTimeout(timer)
        const outcome: Outcome =
            raced === 'timeout'
                ? {
                      ok: false,
                      failure: 'agent',
                      error: `No result within ${timeoutMs} ms; the agent was interrupted.`,
                  }
                : raced
        if (raced === 'timeout') {
            await open.running.interrupt().catch(() => undefined)
        }
        const session_id = open.summary.session_id ?? fallback_id
        const session = {
            ...open.summary,
            duration_ms: Date.now() - started,
        }
        const keep =
            raced !== 'timeout' &&
            open.ended === null &&
            open.summary.session_id !== null
        if (keep) keepOpen(open, session_id)
        else await close(open)
        return { ...outcome, session_id, session }
    }

    const launch: AgentLauncher['launch'] = async ({
        role,
        ticket,
        prompt,
        cwd,
        may_edit_tests,
        config,
    }) => {
        const refused = checkModel({ model: useModel })
        if (refused !== null) return stop(refused)
        const started = Date.now()
        const fallback_id = `claude-launch-${randomUUID()}`

        let claudePath: string
        try {
            claudePath = claude_path ?? realClaudePath()
        } catch (error) {
            return stop(errorText(error))
        }
        let worktree: string
        let gitDir: string
        try {
            worktree = realpathSync(cwd)
            gitDir = await commonGitDir({ cwd: worktree })
        } catch (error) {
            return { ok: false, failure: 'engine', error: errorText(error) }
        }

        const summary: AgentSession = AgentSessionSchema.parse({})
        const stderr: string[] = []
        const options = agentOptions({
            role,
            may_edit_tests,
            cwd: worktree,
            model: useModel,
            effort: useEffort,
            claude_path: claudePath,
            config,
            common_git_dir: gitDir,
            home: realpathSync(homedir()),
            env: agentEnv({ source: process.env }),
            guard_hook: createGuardHook({
                role: guardRoleOf({ role }),
                may_edit_tests,
                worktree,
                config,
                // The summary is swapped each turn, so this reads it late.
                on_deny: (denial) => open.summary.guard_denials.push(denial),
            }),
            stderr: (data) => {
                stderr.push(data)
                if (stderr.length > 50) stderr.shift()
            },
        })

        const input = createInputChannel()
        let running: AgentQuerySession
        try {
            running = startQuery({ prompt: input.iterable, options })
        } catch (error) {
            return {
                ok: false,
                failure: 'engine',
                error: `The SDK did not start: ${errorText(error)}`,
                session: { ...summary, duration_ms: Date.now() - started },
            }
        }
        const open: OpenSession = {
            role,
            ticket,
            cwd,
            may_edit_tests,
            running,
            input,
            summary,
            waiter: null,
            ended: null,
            pump: Promise.resolve(),
            idle_timer: undefined,
            stderr,
        }
        open.pump = pumpMessages({ open, on_end: () => void close(open) })

        const ended = async (outcome: Outcome): Promise<AgentTurn> => {
            await close(open)
            return {
                ...outcome,
                session_id: open.summary.session_id ?? fallback_id,
                session: { ...open.summary, duration_ms: Date.now() - started },
            }
        }

        let timer: ReturnType<typeof setTimeout> | undefined
        const timedOut = new Promise<'timeout'>((resolve) => {
            timer = setTimeout(() => resolve('timeout'), timeoutMs)
        })
        const account = await Promise.race([
            running.accountInfo().then(
                (info) => ({ info }),
                (error: unknown) => ({ error })
            ),
            nextOutcome(open).then((outcome) => ({ outcome })),
            timedOut,
        ])
        clearTimeout(timer)
        open.waiter = null
        if (account === 'timeout') {
            return ended({
                ok: false,
                failure: 'engine',
                error: 'accountInfo() did not answer in time.',
            })
        }
        if ('outcome' in account) return ended(account.outcome)
        if ('error' in account) {
            return ended({
                ok: false,
                failure: 'engine',
                error: `accountInfo() failed: ${errorText(account.error)}`,
            })
        }
        const accountParsed = AccountSchema.safeParse(account.info)
        summary.subscription_type = accountParsed.success
            ? (accountParsed.data.subscriptionType ?? null)
            : null
        const problem = accountProblem(account.info)
        if (problem !== null) return ended(stop(`credential check: ${problem}`))
        return runTurn({ open, message: prompt, started, fallback_id })
    }

    const followUp: AgentLauncher['followUp'] = async ({
        session_id,
        role,
        ticket,
        message,
    }) => {
        const open = sessions.get(session_id)
        if (open === undefined || open.ended !== null) {
            if (open !== undefined) await close(open)
            return {
                ok: false,
                failure: 'engine',
                session_id,
                error: `No open agent session ${session_id}: it closed or never started.`,
            }
        }
        if (open.role !== role || open.ticket !== ticket) {
            return {
                ok: false,
                failure: 'engine',
                session_id,
                error: `Session ${session_id} belongs to the ${open.role} on #${open.ticket}, not the ${role} on #${ticket}.`,
            }
        }
        startTurn(open)
        return runTurn({
            open,
            message,
            started: Date.now(),
            fallback_id: session_id,
        })
    }

    const closeAll = async (): Promise<void> => {
        await Promise.all([...new Set(sessions.values())].map(close))
    }

    return { launch, followUp, closeAll }
}
