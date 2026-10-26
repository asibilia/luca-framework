import { describe, expect, test } from 'bun:test'

import { checkToolCall, permissionRules, type GuardRole } from './role-rules'
import { CONFIG, WORKTREE, usual } from './role-rules-helpers'

import { EngineConfigSchema } from '../config/engine-config'
import type { EngineConfig } from '../config/engine-config'

/** Seam 3: the guard rules for the config's check commands. Pure: no files, no git. */

describe('check commands with shell syntax', () => {
    // Checked against the live CLI (2.1.280, SDK 0.3.273) for #384: under
    // `dontAsk`, an exact `Bash(<command>)` rule runs a command with a
    // redirect or `&&`, and the hook lets the exact copy through.
    const config: EngineConfig = {
        ...CONFIG,
        checks: {
            test: 'bun test > test.log 2>&1',
            types: 'bun build src/index.ts --target=bun > /dev/null',
            lint: 'bun run lint && bun run format:check',
        },
    }
    const run = (role: GuardRole, command: string) =>
        checkToolCall({
            role,
            may_edit_tests: usual(role),
            tool_name: 'Bash',
            tool_input: { command },
            worktree: WORKTREE,
            config,
        }).allow

    test('a writer may run the exact commands, and nothing made from them', () => {
        for (const role of ['test-writer', 'implementer'] as const) {
            expect(run(role, 'bun test > test.log 2>&1')).toBe(true)
            expect(
                run(role, 'bun build src/index.ts --target=bun > /dev/null')
            ).toBe(true)
            expect(run(role, 'bun run lint && bun run format:check')).toBe(true)
            expect(run(role, 'bun test > other.log 2>&1')).toBe(false)
            expect(run(role, 'bun test src > test.log 2>&1')).toBe(false)
            expect(
                run(role, 'bun build src/index.ts --target=bun > src/sum.ts')
            ).toBe(false)
            expect(run(role, 'bun run lint && rm src/sum.ts')).toBe(false)
        }
        expect(run('reviewer', 'bun test > test.log 2>&1')).toBe(false)
    })

    test('each gets one exact permission rule, with no wildcard after it', () => {
        const { allowed } = permissionRules({
            role: 'implementer',
            may_edit_tests: false,
            config,
        })
        expect(allowed).toContain('Bash(bun test > test.log 2>&1)')
        expect(allowed).not.toContain('Bash(bun test > test.log 2>&1 *)')
        expect(allowed).toContain(
            'Bash(bun build src/index.ts --target=bun > /dev/null)'
        )
        expect(allowed).toContain('Bash(bun run lint && bun run format:check)')
    })
})

describe('several test commands', () => {
    // tmnb's shape (#428): bun's tests, read per test, and a vitest file
    // run as a pass-or-fail gate.
    const config = EngineConfigSchema.parse({
        ...CONFIG,
        checks: {
            ...CONFIG.checks,
            test: [
                'bun test src',
                { run: 'bun run test:workers', results: 'pass_fail' },
                'bun test e2e',
            ],
        },
    })
    const run = (role: GuardRole, command: string) =>
        checkToolCall({
            role,
            may_edit_tests: usual(role),
            tool_name: 'Bash',
            tool_input: { command },
            worktree: WORKTREE,
            config,
        }).allow

    test('a writer may run each configured test command exactly', () => {
        for (const role of ['test-writer', 'implementer'] as const) {
            expect(run(role, 'bun test src')).toBe(true)
            expect(run(role, 'bun run test:workers')).toBe(true)
            expect(run(role, 'bun test e2e')).toBe(true)
        }
        expect(run('reviewer', 'bun run test:workers')).toBe(false)
        expect(run('reviewer', 'bun test src')).toBe(false)
    })

    test('bun test commands may take extra arguments; pass_fail ones may not', () => {
        for (const role of ['test-writer', 'implementer'] as const) {
            expect(run(role, 'bun test src src/sum.test.ts')).toBe(true)
            expect(run(role, 'bun test e2e --timeout 20000')).toBe(true)
            expect(run(role, 'bun run test:workers --watch')).toBe(false)
            expect(run(role, 'bun run test:workers src/x.test.ts')).toBe(false)
            // An install through a test command is still the engine's.
            expect(run(role, 'bun test src --install=force')).toBe(false)
        }
    })

    test('each test command gets its permission rule, with a wildcard only after a bun one', () => {
        const { allowed } = permissionRules({
            role: 'implementer',
            may_edit_tests: false,
            config,
        })
        expect(allowed).toContain('Bash(bun test src)')
        expect(allowed).toContain('Bash(bun test src *)')
        expect(allowed).toContain('Bash(bun test e2e)')
        expect(allowed).toContain('Bash(bun test e2e *)')
        expect(allowed).toContain('Bash(bun run test:workers)')
        expect(allowed).not.toContain('Bash(bun run test:workers *)')
    })
})

describe('the slow test command (#563)', () => {
    const config = EngineConfigSchema.parse({
        ...CONFIG,
        checks: {
            ...CONFIG.checks,
            test: 'bun test src',
            slow_test: 'bun test .e2e.test',
        },
    })
    const run = (role: GuardRole, command: string) =>
        checkToolCall({
            role,
            may_edit_tests: usual(role),
            tool_name: 'Bash',
            tool_input: { command },
            worktree: WORKTREE,
            config,
        }).allow

    test('a writer may run the slow command too, with extra arguments (#563)', () => {
        for (const role of ['test-writer', 'implementer'] as const) {
            expect(run(role, 'bun test .e2e.test')).toBe(true)
            expect(run(role, 'bun test .e2e.test ./src/run.e2e.test.ts')).toBe(
                true
            )
        }
        expect(run('reviewer', 'bun test .e2e.test')).toBe(false)
    })

    test('the slow command gets its permission rule, with a wildcard (#563)', () => {
        const { allowed } = permissionRules({
            role: 'implementer',
            may_edit_tests: false,
            config,
        })
        expect(allowed).toContain('Bash(bun test .e2e.test)')
        expect(allowed).toContain('Bash(bun test .e2e.test *)')
    })
})

describe('a junit test command (#672)', () => {
    // movie-rankings' shape (#668): swift test behind a package script.
    const config = EngineConfigSchema.parse({
        ...CONFIG,
        checks: {
            ...CONFIG.checks,
            test: [
                {
                    run: 'bun run ios:test:core',
                    results: 'junit',
                    junit_path: [
                        'packages/ios/.derived/junit/core.xml',
                        'packages/ios/.derived/junit/core-swift-testing.xml',
                    ],
                },
            ],
        },
    })
    const decide = (role: GuardRole, command: string) =>
        checkToolCall({
            role,
            may_edit_tests: usual(role),
            tool_name: 'Bash',
            tool_input: { command },
            worktree: WORKTREE,
            config,
        })

    test('a writer may run it with extra options, such as --filter', () => {
        for (const role of ['test-writer', 'implementer'] as const) {
            expect(decide(role, 'bun run ios:test:core').allow).toBe(true)
            expect(
                decide(role, 'bun run ios:test:core --filter RankingTests')
                    .allow
            ).toBe(true)
        }
        expect(
            decide('reviewer', 'bun run ios:test:core --filter RankingTests')
                .allow
        ).toBe(false)
    })

    test("the guard's shell help lists it with [args]", () => {
        const decision = decide('implementer', 'curl https://example.com')
        expect(decision.allow).toBe(false)
        expect(decision.allow ? '' : decision.reason).toContain(
            'bun run ios:test:core [args]'
        )
    })
})
