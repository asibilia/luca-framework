import {
    mkdirSync,
    mkdtempSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { AGY_SECRET_PATHS, checkAgyToolCall } from './agy-tool-rules'
import type { AgentRole } from './role-results'

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
    test_setup_files: ['src/test-setup.ts'],
    rule_files: [],
})

type Fixture = {
    root: string
    worktree_real: string
    state_dir_real: string
    home_real: string
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

    mkdirSync(join(worktree_real, 'src'), { recursive: true })
    mkdirSync(state_dir_real, { recursive: true })
    mkdirSync(home_real, { recursive: true })

    writeFileSync(join(worktree_real, 'src', 'app.ts'), 'export const x = 1\n')
    writeFileSync(join(worktree_real, 'src', 'app.test.ts'), '')

    return { root, worktree_real, state_dir_real, home_real }
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

describe('Tier 1 — AGY_SECRET_PATHS and allowed agy tool normalization', () => {
    test('AGY_SECRET_PATHS includes every SECRET_PATHS entry plus .gemini', () => {
        for (const entry of SECRET_PATHS) {
            expect(AGY_SECRET_PATHS).toContain(entry)
        }
        expect(AGY_SECRET_PATHS).toContain('.gemini')
    })

    test('finish tool is allowed for every role', () => {
        if (fixture === null) throw new Error('missing fixture')
        for (const role of [
            'test-writer',
            'implementer',
            'ticket-reviewer',
            'security-lens',
            'learner',
            'story-writer',
        ] as const) {
            const state = makeState({ role, fx: fixture })
            expect(
                checkAgyToolCall({ state, tool_name: 'finish', tool_input: {} })
            ).toEqual({ allow: true })
        }
    })

    test('all 4 read/search tools inside worktree_real are allowed', () => {
        if (fixture === null) throw new Error('missing fixture')
        const state = makeState({ role: 'learner', fx: fixture })
        const absFile = join(fixture.worktree_real, 'src', 'app.ts')

        expect(
            checkAgyToolCall({
                state,
                tool_name: 'view_file',
                tool_input: { AbsolutePath: absFile },
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
                tool_name: 'grep_search',
                tool_input: { Query: 'export' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'grep_search',
                tool_input: { SearchPath: join(fixture.worktree_real, 'src') },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'find_by_name',
                tool_input: { Pattern: '*.ts' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'find_by_name',
                tool_input: { SearchDirectory: 'src', Pattern: '*.ts' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'list_dir',
                tool_input: {},
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state,
                tool_name: 'list_dir',
                tool_input: { DirectoryPath: 'src' },
            })
        ).toEqual({ allow: true })
    })

    test('all 5 write/edit tools enforce role write permissions including new non-existent files', () => {
        if (fixture === null) throw new Error('missing fixture')
        const tw = makeState({
            role: 'test-writer',
            may_edit_tests: true,
            fx: fixture,
        })
        expect(
            checkAgyToolCall({
                state: tw,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'src/new.test.ts' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state: tw,
                tool_name: 'replace_file_content',
                tool_input: { TargetFile: 'src/app.test.ts' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state: tw,
                tool_name: 'multi_replace_file_content',
                tool_input: { TargetFile: 'src/app.test.ts' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state: tw,
                tool_name: 'sed_file',
                tool_input: { Path: 'src/app.test.ts' },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state: tw,
                tool_name: 'notebook_edit',
                tool_input: { Path: 'src/nb.test.ts' },
            })
        ).toEqual({ allow: true })

        const impl = makeState({
            role: 'implementer',
            may_edit_tests: false,
            fx: fixture,
        })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'write_to_file',
                tool_input: { TargetFile: 'src/new-feature.ts' },
            })
        ).toEqual({ allow: true })

        const refactorImpl = makeState({
            role: 'implementer',
            may_edit_tests: true,
            fx: fixture,
        })
        expect(
            checkAgyToolCall({
                state: refactorImpl,
                tool_name: 'replace_file_content',
                tool_input: { TargetFile: 'src/app.test.ts' },
            })
        ).toEqual({ allow: true })
    })

    test('run_command allows configured checks and read-only commands for writers', () => {
        if (fixture === null) throw new Error('missing fixture')
        const impl = makeState({
            role: 'implementer',
            may_edit_tests: false,
            fx: fixture,
        })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'run_command',
                tool_input: {
                    CommandLine: 'bun test',
                    IsDaemon: false,
                    BypassSandbox: false,
                },
            })
        ).toEqual({ allow: true })
        expect(
            checkAgyToolCall({
                state: impl,
                tool_name: 'run_command',
                tool_input: { CommandLine: 'git status' },
            })
        ).toEqual({ allow: true })
    })

    test('run_command allows read-only commands for ticket-reviewer and lens roles', () => {
        if (fixture === null) throw new Error('missing fixture')
        for (const role of ['ticket-reviewer', 'architecture-lens'] as const) {
            const state = makeState({ role, fx: fixture })
            expect(
                checkAgyToolCall({
                    state,
                    tool_name: 'run_command',
                    tool_input: { CommandLine: 'git diff' },
                })
            ).toEqual({ allow: true })
            expect(
                checkAgyToolCall({
                    state,
                    tool_name: 'run_command',
                    tool_input: { CommandLine: 'ls src' },
                })
            ).toEqual({ allow: true })
        }
    })
})
