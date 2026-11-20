import { describe, expect, test } from 'bun:test'

import { checkAgyToolCall, type AgyGuardState } from './agy-tool-rules'
import type { AgentRole } from './role-results'

import { EngineConfigSchema } from '../config/engine-config'
import { guardRoleOf, LOCKFILES } from '../guards/role-rules'

const CONFIG = EngineConfigSchema.parse({
    checks: {
        test: 'bun test',
        types: 'bunx --bun tsc --noEmit',
        lint: 'bun run lint',
    },
    test_file_patterns: ['src/**/*.test.ts'],
    test_helper_patterns: ['src/testing/**'],
    test_setup_files: ['src/test-setup.ts'],
    feature_map: 'docs/feature-map.md',
})

const makeState = (
    overrides: Partial<AgyGuardState> & { role?: AgentRole } = {}
): AgyGuardState => {
    const role = overrides.role ?? 'implementer'
    return {
        role,
        guard_role: overrides.guard_role ?? guardRoleOf({ role }),
        worktree_real: overrides.worktree_real ?? '/runs/run-1/tickets/11',
        state_dir_real: overrides.state_dir_real ?? '/runs/run-1/state',
        home_real: overrides.home_real ?? '/Users/tester',
        may_edit_tests: overrides.may_edit_tests ?? role === 'test-writer',
        config: overrides.config ?? CONFIG,
    }
}

describe('AC3: normalization of read/search, write, and run_command tools onto checkToolCall', () => {
    test('normalizes view_file and optional-path search tools', () => {
        const state = makeState({ role: 'learner' })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'src/app.ts' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { Path: 'src/app.ts' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: '' },
            })
        ).toEqual({ allow: false, reason: 'view_file needs a path.' })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'grep_search',
                tool_input: { Query: 'hello' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'find_by_name',
                tool_input: {},
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'list_dir',
                tool_input: { DirectoryPath: null },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'grep_search',
                tool_input: { SearchPath: '' },
            })
        ).toEqual({
            allow: false,
            reason: 'grep_search got an input of the wrong shape.',
        })
    })

    test('normalizes all five write tools with guard_role, may_edit_tests, and EngineConfig rules', () => {
        const impl = makeState({ role: 'implementer', may_edit_tests: false })
        const refactor_impl = makeState({
            role: 'implementer',
            may_edit_tests: true,
        })
        const tw = makeState({ role: 'test-writer', may_edit_tests: true })
        const reviewer = makeState({ role: 'security-lens' })

        const target_file_tools = [
            'write_to_file',
            'replace_file_content',
            'multi_replace_file_content',
        ] as const
        for (const tool of target_file_tools) {
            expect(
                checkAgyToolCall({
                    state: impl,
                    tool_name: tool,
                    tool_input: { TargetFile: 'src/app.ts' },
                })
            ).toEqual({ allow: true })
            expect(
                checkAgyToolCall({
                    state: impl,
                    tool_name: tool,
                    tool_input: { TargetFile: 'src/app.test.ts' },
                })
            ).toEqual({
                allow: false,
                reason: 'A implementer may not write src/app.test.ts.',
            })
            expect(
                checkAgyToolCall({
                    state: impl,
                    tool_name: tool,
                    tool_input: { Path: 'src/app.ts' },
                })
            ).toEqual({ allow: false, reason: `${tool} needs a file path.` })
        }

        for (const tool of ['sed_file', 'notebook_edit'] as const) {
            expect(
                checkAgyToolCall({
                    state: refactor_impl,
                    tool_name: tool,
                    tool_input: { Path: 'src/app.test.ts' },
                })
            ).toEqual({ allow: true })
            expect(
                checkAgyToolCall({
                    state: tw,
                    tool_name: tool,
                    tool_input: { Path: 'src/app.ts' },
                })
            ).toEqual({
                allow: false,
                reason: 'A test-writer may not write src/app.ts.',
            })
            expect(
                checkAgyToolCall({
                    state: impl,
                    tool_name: tool,
                    tool_input: { TargetFile: 'src/app.ts' },
                })
            ).toEqual({ allow: false, reason: `${tool} needs a file path.` })
        }

        // Test-writer permissions: test file, helper pattern, feature map; blocked on setup/lockfiles/node_modules.
        expect(
            checkAgyToolCall({
                state: tw,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'src/testing/mock.ts' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state: tw,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'docs/feature-map.md' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'src/test-setup.ts' },
            })
        ).toEqual({
            allow: false,
            reason: 'A implementer may not write src/test-setup.ts.',
        })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'node_modules/pkg/index.js' },
            })
        ).toEqual({
            allow: false,
            reason: 'A implementer may not write node_modules/pkg/index.js.',
        })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: LOCKFILES[0] },
            })
        ).toEqual({
            allow: false,
            reason: `A implementer may not write ${LOCKFILES[0]}.`,
        })
        expect(
            checkAgyToolCall({
                state: reviewer,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'src/app.ts' },
            })
        ).toEqual({
            allow: false,
            reason: 'A reviewer may not write src/app.ts.',
        })
    })

    test('normalizes run_command onto Bash checkToolCall rules', () => {
        const impl = makeState({ role: 'implementer' })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'run_command',
                tool_input: { CommandLine: 'bun test' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'run_command',
                tool_input: { CommandLine: 'git status' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'run_command',
                tool_input: { CommandLine: 'bun install' },
            }).allow
        ).toBe(false)
    })
})

describe('AC4: run_command flags, learner/story-writer shell denial, and disallowed tools', () => {
    test('denies run_command flags, missing CommandLine, and learner/story-writer shell calls', () => {
        const impl = makeState({ role: 'implementer' })
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

        for (const role of ['learner', 'story-writer'] as const) {
            expect(
                checkAgyToolCall({
                    state: makeState({ role }),
                    tool_name: 'run_command',
                    tool_input: { CommandLine: 'git status' },
                })
            ).toEqual({ allow: false, reason: 'A learner may not use Bash.' })
        }
    })

    test('denies every disallowed tool with "Tool <name> is not allowed for role <role>."', () => {
        const disallowed = [
            'command_status',
            'manage_task',
            'send_command_input',
            'browser_navigate',
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
        ]
        const state = makeState({ role: 'story-writer' })
        for (const tool_name of disallowed) {
            expect(
                checkAgyToolCall({
                    state,
                    tool_name,
                    tool_input: {},
                })
            ).toEqual({
                allow: false,
                reason: `Tool ${tool_name} is not allowed for role story-writer.`,
            })
        }
    })
})
