import {
    mkdirSync,
    mkdtempSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { checkAgyToolCall } from './agy-tool-rules'
import type { AgentRole } from './role-results'

import { EngineConfigSchema } from '../config/engine-config'
import { guardRoleOf } from '../guards/role-rules'

const CONFIG = EngineConfigSchema.parse({
    checks: {
        test: 'bun test',
        types: 'bunx --bun tsc --noEmit',
        lint: 'bun run lint',
    },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: ['src/test-setup.ts'],
    rule_files: [],
})

type Fixture = {
    root: string
    worktree_real: string
    state_dir_real: string
    home_real: string
    outside_real: string
}

let fixture: Fixture | null = null

const makeState = ({
    role,
    may_edit_tests = role === 'test-writer',
    fx,
}: {
    role: AgentRole
    may_edit_tests?: boolean
    fx: Fixture
}) => ({
    role,
    guard_role: guardRoleOf({ role }),
    may_edit_tests,
    worktree_real: fx.worktree_real,
    state_dir_real: fx.state_dir_real,
    home_real: fx.home_real,
    config: CONFIG,
})

const setupFixture = (): Fixture => {
    const rawRoot = mkdtempSync(join(tmpdir(), 'luca-agy-rules-'))
    const root = realpathSync(rawRoot)
    const worktree_real = join(root, 'worktree')
    const state_dir_real = join(root, 'state')
    const home_real = join(root, 'home')
    const outside_real = join(root, 'outside')

    mkdirSync(join(worktree_real, 'src'), { recursive: true })
    mkdirSync(join(worktree_real, '.git'), { recursive: true })
    mkdirSync(join(worktree_real, 'node_modules', 'pkg'), { recursive: true })
    mkdirSync(state_dir_real, { recursive: true })
    mkdirSync(join(home_real, '.gemini'), { recursive: true })
    mkdirSync(join(home_real, '.claude'), { recursive: true })
    mkdirSync(join(home_real, '.paseo'), { recursive: true })
    mkdirSync(join(home_real, '.ssh'), { recursive: true })
    mkdirSync(join(home_real, '.config', 'gh'), { recursive: true })
    mkdirSync(outside_real, { recursive: true })

    writeFileSync(join(worktree_real, 'src', 'app.ts'), 'export const x = 1\n')
    writeFileSync(join(worktree_real, 'src', 'app.test.ts'), '')
    writeFileSync(join(worktree_real, 'src', 'test-setup.ts'), '')
    writeFileSync(join(worktree_real, 'bun.lock'), '')
    writeFileSync(join(worktree_real, '.git', 'config'), '')
    writeFileSync(join(worktree_real, 'node_modules', 'pkg', 'index.js'), '')
    writeFileSync(join(state_dir_real, 'state.json'), '{}')
    writeFileSync(join(state_dir_real, 'denials.jsonl'), '')
    writeFileSync(join(home_real, '.claude.json'), '{}')
    writeFileSync(join(home_real, '.gemini', 'oauth.json'), '{}')
    writeFileSync(join(home_real, '.claude', 'settings.json'), '{}')
    writeFileSync(join(home_real, '.paseo', 'config.json'), '{}')
    writeFileSync(join(home_real, '.ssh', 'id_rsa'), 'SECRET')
    writeFileSync(join(home_real, '.config', 'gh', 'hosts.yml'), 'token')
    writeFileSync(join(outside_real, 'secret.txt'), 'outside')

    return { root, worktree_real, state_dir_real, home_real, outside_real }
}

beforeEach(() => {
    fixture = setupFixture()
})

afterEach(() => {
    if (fixture !== null) {
        rmSync(fixture.root, { recursive: true, force: true })
        fixture = null
    }
})

describe('Tier 2 — symlink escapes, secret paths, state dir, flags, and disallowed tools', () => {
    test('blocks symlinks and direct paths into AGY_SECRET_PATHS for reads and writes', () => {
        if (fixture === null) throw new Error('missing fixture')
        const impl = makeState({ role: 'implementer', fx: fixture })
        const secrets = [
            join(fixture.home_real, '.gemini', 'oauth.json'),
            join(fixture.home_real, '.claude.json'),
            join(fixture.home_real, '.claude', 'settings.json'),
            join(fixture.home_real, '.paseo', 'config.json'),
            join(fixture.home_real, '.ssh', 'id_rsa'),
            join(fixture.home_real, '.config', 'gh', 'hosts.yml'),
        ]
        secrets.forEach((target, idx) => {
            if (fixture === null) throw new Error('missing fixture')
            const link = join(fixture.worktree_real, `secret-link-${idx}`)
            symlinkSync(target, link)
            expect(
                checkAgyToolCall({
                    state: impl,
                    tool_name: 'view_file',
                    tool_input: { AbsolutePath: link },
                })
            ).toEqual({
                allow: false,
                reason: 'Reading secret files is not allowed.',
            })
            expect(
                checkAgyToolCall({
                    state: impl,
                    tool_name: 'write_to_file',
                    tool_input: { TargetFile: `secret-link-${idx}` },
                })
            ).toEqual({
                allow: false,
                reason: 'Writing secret files is not allowed.',
            })
        })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'grep_search',
                tool_input: { SearchPath: join(fixture.home_real, '.gemini') },
            })
        ).toEqual({
            allow: false,
            reason: 'Reading secret files is not allowed.',
        })
    })

    test('blocks symlink escapes (existing and non-existent nested targets) and .. traversal outside worktree', () => {
        if (fixture === null) throw new Error('missing fixture')
        const impl = makeState({ role: 'implementer', fx: fixture })
        const linkDir = join(fixture.worktree_real, 'escape-dir')
        symlinkSync(fixture.outside_real, linkDir)

        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: join(linkDir, 'secret.txt') },
            })
        ).toEqual({
            allow: false,
            reason: `${join(linkDir, 'secret.txt')} is outside your worktree.`,
        })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'escape-dir/nested/new.ts' },
            })
        ).toEqual({
            allow: false,
            reason: 'escape-dir/nested/new.ts is outside your worktree.',
        })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'view_file',
                tool_input: { Path: '../outside/secret.txt' },
            })
        ).toEqual({
            allow: false,
            reason: '../outside/secret.txt is outside your worktree.',
        })
    })

    test('blocks direct and symlinked access to LUCA_AGY_STATE_DIR', () => {
        if (fixture === null) throw new Error('missing fixture')
        const impl = makeState({ role: 'implementer', fx: fixture })
        const stateFile = join(fixture.state_dir_real, 'state.json')
        const stateLink = join(fixture.worktree_real, 'hook-state')
        symlinkSync(fixture.state_dir_real, stateLink)

        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: stateFile },
            })
        ).toEqual({
            allow: false,
            reason: `${stateFile} is outside your worktree.`,
        })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'write_to_file',
                tool_input: {
                    TargetFile: join(stateLink, 'out-of-turns.flag'),
                },
            })
        ).toEqual({
            allow: false,
            reason: `${join(stateLink, 'out-of-turns.flag')} is outside your worktree.`,
        })
    })

    test('denies missing or empty required parameters for read, write, and shell tools', () => {
        if (fixture === null) throw new Error('missing fixture')
        const impl = makeState({ role: 'implementer', fx: fixture })

        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'view_file',
                tool_input: {},
            })
        ).toEqual({ allow: false, reason: 'view_file needs a path.' })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: '' },
            })
        ).toEqual({ allow: false, reason: 'view_file needs a path.' })

        for (const tool of [
            'write_to_file',
            'replace_file_content',
            'multi_replace_file_content',
            'sed_file',
            'notebook_edit',
        ]) {
            expect(
                checkAgyToolCall({
                    state: impl,
                    tool_name: tool,
                    tool_input: {},
                })
            ).toEqual({ allow: false, reason: `${tool} needs a file path.` })
        }

        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'run_command',
                tool_input: {},
            })
        ).toEqual({ allow: false, reason: 'run_command needs a CommandLine.' })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'run_command',
                tool_input: { CommandLine: '' },
            })
        ).toEqual({ allow: false, reason: 'run_command needs a CommandLine.' })
    })

    test('enforces run_command sandbox/background flags, learner shell ban, and shell rules', () => {
        if (fixture === null) throw new Error('missing fixture')
        const impl = makeState({ role: 'implementer', fx: fixture })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'run_command',
                tool_input: { CommandLine: 'bun test', IsDaemon: true },
            })
        ).toEqual({ allow: false, reason: 'No background commands.' })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'run_command',
                tool_input: { CommandLine: 'bun test', BypassSandbox: true },
            })
        ).toEqual({
            allow: false,
            reason: 'Every command runs in the sandbox.',
        })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'run_command',
                tool_input: { CommandLine: 'git commit -m x' },
            }).allow
        ).toBe(false)
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'run_command',
                tool_input: { CommandLine: 'bun install' },
            }).allow
        ).toBe(false)

        for (const role of ['learner', 'story-writer'] as const) {
            expect(
                checkAgyToolCall({
                    state: makeState({ role, fx: fixture }),
                    tool_name: 'run_command',
                    tool_input: { CommandLine: 'ls' },
                })
            ).toEqual({ allow: false, reason: 'A learner may not use Bash.' })
        }
    })

    test('enforces role write restrictions and protected repository files', () => {
        if (fixture === null) throw new Error('missing fixture')
        const tw = makeState({
            role: 'test-writer',
            may_edit_tests: true,
            fx: fixture,
        })
        for (const path of ['src/app.ts', 'src/test-setup.ts', 'bun.lock']) {
            expect(
                checkAgyToolCall({
                    state: tw,
                    tool_name: 'write_to_file',
                    tool_input: { TargetFile: path },
                }).allow
            ).toBe(false)
        }

        const impl = makeState({
            role: 'implementer',
            may_edit_tests: false,
            fx: fixture,
        })
        for (const path of [
            'src/app.test.ts',
            '.git/config',
            'node_modules/pkg/index.js',
        ]) {
            expect(
                checkAgyToolCall({
                    state: impl,
                    tool_name: 'write_to_file',
                    tool_input: { TargetFile: path },
                }).allow
            ).toBe(false)
        }

        for (const role of [
            'ticket-reviewer',
            'learner',
            'story-writer',
        ] as const) {
            expect(
                checkAgyToolCall({
                    state: makeState({ role, fx: fixture }),
                    tool_name: 'write_to_file',
                    tool_input: { TargetFile: 'src/app.ts' },
                }).allow
            ).toBe(false)
        }
    })

    test('denies disallowed Antigravity, MCP, and unknown tools with role-specific reason', () => {
        if (fixture === null) throw new Error('missing fixture')
        const state = makeState({ role: 'implementer', fx: fixture })
        const disallowed = [
            'command_status',
            'manage_task',
            'send_command_input',
            'browser_open',
            'search_web',
            'read_url_content',
            'invoke_subagent',
            'define_subagent',
            'run_workflow',
            'schedule',
            'generate_image',
            'delete_knowledge',
            'ask_question',
            'ask_permission',
            'ask_custom_permission',
            'mcp__luca__send_message',
            'mcp__muninn__muninn_remember',
            'completely_unknown_tool',
        ]
        for (const tool_name of disallowed) {
            expect(
                checkAgyToolCall({ state, tool_name, tool_input: {} })
            ).toEqual({
                allow: false,
                reason: `Tool ${tool_name} is not allowed for role implementer.`,
            })
        }
    })
})
