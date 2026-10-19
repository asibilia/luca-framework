/**
 * How the Claude launcher starts one agent session: checks the model, builds
 * the role's locked-down options (guard hook, sandbox, clean environment),
 * starts the SDK session, checks the account BEFORE the prompt is sent, then
 * runs the first turn on the pool's open session.
 */
import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'

import type {
    EffortLevel,
    Options,
    SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'

import {
    AgentSessionSchema,
    type AgentLauncher,
    type AgentSession,
    type AgentTurn,
} from './agent-launcher'
import {
    AccountSchema,
    accountProblem,
    errorText,
    stop,
    type Outcome,
} from './claude-messages'
import { agentEnv, agentOptions, checkLaunchModel } from './claude-options'
import { createInputChannel } from './input-channel'
import { commonGitDir, realClaudePath } from './launch-paths'
import { createDeliveryHook, createLucaServer } from './message-tool'
import {
    nextOutcome,
    pumpMessages,
    type AgentQuerySession,
    type OpenSession,
} from './open-session'
import type { SessionPool } from './session-pool'

import { createGuardHook } from '../guards/guard-hook'
import { guardRoleOf } from '../guards/role-rules'

/** Starts an SDK session: the SDK's `query`, or a fake in tests. */
export type AgentQuery = (params: {
    prompt: AsyncIterable<SDKUserMessage>
    options: Options
}) => AgentQuerySession

/**
 * Makes the launcher's `launch`: it starts an SDK session with `start_query`
 * and runs the session's first turn through the pool.
 *
 * @example
 * const launch = createLaunch({ effort, start_query, claude_path, turn_timeout_ms, pool })
 */
export const createLaunch = ({
    effort: useEffort,
    start_query: startQuery,
    claude_path,
    turn_timeout_ms: timeoutMs,
    pool,
}: {
    effort: EffortLevel
    start_query: AgentQuery
    claude_path: string | undefined
    turn_timeout_ms: number
    pool: Pick<SessionPool, 'close' | 'runTurn'>
}): AgentLauncher['launch'] => {
    const { close, runTurn } = pool

    const launch: AgentLauncher['launch'] = async ({
        role,
        ticket,
        prompt,
        cwd,
        may_edit_tests,
        config,
        messaging,
        model,
    }) => {
        const refused = checkLaunchModel({ model })
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
            model,
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
            // Kept in the session's options, so its follow-ups have them too.
            luca_server:
                messaging === null ? null : createLucaServer({ messaging }),
            delivery_hook:
                messaging === null ? null : createDeliveryHook({ messaging }),
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
            model_totals: {},
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

    return launch
}
