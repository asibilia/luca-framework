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

import { afterEach, describe, expect, test } from 'bun:test'

import {
    AGY_SECRET_PATHS,
    checkAgyToolCall,
    type AgyGuardState,
} from './agy-tool-rules'
import { AgentRoleSchema, type AgentRole } from './role-results'

import { EngineConfigSchema } from '../config/engine-config'
import { guardRoleOf } from '../guards/role-rules'
import { SECRET_PATHS } from '../guards/sandbox-settings'

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
        home_real: overrides.home_real ?? '/Users/me',
        may_edit_tests: overrides.may_edit_tests ?? role === 'test-writer',
        config: overrides.config ?? CONFIG,
    }
}

let temp_dirs: string[] = []

const makeTempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'agy-tool-rules-'))
    temp_dirs.push(dir)
    return dir
}

afterEach(() => {
    for (const dir of temp_dirs) {
        rmSync(dir, { recursive: true, force: true })
    }
    temp_dirs = []
})

describe('AC1: AGY_SECRET_PATHS and symlink-aware path resolution', () => {
    test('AGY_SECRET_PATHS includes every SECRET_PATHS entry plus .gemini', () => {
        for (const entry of SECRET_PATHS) {
            expect(AGY_SECRET_PATHS).toContain(entry)
        }
        expect(AGY_SECRET_PATHS).toContain('.gemini')
    })

    test('resolves symlinks inside the worktree before secret, boundary, and mayWrite checks', () => {
        const root = makeTempDir()
        const worktree = join(root, 'wt')
        const state_dir = join(root, 'state')
        const home = join(root, 'home')
        mkdirSync(join(worktree, 'src'), { recursive: true })
        mkdirSync(state_dir, { recursive: true })
        mkdirSync(join(home, '.ssh'), { recursive: true })
        mkdirSync(join(home, '.gemini'), { recursive: true })
        mkdirSync(join(home, '.ssh2'), { recursive: true })
        mkdirSync(join(root, 'outside'), { recursive: true })
        writeFileSync(join(home, '.ssh', 'id_rsa'), 'secret')
        writeFileSync(join(home, '.gemini', 'oauth.json'), 'secret')
        writeFileSync(join(home, '.ssh2', 'note.txt'), 'not-secret')
        writeFileSync(join(root, 'outside', 'leak.txt'), 'outside')
        writeFileSync(join(worktree, 'src', 'a.test.ts'), 'test')
        writeFileSync(join(worktree, 'bun.lock'), 'lock')

        symlinkSync(join(home, '.ssh'), join(worktree, 'link_ssh'))
        symlinkSync(join(home, '.gemini'), join(worktree, 'link_gemini'))
        symlinkSync(
            join(home, '.ssh', 'missing_key'),
            join(worktree, 'dangling_ssh')
        )
        symlinkSync(
            join(home, '.ssh2', 'note.txt'),
            join(worktree, 'link_ssh2')
        )
        symlinkSync(
            join(root, 'outside', 'leak.txt'),
            join(worktree, 'link_out')
        )
        symlinkSync(
            join(worktree, 'src', 'a.test.ts'),
            join(worktree, 'alias.ts')
        )
        symlinkSync(
            join(worktree, 'bun.lock'),
            join(worktree, 'lock_alias.txt')
        )
        symlinkSync(join(worktree, 'loop_b'), join(worktree, 'loop_a'))
        symlinkSync(join(worktree, 'loop_a'), join(worktree, 'loop_b'))

        // Pass un-realpathed paths to verify `/tmp` vs `/private/tmp` normalization.
        const state = makeState({
            role: 'implementer',
            may_edit_tests: false,
            worktree_real: worktree,
            state_dir_real: state_dir,
            home_real: home,
        })

        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'link_ssh/id_rsa' },
            })
        ).toEqual({
            allow: false,
            reason: 'Reading secret files is not allowed.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'link_gemini/new_dir/token.json' },
            })
        ).toEqual({
            allow: false,
            reason: 'Reading secret files is not allowed.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'dangling_ssh' },
            })
        ).toEqual({
            allow: false,
            reason: 'Writing secret files is not allowed.',
        })
        // `.ssh2` must NOT falsely match `.ssh` as a secret path.
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'link_ssh2' },
            })
        ).toEqual({
            allow: false,
            reason: 'link_ssh2 is outside your worktree.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'link_out' },
            })
        ).toEqual({
            allow: false,
            reason: 'link_out is outside your worktree.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'loop_a' },
            })
        ).toEqual({
            allow: false,
            reason: 'loop_a is outside your worktree.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'alias.ts' },
            })
        ).toEqual({
            allow: false,
            reason: 'A implementer may not write src/a.test.ts.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'lock_alias.txt' },
            })
        ).toEqual({
            allow: false,
            reason: 'A implementer may not write bun.lock.',
        })
        // Sanity check that realpathSync worktree_real works identically.
        expect(
            checkAgyToolCall({
                state: { ...state, worktree_real: realpathSync(worktree) },
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'src/a.test.ts' },
            })
        ).toEqual({ allow: true })
    })

    test('blocks <symlink>/.. traversal, intermediate dangling symlinks, multi-segment targets, and symlinked secret roots', () => {
        const root = makeTempDir()
        const worktree = join(root, 'wt')
        const state_dir = join(root, 'state')
        const home = join(root, 'home')
        const outside_dir = join(root, 'outside', 'dir')
        mkdirSync(join(worktree, 'src'), { recursive: true })
        mkdirSync(join(worktree, '.git'), { recursive: true })
        mkdirSync(join(worktree, 'deep', 'sub'), { recursive: true })
        mkdirSync(join(worktree, 'linked_claude_dir'), { recursive: true })
        mkdirSync(state_dir, { recursive: true })
        mkdirSync(join(home, '.ssh'), { recursive: true })
        mkdirSync(join(home, '.gemini', 'sub'), { recursive: true })
        mkdirSync(outside_dir, { recursive: true })
        writeFileSync(join(home, '.ssh', 'id_rsa'), 'secret')
        writeFileSync(join(root, 'outside', 'outside.txt'), 'outside')
        writeFileSync(join(worktree, 'linked_claude_dir', 'token.json'), 'sec')

        symlinkSync(join(home, '.ssh'), join(worktree, 'link_ssh'))
        symlinkSync(outside_dir, join(worktree, 'link_out'))
        symlinkSync(join(home, '.gemini', 'sub'), join(worktree, 'sub_gem'))
        symlinkSync(
            '../pwned_cred.json',
            join(home, '.gemini', 'sub', 'dangling_rel')
        )
        symlinkSync(
            '../new_secret_dir',
            join(home, '.gemini', 'sub', 'dangling_dir')
        )
        symlinkSync(outside_dir, join(worktree, 'sub_out'))
        symlinkSync('../pwned_outside.txt', join(outside_dir, 'dangling_rel'))
        symlinkSync(
            join(worktree, 'src'),
            join(worktree, 'deep', 'sub', 'link_to_src')
        )
        symlinkSync('../.git/new_hook', join(worktree, 'src', 'dangling_git'))
        symlinkSync(outside_dir, join(worktree, 'sub_sym'))
        symlinkSync('sub_sym/../outside.txt', join(worktree, 'tricky'))
        symlinkSync(join(worktree, 'linked_claude_dir'), join(home, '.claude'))

        const state = makeState({
            role: 'implementer',
            may_edit_tests: false,
            worktree_real: worktree,
            state_dir_real: state_dir,
            home_real: home,
        })

        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'link_ssh/../.ssh/id_rsa' },
            })
        ).toEqual({
            allow: false,
            reason: 'Reading secret files is not allowed.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'link_ssh/../.ssh/id_rsa' },
            })
        ).toEqual({
            allow: false,
            reason: 'Writing secret files is not allowed.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'link_out/../outside.txt' },
            })
        ).toEqual({
            allow: false,
            reason: 'link_out/../outside.txt is outside your worktree.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'link_out/../outside.txt' },
            })
        ).toEqual({
            allow: false,
            reason: 'link_out/../outside.txt is outside your worktree.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'sub_gem/dangling_rel' },
            })
        ).toEqual({
            allow: false,
            reason: 'Writing secret files is not allowed.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'sub_gem/dangling_dir/token.json' },
            })
        ).toEqual({
            allow: false,
            reason: 'Reading secret files is not allowed.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'sub_out/dangling_rel' },
            })
        ).toEqual({
            allow: false,
            reason: 'sub_out/dangling_rel is outside your worktree.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'deep/sub/link_to_src/dangling_git' },
            })
        ).toEqual({
            allow: false,
            reason: 'A implementer may not write .git/new_hook.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'tricky' },
            })
        ).toEqual({
            allow: false,
            reason: 'tricky is outside your worktree.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'tricky' },
            })
        ).toEqual({
            allow: false,
            reason: 'tricky is outside your worktree.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: {
                    AbsolutePath: join(home, '.claude', 'token.json'),
                },
            })
        ).toEqual({
            allow: false,
            reason: 'Reading secret files is not allowed.',
        })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'linked_claude_dir/token.json' },
            })
        ).toEqual({
            allow: false,
            reason: 'Reading secret files is not allowed.',
        })
        // Synthetic non-existent paths with `..` stay allowed inside worktree.
        expect(
            checkAgyToolCall({
                state: makeState({ role: 'implementer' }),
                tool_name: 'view_file',
                tool_input: { AbsolutePath: 'src/../src/app.ts' },
            })
        ).toEqual({ allow: true })
    })
})

describe('AC2: finish, secret-path messages, state_dir_real, and worktree boundary', () => {
    test('allows finish for every agent role', () => {
        for (const role of AgentRoleSchema.options) {
            expect(
                checkAgyToolCall({
                    state: makeState({ role }),
                    tool_name: 'finish',
                    tool_input: {},
                })
            ).toEqual({ allow: true })
        }
    })

    test('denies reads and writes under every AGY_SECRET_PATHS entry with distinct reasons', () => {
        const state = makeState({ role: 'implementer' })
        for (const secret of AGY_SECRET_PATHS) {
            const target = join(state.home_real, secret, 'cred.json')
            expect(
                checkAgyToolCall({
                    state,
                    tool_name: 'view_file',
                    tool_input: { AbsolutePath: target },
                })
            ).toEqual({
                allow: false,
                reason: 'Reading secret files is not allowed.',
            })
            expect(
                checkAgyToolCall({
                    state,
                    tool_name: 'write_to_file',
                    tool_input: { TargetFile: target },
                })
            ).toEqual({
                allow: false,
                reason: 'Writing secret files is not allowed.',
            })
            expect(
                checkAgyToolCall({
                    state,
                    tool_name: 'read_file',
                    tool_input: { Path: target },
                })
            ).toEqual({
                allow: false,
                reason: 'Reading secret files is not allowed.',
            })
            for (const tool of ['write_file', 'edit_file'] as const) {
                expect(
                    checkAgyToolCall({
                        state,
                        tool_name: tool,
                        tool_input: { Path: target },
                    })
                ).toEqual({
                    allow: false,
                    reason: 'Writing secret files is not allowed.',
                })
            }
        }
    })

    test('denies state_dir_real and outside-worktree paths with "<rawPath> is outside your worktree."', () => {
        const state = makeState({ role: 'implementer' })
        const inside_state_wt = makeState({
            role: 'implementer',
            state_dir_real: join(state.worktree_real, '.hook-state'),
        })
        const outside_cases: [
            AgyGuardState,
            string,
            Record<string, unknown>,
            string,
        ][] = [
            [
                state,
                'view_file',
                { AbsolutePath: join(state.state_dir_real, 'state.json') },
                join(state.state_dir_real, 'state.json'),
            ],
            [
                inside_state_wt,
                'write_to_file',
                { TargetFile: '.hook-state/denials.jsonl' },
                '.hook-state/denials.jsonl',
            ],
            [
                state,
                'view_file',
                { Path: '../sibling/a.ts' },
                '../sibling/a.ts',
            ],
            [state, 'grep_search', { SearchPath: '/etc' }, '/etc'],
            [
                state,
                'find_by_name',
                { SearchDirectory: '/tmp/elsewhere' },
                '/tmp/elsewhere',
            ],
            [state, 'list_dir', { DirectoryPath: '/var/log' }, '/var/log'],
            [
                state,
                'replace_file_content',
                { TargetFile: '/etc/hosts' },
                '/etc/hosts',
            ],
            [state, 'read_file', { Path: '/etc/hosts' }, '/etc/hosts'],
            [state, 'write_file', { Path: '../escape.ts' }, '../escape.ts'],
            [state, 'edit_file', { Path: '../escape.ts' }, '../escape.ts'],
        ]
        for (const [s, tool_name, tool_input, raw_path] of outside_cases) {
            expect(
                checkAgyToolCall({ state: s, tool_name, tool_input })
            ).toEqual({
                allow: false,
                reason: `${raw_path} is outside your worktree.`,
            })
        }
    })
})
