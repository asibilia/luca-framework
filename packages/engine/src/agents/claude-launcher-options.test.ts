import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
    CLAUDE_PATH,
    fakeQuery,
    INIT,
    launch,
    repo,
    repoPerTest,
    result,
} from './claude-launcher-helpers'

import { LOCKFILES } from '../guards/role-rules'

/**
 * The launcher seam: `createClaudeLauncher` with a fake `query` that plays
 * back SDK-shaped messages, and a fake `claude` path. No model, no process.
 *
 * Here: the options a launch passes to the SDK. The model and the
 * credentials check are in `claude-launcher.test.ts`. The rest are in
 * `claude-launcher-*.test.ts`, and the helpers they share are in
 * `claude-launcher-helpers.ts`.
 */

repoPerTest()

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
            pathToClaudeCodeExecutable: CLAUDE_PATH,
            permissionMode: 'dontAsk',
            settingSources: [],
            strictMcpConfig: true,
            mcpServers: {},
            skills: [],
            persistSession: false,
            systemPrompt: { type: 'preset', preset: 'claude_code' },
            outputFormat: { type: 'json_schema' },
        })
        // Besides `Agent`, for its helpers (#627).
        const tools = Array.isArray(options?.tools) ? options.tools : []
        expect(tools.filter((tool) => tool !== 'Agent')).toEqual([
            'Read',
            'Grep',
            'Glob',
            'Edit',
            'Write',
            'Bash',
        ])
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

    test("a writer may also write macOS's per-user temp folder, at its real path", async () => {
        const fake = fakeQuery({ messages: [INIT, result({})] })
        await launch({ query: fake.query, role: 'implementer' })
        const allowWrite =
            fake.calls[0]?.options?.sandbox?.filesystem?.allowWrite
        if (process.platform !== 'darwin') {
            expect(allowWrite).toBeUndefined()
            return
        }
        // Foundation stages atomic writes here, not in $TMPDIR, so a Swift
        // rebuild inside the sandbox needs it.
        const asked = Bun.spawnSync(['getconf', 'DARWIN_USER_TEMP_DIR'])
            .stdout.toString()
            .trim()
        expect(allowWrite).toEqual([realpathSync(asked)])
        expect(allowWrite?.[0]?.startsWith('/private/var/folders/')).toBe(true)
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
