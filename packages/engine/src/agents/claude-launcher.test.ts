import { realpathSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { AgentTurn } from './agent-launcher'
import { createClaudeLauncher, type AgentQuery } from './claude-launcher'
import type { AgentRole } from './role-results'

import type { EngineConfig } from '../config/engine-config'
import { LOCKFILES } from '../guards/role-rules'

/**
 * The launcher seam: `createClaudeLauncher` with a fake `query` that plays
 * back SDK-shaped messages, and a fake `claude` path. No model, no process.
 */

const CONFIG: EngineConfig = {
    checks: { test: 'bun test', types: 'bunx --bun tsc --noEmit' },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: ['src/test-setup.ts'],
    rule_files: [],
}

const CLAUDE_PATH = '/opt/fake/bin/claude'

const MAX_ACCOUNT = {
    email: 'me@example.com',
    subscriptionType: 'max',
    apiKeySource: 'none',
    apiProvider: 'firstParty',
}

const INIT = {
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

const APPROVE = {
    verdict: 'approve',
    findings: [],
    summary: 'Fine.',
    assumptions: [],
}

const result = (fields: Record<string, unknown>) => ({
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
 * it is closed.
 */
const fakeQuery = ({
    account,
    messages,
    hang,
    turns,
}: {
    account?: unknown
    messages?: (unknown | (() => never))[]
    hang?: boolean
    turns?: unknown[][]
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
                        for (const message of batch) yield message
                    }
                    await ended
                    return
                }
                await woken
                if (call.closed) return
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

let repo = ''

beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'luca-launcher-'))
    await $`git init -q -b main ${repo}`.quiet()
})

afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
})

const launch = ({
    query,
    model,
    role,
    turn_timeout_ms,
}: {
    query: AgentQuery
    model?: string
    role?: AgentRole
    turn_timeout_ms?: number
}): Promise<AgentTurn> =>
    createClaudeLauncher({
        query,
        model,
        claude_path: CLAUDE_PATH,
        turn_timeout_ms,
    }).launch({
        role: role ?? 'ticket-reviewer',
        ticket: 11,
        prompt: 'Review ticket #11.',
        cwd: repo,
        may_edit_tests: role === 'test-writer',
        config: CONFIG,
        messaging: null,
    })

describe('the model', () => {
    test.each(['claude-fable-5', 'CLAUDE-FABLE-5-1', 'gpt-5', 'opus'])(
        'refuses %s without starting a session',
        async (model) => {
            const fake = fakeQuery({})
            const turn = await launch({ query: fake.query, model })
            expect(turn).toMatchObject({ ok: false, failure: 'stop' })
            expect(fake.calls).toHaveLength(0)
        }
    )

    test('runs every role on Claude Opus 5.5 at the same effort', async () => {
        const fake = fakeQuery({ messages: [INIT, result({})] })
        for (const role of [
            'test-writer',
            'implementer',
            'ticket-reviewer',
        ] as const) {
            await launch({ query: fake.query, role })
        }
        expect(fake.calls.map(({ options }) => options.model)).toEqual([
            'claude-opus-5-5',
            'claude-opus-5-5',
            'claude-opus-5-5',
        ])
        expect(fake.calls.map(({ options }) => options.effort)).toEqual([
            'high',
            'high',
            'high',
        ])
    })
})

describe('credentials, before any prompt', () => {
    const cases: [string, Record<string, unknown>][] = [
        ['an API key', { ...MAX_ACCOUNT, apiKeySource: 'ANTHROPIC_API_KEY' }],
        ['no subscription', { email: 'me@example.com', apiKeySource: 'none' }],
        ['a free account', { ...MAX_ACCOUNT, subscriptionType: 'free' }],
        ['a cloud provider', { ...MAX_ACCOUNT, apiProvider: 'bedrock' }],
    ]
    test.each(cases)('refuses %s', async (_, account) => {
        const fake = fakeQuery({ account, messages: [INIT, result({})] })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({ ok: false, failure: 'stop' })
        expect(fake.calls[0]?.prompts).toEqual([])
        expect(fake.calls[0]?.closed).toBe(true)
    })

    test('checks the account before it sends the prompt', async () => {
        const fake = fakeQuery({ messages: [INIT, result({})] })
        await launch({ query: fake.query })
        expect(fake.calls[0]?.account_checked_before_prompt).toBe(true)
        expect(fake.calls[0]?.prompts).toHaveLength(1)
    })
})

describe('stops while the agent runs', () => {
    const cases: [string, unknown][] = [
        [
            'init with an API key',
            { ...INIT, apiKeySource: 'ANTHROPIC_API_KEY' },
        ],
        ['init with a Fable model', { ...INIT, model: 'claude-fable-5' }],
        [
            'init with a foreign MCP server',
            {
                ...INIT,
                mcp_servers: [{ name: 'muninn', status: 'connected' }],
            },
        ],
        [
            'init with a foreign MCP tool',
            { ...INIT, tools: [...INIT.tools, 'mcp__muninn__muninn_recall'] },
        ],
    ]
    test.each(cases)('stops on %s', async (_, message) => {
        const fake = fakeQuery({
            messages: [message, result({ structured_output: APPROVE })],
        })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({ ok: false, failure: 'stop' })
        expect(fake.calls[0]?.closed).toBe(true)
    })

    const rateLimit = (info: Record<string, unknown>) => ({
        type: 'rate_limit_event',
        rate_limit_info: info,
    })
    const planCases: [string, unknown, Record<string, unknown>][] = [
        [
            'a rejected rate limit days away',
            rateLimit({
                status: 'rejected',
                rateLimitType: 'seven_day',
                resetsAt: 1790420400,
            }),
            {
                rate_limit_events: [
                    {
                        status: 'rejected',
                        rateLimitType: 'seven_day',
                        resetsAt: 1790420400,
                    },
                ],
            },
        ],
        [
            'overage in use',
            rateLimit({ status: 'allowed', isUsingOverage: true }),
            {
                rate_limit_events: [
                    { status: 'allowed', isUsingOverage: true },
                ],
            },
        ],
        [
            'overage flagged',
            rateLimit({ status: 'allowed', overageInUse: true }),
            {},
        ],
        [
            'an overage limit',
            rateLimit({ status: 'allowed', rateLimitType: 'overage' }),
            {},
        ],
        [
            'a billing error',
            {
                type: 'assistant',
                error: 'billing_error',
                message: { content: [] },
            },
            { billing_error: true },
        ],
    ]
    test.each(planCases)(
        'cuts the turn off as the plan on %s, with the reason in its session',
        async (_, message, session) => {
            const fake = fakeQuery({
                messages: [
                    INIT,
                    message,
                    result({ structured_output: APPROVE }),
                ],
            })
            const turn = await launch({ query: fake.query })
            expect(turn).toMatchObject({ ok: false, failure: 'plan' })
            expect(turn.session).toMatchObject(session)
            expect(fake.calls[0]?.closed).toBe(true)
        }
    )

    test('allowed and allowed_warning readings run on', async () => {
        const fake = fakeQuery({
            messages: [
                INIT,
                rateLimit({ status: 'allowed', rateLimitType: 'five_hour' }),
                rateLimit({
                    status: 'allowed_warning',
                    rateLimitType: 'seven_day',
                    utilization: 0.9,
                }),
                result({ structured_output: APPROVE }),
            ],
        })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({ ok: true, structured_output: APPROVE })
        expect(turn.session?.rate_limit_events).toHaveLength(2)
    })

    test("an init with only the engine's own server and tools runs on", async () => {
        const fake = fakeQuery({
            messages: [
                {
                    ...INIT,
                    mcp_servers: [{ name: 'luca', status: 'connected' }],
                    tools: [...INIT.tools, 'mcp__luca__send_message'],
                },
                {
                    type: 'rate_limit_event',
                    rate_limit_info: {
                        status: 'allowed',
                        isUsingOverage: false,
                        overageStatus: 'rejected',
                    },
                },
                result({ structured_output: APPROVE }),
            ],
        })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({ ok: true, structured_output: APPROVE })
    })
})

describe('the result', () => {
    test('a success returns its structured output and a session summary', async () => {
        const fake = fakeQuery({
            messages: [
                INIT,
                {
                    type: 'rate_limit_event',
                    rate_limit_info: { status: 'allowed', utilization: 0.2 },
                },
                result({
                    structured_output: APPROVE,
                    permission_denials: [
                        {
                            tool_name: 'Bash',
                            tool_use_id: 'tool-1',
                            tool_input: { command: 'curl x' },
                        },
                    ],
                }),
            ],
        })
        const turn = await launch({ query: fake.query })

        expect(turn).toMatchObject({
            ok: true,
            session_id: 'session-1',
            structured_output: APPROVE,
        })
        expect(turn.session).toMatchObject({
            session_id: 'session-1',
            model: 'claude-opus-5-5',
            claude_code_version: '2.1.280',
            api_key_source: 'none',
            subscription_type: 'max',
            num_turns: 3,
            usage: {
                input_tokens: 10,
                output_tokens: 20,
                cache_read_input_tokens: 30,
                cache_creation_input_tokens: 40,
            },
            total_cost_usd: 0.25,
            permission_denials: [{ tool_name: 'Bash', tool_use_id: 'tool-1' }],
            guard_denials: [],
            rate_limit_events: [{ status: 'allowed', utilization: 0.2 }],
        })
    })

    test('a success with no structured output carries none, so the engine fails the try', async () => {
        const fake = fakeQuery({ messages: [INIT, result({})] })
        const turn = await launch({ query: fake.query })
        expect(turn.ok && turn.structured_output).toBeUndefined()
    })

    test.each([
        ['error_max_turns', ['Reached the maximum number of turns']],
        ['error_during_execution', ['Tool crashed']],
        ['error_max_structured_output_retries', ['Bad output']],
    ])("an %s result fails the agent's try", async (subtype, errors) => {
        const fake = fakeQuery({
            messages: [INIT, result({ subtype, is_error: true, errors })],
        })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({
            ok: false,
            failure: 'agent',
            error: expect.stringContaining(subtype),
        })
    })

    test('an SDK that throws is an engine failure', async () => {
        const fake = fakeQuery({
            messages: [
                INIT,
                () => {
                    throw new Error('Claude Code process exited with code 1')
                },
            ],
        })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({
            ok: false,
            failure: 'engine',
            error: expect.stringContaining('exited with code 1'),
        })
        expect(fake.calls[0]?.closed).toBe(true)
    })

    test('a stream that ends with no result is an engine failure', async () => {
        const fake = fakeQuery({ messages: [INIT] })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({ ok: false, failure: 'engine' })
    })

    test("a turn past its time is interrupted and fails the agent's try", async () => {
        const fake = fakeQuery({ messages: [INIT], hang: true })
        const turn = await launch({ query: fake.query, turn_timeout_ms: 50 })
        expect(turn).toMatchObject({ ok: false, failure: 'agent' })
        expect(fake.calls[0]?.interrupted).toBe(true)
        expect(fake.calls[0]?.closed).toBe(true)
    })
})

describe('the options', () => {
    test('lock the agent down', async () => {
        const saved = {
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
            ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
            ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
        }
        process.env.ANTHROPIC_API_KEY = 'sk-ant-leak'
        process.env.ANTHROPIC_AUTH_TOKEN = 'token-leak'
        process.env.ANTHROPIC_BASE_URL = 'https://proxy.example.com'
        const fake = fakeQuery({ messages: [INIT, result({})] })
        try {
            await launch({ query: fake.query, role: 'implementer' })
        } finally {
            for (const [name, value] of Object.entries(saved)) {
                if (value === undefined) delete process.env[name]
                else process.env[name] = value
            }
        }
        const options = fake.calls[0]?.options
        const worktree = realpathSync(repo)
        const home = realpathSync(homedir())

        expect(options).toMatchObject({
            cwd: worktree,
            model: 'claude-opus-5-5',
            effort: 'high',
            pathToClaudeCodeExecutable: CLAUDE_PATH,
            permissionMode: 'dontAsk',
            settingSources: [],
            strictMcpConfig: true,
            mcpServers: {},
            skills: [],
            persistSession: false,
            tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
            systemPrompt: { type: 'preset', preset: 'claude_code' },
            outputFormat: { type: 'json_schema' },
        })
        expect(options?.sandbox).toMatchObject({
            enabled: true,
            failIfUnavailable: true,
            autoAllowBashIfSandboxed: false,
            allowUnsandboxedCommands: false,
            network: {
                allowedDomains: [],
                strictAllowlist: true,
                allowLocalBinding: false,
            },
            filesystem: {
                denyWrite: [
                    join(worktree, '.git'),
                    join(worktree, '.git'),
                    join(worktree, 'node_modules'),
                    join(worktree, '**/node_modules'),
                    ...LOCKFILES.map((name) => join(worktree, name)),
                    join(worktree, 'src/**/*.test.ts'),
                    join(worktree, 'src/test-setup.ts'),
                ],
                denyRead: [
                    join(home, '.claude.json'),
                    join(home, '.claude'),
                    join(home, '.paseo'),
                    join(home, '.ssh'),
                    join(home, '.config/gh'),
                ],
            },
        })
        for (const path of [
            ...(options?.sandbox?.filesystem?.denyWrite ?? []),
            ...(options?.sandbox?.filesystem?.denyRead ?? []),
        ]) {
            expect(path.startsWith('/')).toBe(true)
        }
        expect(options?.env).toBeDefined()
        expect(Object.keys(options?.env ?? {})).not.toContain(
            'ANTHROPIC_API_KEY'
        )
        expect(Object.keys(options?.env ?? {})).not.toContain(
            'ANTHROPIC_AUTH_TOKEN'
        )
        expect(Object.keys(options?.env ?? {})).not.toContain(
            'ANTHROPIC_BASE_URL'
        )
        expect(options?.env).toMatchObject({
            CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
            ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
        })
        expect(options?.allowedTools).toContain('Bash(bun test)')
        expect(options?.disallowedTools).toContain('WebFetch')
        expect(options?.disallowedTools).toContain('Edit(src/**/*.test.ts)')
    })

    test('the guard hook denies what the role may not do, and counts it', async () => {
        const fake = fakeQuery({ messages: [INIT], hang: true })
        const running = launch({
            query: fake.query,
            role: 'implementer',
            turn_timeout_ms: 1_000,
        })
        while (fake.calls.length === 0) await Bun.sleep(5)
        const hook = fake.calls[0]?.options.hooks?.PreToolUse?.[0]?.hooks[0]
        if (hook === undefined) throw new Error('no PreToolUse hook')
        const signal = new AbortController().signal
        const denied = await hook(
            {
                hook_event_name: 'PreToolUse',
                tool_name: 'Bash',
                tool_input: { command: 'git commit -m x' },
                tool_use_id: 'tool-1',
                session_id: 'session-1',
                transcript_path: '/dev/null',
                cwd: repo,
            },
            'tool-1',
            { signal }
        )
        const allowed = await hook(
            {
                hook_event_name: 'PreToolUse',
                tool_name: 'Bash',
                tool_input: { command: 'bun test' },
                tool_use_id: 'tool-2',
                session_id: 'session-1',
                transcript_path: '/dev/null',
                cwd: repo,
            },
            'tool-2',
            { signal }
        )
        expect(denied).toMatchObject({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
            },
        })
        expect(allowed).toEqual({})
        const turn = await running
        expect(turn.session?.guard_denials).toEqual([
            {
                tool_name: 'Bash',
                reason: expect.stringContaining('git commit'),
            },
        ])
    })
})

const IMPLEMENTER_DONE = {
    outcome: 'done',
    bad_test: null,
    summary: 'Done.',
    assumptions: [],
    run_notes: [],
}

describe('follow-ups', () => {
    const launcherFor = (query: AgentQuery, idle_timeout_ms?: number) =>
        createClaudeLauncher({
            query,
            claude_path: CLAUDE_PATH,
            idle_timeout_ms,
        })

    const launchImplementer = (
        launcher: ReturnType<typeof createClaudeLauncher>
    ) =>
        launcher.launch({
            role: 'implementer',
            ticket: 11,
            prompt: 'Build ticket #11.',
            cwd: repo,
            may_edit_tests: false,
            config: CONFIG,
            messaging: null,
        })

    const followUp = (
        launcher: ReturnType<typeof createClaudeLauncher>,
        session_id: string
    ) =>
        launcher.followUp({
            session_id,
            role: 'implementer',
            ticket: 11,
            message: 'lint failed: fix it.',
            cwd: repo,
            config: CONFIG,
        })

    test('a follow-up reaches the same session and returns its second result', async () => {
        const fake = fakeQuery({
            turns: [
                [INIT, result({ structured_output: { n: 1 } })],
                [result({ structured_output: IMPLEMENTER_DONE, num_turns: 5 })],
            ],
        })
        const launcher = launcherFor(fake.query)
        const first = await launchImplementer(launcher)
        const second = await followUp(launcher, 'session-1')
        await launcher.closeAll()

        expect(first).toMatchObject({
            ok: true,
            session_id: 'session-1',
            structured_output: { n: 1 },
        })
        expect(second).toMatchObject({
            ok: true,
            session_id: 'session-1',
            structured_output: IMPLEMENTER_DONE,
        })
        expect(second.session).toMatchObject({
            session_id: 'session-1',
            model: 'claude-opus-5-5',
            num_turns: 5,
        })
        expect(fake.calls).toHaveLength(1)
        expect(
            fake.calls[0]?.prompts.map(({ message }) => message.content)
        ).toEqual(['Build ticket #11.', 'lint failed: fix it.'])
        expect(fake.calls[0]?.closed).toBe(true)
    })

    test("each turn's session id is the one the session's init names", async () => {
        const fake = fakeQuery({
            turns: [[{ ...INIT, session_id: 'abc-123' }, result({})]],
        })
        const launcher = launcherFor(fake.query)
        const turn = await launchImplementer(launcher)
        await launcher.closeAll()
        expect(turn.session_id).toBe('abc-123')
    })

    test('a follow-up to an unknown session is an engine failure', async () => {
        const fake = fakeQuery({})
        const turn = await followUp(launcherFor(fake.query), 'nope')
        expect(turn).toMatchObject({
            ok: false,
            failure: 'engine',
            session_id: 'nope',
        })
        expect(fake.calls).toHaveLength(0)
    })

    test('a session with no init id can take no follow-up', async () => {
        const fake = fakeQuery({
            turns: [[{ ...INIT, session_id: null }, result({})]],
        })
        const launcher = launcherFor(fake.query)
        const turn = await launchImplementer(launcher)
        expect(turn.session_id).toStartWith('claude-launch-')
        expect(fake.calls[0]?.closed).toBe(true)
        expect(await followUp(launcher, turn.session_id ?? '')).toMatchObject({
            ok: false,
            failure: 'engine',
        })
    })

    test('a rejected limit in a follow-up cuts it off as the plan, and closes the session', async () => {
        const fake = fakeQuery({
            turns: [
                [INIT, result({ structured_output: { n: 1 } })],
                [
                    {
                        type: 'rate_limit_event',
                        rate_limit_info: {
                            status: 'rejected',
                            rateLimitType: 'five_hour',
                        },
                    },
                ],
            ],
        })
        const launcher = launcherFor(fake.query)
        await launchImplementer(launcher)
        const turn = await followUp(launcher, 'session-1')
        expect(turn).toMatchObject({ ok: false, failure: 'plan' })
        expect(turn.session?.rate_limit_events).toEqual([
            { status: 'rejected', rateLimitType: 'five_hour' },
        ])
        expect(fake.calls[0]?.closed).toBe(true)
        expect(await followUp(launcher, 'session-1')).toMatchObject({
            ok: false,
            failure: 'engine',
        })
    })

    test('closeAll closes every open session', async () => {
        const fake = fakeQuery({ turns: [[INIT, result({})]] })
        const launcher = launcherFor(fake.query)
        await launchImplementer(launcher)
        expect(fake.calls[0]?.closed).toBe(false)
        await launcher.closeAll()
        expect(fake.calls[0]?.closed).toBe(true)
        expect(await followUp(launcher, 'session-1')).toMatchObject({
            ok: false,
            failure: 'engine',
        })
    })

    test('a session idle past its timeout closes', async () => {
        const fake = fakeQuery({ turns: [[INIT, result({})]] })
        const launcher = launcherFor(fake.query, 20)
        await launchImplementer(launcher)
        await Bun.sleep(60)
        expect(fake.calls[0]?.closed).toBe(true)
        expect(await followUp(launcher, 'session-1')).toMatchObject({
            ok: false,
            failure: 'engine',
        })
    })
})
