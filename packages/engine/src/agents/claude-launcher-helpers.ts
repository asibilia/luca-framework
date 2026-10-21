import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { afterEach, beforeEach } from 'bun:test'

import type { AgentMessaging, AgentTurn } from './agent-launcher'
import { createClaudeLauncher, type AgentQuery } from './claude-launcher'
import { CLAUDE_MODEL } from './claude-options'
import { roleEffort } from './role-effort'
import type { AgentRole } from './role-results'

import type { EngineConfig } from '../config/engine-config'

/**
 * Helpers shared by the launcher tests (`claude-launcher.test.ts` and the
 * `claude-launcher-*.test.ts` files beside it).
 *
 * The launcher seam: `createClaudeLauncher` with a fake `query` that plays
 * back SDK-shaped messages, and a fake `claude` path. No model, no process.
 */

export const CONFIG: EngineConfig = {
    checks: { test: 'bun test', types: 'bunx --bun tsc --noEmit' },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: ['src/test-setup.ts'],
    rule_files: [],
}

export const CLAUDE_PATH = '/opt/fake/bin/claude'

export const MAX_ACCOUNT = {
    email: 'me@example.com',
    subscriptionType: 'max',
    apiKeySource: 'none',
    apiProvider: 'firstParty',
}

export const INIT = {
    type: 'system',
    subtype: 'init',
    apiKeySource: 'none',
    model: 'claude-opus-5-5',
    claude_code_version: '2.1.280',
    session_id: 'session-1',
    cwd: '/somewhere',
    tools: ['Read', 'Grep', 'Glob', 'Bash', 'StructuredOutput'],
    mcp_servers: [],
    permissionMode: 'dontAsk',
}

export const APPROVE = {
    verdict: 'approve',
    findings: [],
    summary: 'Fine.',
    assumptions: [],
}

export const result = (fields: Record<string, unknown>) => ({
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 3,
    duration_ms: 1200,
    total_cost_usd: 0.25,
    usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 40,
    },
    permission_denials: [],
    session_id: 'session-1',
    ...fields,
})

type FakeCall = {
    options: Options
    prompts: SDKUserMessage[]
    account_checked_before_prompt: boolean
    interrupted: boolean
    closed: boolean
}

/**
 * A fake `query`: it answers `accountInfo()` with `account`, waits for the
 * first prompt, then plays `messages` (a function throws where it sits).
 * With `hang`, it runs until it is closed. With `turns`, it plays one list
 * per prompt instead, like a session in streaming-input mode, and runs until
 * it is closed. `during` runs after each prompt arrives and before that
 * turn's messages play, the way the agent's tool calls happen mid-turn.
 */
export const fakeQuery = ({
    account,
    messages,
    hang,
    turns,
    during,
}: {
    account?: unknown
    messages?: (unknown | (() => never))[]
    hang?: boolean
    turns?: unknown[][]
    during?: (call: FakeCall, turn: number) => Promise<void>
}) => {
    const calls: FakeCall[] = []
    const query: AgentQuery = ({ prompt, options }) => {
        let accountChecked = false
        const call: FakeCall = {
            options,
            prompts: [],
            account_checked_before_prompt: false,
            interrupted: false,
            closed: false,
        }
        calls.push(call)
        let wake = () => {}
        const woken = new Promise<void>((resolve) => {
            wake = resolve
        })
        let end = () => {}
        const ended = new Promise<void>((resolve) => {
            end = resolve
        })
        let notify = () => {}
        const prompted = (count: number) =>
            new Promise<void>((resolve) => {
                notify = () => {
                    if (call.prompts.length >= count || call.closed) resolve()
                }
                notify()
            })
        void (async () => {
            for await (const message of prompt) {
                if (call.prompts.length === 0) {
                    call.account_checked_before_prompt = accountChecked
                }
                call.prompts.push(message)
                wake()
                notify()
            }
        })()
        return {
            [Symbol.asyncIterator]: async function* () {
                if (turns !== undefined) {
                    for (const [index, batch] of turns.entries()) {
                        await prompted(index + 1)
                        if (call.closed) return
                        await during?.(call, index)
                        for (const message of batch) yield message
                    }
                    await ended
                    return
                }
                await woken
                if (call.closed) return
                await during?.(call, 0)
                for (const message of messages ?? []) {
                    if (typeof message === 'function') message()
                    yield message
                }
                if (hang) await ended
            },
            accountInfo: async () => {
                accountChecked = true
                return account ?? MAX_ACCOUNT
            },
            interrupt: async () => {
                call.interrupted = true
            },
            close: () => {
                call.closed = true
                wake()
                end()
                notify()
            },
        }
    }
    return { query, calls }
}

/** The git repo the current test runs in: a fresh one for each test. */
export let repo = ''

/** Gives each test of the file that calls it a fresh git repo in `repo`. */
export const repoPerTest = () => {
    beforeEach(async () => {
        repo = await mkdtemp(join(tmpdir(), 'luca-launcher-'))
        await $`git init -q -b main ${repo}`.quiet()
    })

    afterEach(async () => {
        await rm(repo, { recursive: true, force: true })
    })
}

export const launch = ({
    query,
    model,
    role,
    turn_timeout_ms,
    messaging,
}: {
    query: AgentQuery
    model?: string
    role?: AgentRole
    turn_timeout_ms?: number
    messaging?: AgentMessaging
}): Promise<AgentTurn> =>
    createClaudeLauncher({
        query,
        claude_path: CLAUDE_PATH,
        turn_timeout_ms,
    }).launch({
        role: role ?? 'ticket-reviewer',
        ticket: 11,
        prompt: 'Review ticket #11.',
        cwd: repo,
        may_edit_tests: role === 'test-writer',
        config: CONFIG,
        messaging: messaging ?? null,
        model: model ?? CLAUDE_MODEL,
        effort: roleEffort({ role: role ?? 'ticket-reviewer', config: CONFIG }),
    })

export const IMPLEMENTER_DONE = {
    outcome: 'done',
    bad_test: null,
    summary: 'Done.',
    assumptions: [],
    run_notes: [],
}
