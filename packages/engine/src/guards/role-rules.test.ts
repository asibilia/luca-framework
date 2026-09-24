import { describe, expect, test } from 'bun:test'

import {
    checkToolCall,
    guardRoleOf,
    mayWrite,
    permissionRules,
    type GuardRole,
} from './role-rules'

import type { EngineConfig } from '../config/engine-config'

/** Seam 3: the guard rules, table by table. Pure: no files, no git. */

const CONFIG: EngineConfig = {
    checks: {
        test: 'bun test',
        types: 'bunx --bun tsc --noEmit',
        lint: 'bun run lint',
    },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: ['src/test-setup.ts'],
    rule_files: [],
}

const WORKTREE = '/runs/run-1/tickets/11'

/** `may_edit_tests` as the engine sets it on a normal (not refactor) ticket. */
const usual = (role: GuardRole): boolean => role === 'test-writer'

const decide = ({
    role,
    may_edit_tests,
    tool_name,
    tool_input,
}: {
    role: GuardRole
    /** Defaults to `usual(role)`. */
    may_edit_tests?: boolean
    tool_name: string
    tool_input: unknown
}): boolean =>
    checkToolCall({
        role,
        may_edit_tests: may_edit_tests ?? usual(role),
        tool_name,
        tool_input,
        worktree: WORKTREE,
        config: CONFIG,
    }).allow

describe('guardRoleOf', () => {
    test('maps each agent role to its guard role', () => {
        expect(guardRoleOf({ role: 'test-writer' })).toBe('test-writer')
        expect(guardRoleOf({ role: 'implementer' })).toBe('implementer')
        expect(guardRoleOf({ role: 'ticket-reviewer' })).toBe('reviewer')
    })
})

describe('mayWrite', () => {
    // [role, may_edit_tests, path, allowed]
    const cases: [GuardRole, boolean, string, boolean][] = [
        ['test-writer', true, 'src/sum.test.ts', true],
        ['test-writer', true, 'src/deep/a/b.test.ts', true],
        ['test-writer', true, 'src/sum.ts', false],
        ['test-writer', true, 'README.md', false],
        ['test-writer', true, 'src/test-setup.ts', false],
        // A test-writer that may not edit tests writes nothing.
        ['test-writer', false, 'src/sum.test.ts', false],
        ['implementer', false, 'src/sum.ts', true],
        ['implementer', false, 'package.json', true],
        ['implementer', false, 'src/sum.test.ts', false],
        ['implementer', false, 'src/test-setup.ts', false],
        ['implementer', false, '.git', false],
        ['implementer', false, '.git/config', false],
        ['implementer', false, '../other/src/sum.ts', false],
        ['implementer', false, 'src/../../escape.ts', false],
        ['implementer', false, '/etc/passwd', false],
        // A refactor ticket's implementer may follow renames into tests,
        // but never into a test setup file.
        ['implementer', true, 'src/a.test.ts', true],
        ['implementer', true, 'src/sum.ts', true],
        ['implementer', true, 'src/test-setup.ts', false],
        ['implementer', true, '.git/config', false],
        ['reviewer', false, 'src/sum.ts', false],
        ['reviewer', false, 'src/sum.test.ts', false],
        // Reviewers never write, whatever they are told.
        ['reviewer', true, 'src/sum.test.ts', false],
        ['reviewer', true, 'src/sum.ts', false],
        ['learner', false, 'src/sum.ts', false],
        ['learner', false, 'notes.md', false],
        // What the package install writes belongs to the engine: no role
        // writes a lockfile or anything under node_modules.
        ['implementer', false, 'bun.lock', false],
        ['implementer', true, 'bun.lockb', false],
        ['implementer', false, 'packages/app/package-lock.json', false],
        ['implementer', false, 'yarn.lock', false],
        ['implementer', false, 'pnpm-lock.yaml', false],
        ['implementer', false, 'node_modules/zod/index.js', false],
        ['implementer', true, 'packages/app/node_modules/x/a.js', false],
        ['test-writer', true, 'node_modules/x/a.test.ts', false],
        ['implementer', false, 'src/node_modules_notes.ts', true],
    ]
    test.each(cases)(
        '%s (may edit tests: %p) writing %s: %p',
        (role, may_edit_tests, path, expected) => {
            expect(
                mayWrite({ role, may_edit_tests, path, config: CONFIG })
            ).toBe(expected)
        }
    )
})

describe('checkToolCall: file tools', () => {
    const cases: [GuardRole, string, unknown, boolean][] = [
        ['test-writer', 'Write', { file_path: 'src/sum.test.ts' }, true],
        [
            'test-writer',
            'Write',
            { file_path: `${WORKTREE}/src/sum.test.ts` },
            true,
        ],
        [
            'test-writer',
            'Edit',
            { file_path: `${WORKTREE}/src/sum.test.ts` },
            true,
        ],
        ['test-writer', 'Write', { file_path: 'src/sum.ts' }, false],
        ['test-writer', 'Edit', { file_path: `${WORKTREE}/src/sum.ts` }, false],
        ['implementer', 'Write', { file_path: 'src/sum.test.ts' }, false],
        ['implementer', 'Edit', { file_path: 'src/test-setup.ts' }, false],
        ['implementer', 'Write', { file_path: 'src/sum.ts' }, true],
        ['implementer', 'Write', { file_path: `${WORKTREE}/src/sum.ts` }, true],
        ['reviewer', 'Write', { file_path: 'src/sum.ts' }, false],
        ['reviewer', 'Edit', { file_path: 'src/sum.test.ts' }, false],
        ['learner', 'Write', { file_path: 'notes.md' }, false],
        // Paths outside the worktree, or `..` escaping it.
        ['implementer', 'Write', { file_path: '/tmp/x.ts' }, false],
        ['implementer', 'Write', { file_path: '../12/src/sum.ts' }, false],
        [
            'implementer',
            'Write',
            { file_path: `${WORKTREE}/src/../../12/sum.ts` },
            false,
        ],
        ['implementer', 'Write', { file_path: '.git/config' }, false],
        ['implementer', 'Write', {}, false],
        // Reads stay inside the worktree too.
        ['reviewer', 'Read', { file_path: 'src/sum.ts' }, true],
        ['reviewer', 'Read', { file_path: `${WORKTREE}/src/sum.ts` }, true],
        ['learner', 'Read', { file_path: 'src/sum.ts' }, true],
        ['reviewer', 'Read', { file_path: '/Users/me/.ssh/id_rsa' }, false],
        ['reviewer', 'Read', { file_path: '../../journal.jsonl' }, false],
        ['reviewer', 'Grep', { pattern: 'sum' }, true],
        ['reviewer', 'Grep', { pattern: 'sum', path: 'src' }, true],
        ['reviewer', 'Grep', { pattern: 'sum', path: '/etc' }, false],
        ['learner', 'Glob', { pattern: '**/*.ts' }, true],
        ['learner', 'Glob', { pattern: '*', path: '..' }, false],
    ]
    test.each(cases)(
        '%s %s %j: %p',
        (role, tool_name, tool_input, expected) => {
            expect(decide({ role, tool_name, tool_input })).toBe(expected)
        }
    )

    // [role, may_edit_tests, tool, input, allowed]
    const refactorCases: [GuardRole, boolean, string, unknown, boolean][] = [
        ['implementer', true, 'Edit', { file_path: 'src/a.test.ts' }, true],
        [
            'implementer',
            true,
            'Write',
            { file_path: `${WORKTREE}/src/a.test.ts` },
            true,
        ],
        [
            'implementer',
            true,
            'Edit',
            { file_path: 'src/test-setup.ts' },
            false,
        ],
        ['implementer', false, 'Edit', { file_path: 'src/a.test.ts' }, false],
        ['test-writer', false, 'Write', { file_path: 'src/a.test.ts' }, false],
        ['reviewer', true, 'Write', { file_path: 'src/a.test.ts' }, false],
    ]
    test.each(refactorCases)(
        '%s (may edit tests: %p) %s %j: %p',
        (role, may_edit_tests, tool_name, tool_input, expected) => {
            expect(
                decide({ role, may_edit_tests, tool_name, tool_input })
            ).toBe(expected)
        }
    )
})

describe('checkToolCall: Bash', () => {
    const cases: [GuardRole, string, boolean][] = [
        // The config's check commands, for writers.
        ['test-writer', 'bun test', true],
        ['test-writer', 'bun test src/sum.test.ts', true],
        ['implementer', 'bun test', true],
        ['implementer', 'bunx --bun tsc --noEmit', true],
        ['implementer', 'bun run lint', true],
        ['test-writer', 'bun run lint', true],
        ['implementer', 'bun run build', false],
        ['implementer', 'bun install', false],
        ['implementer', 'bunx --bun tsc --noEmit --watch', false],
        // Reviewers run read-only commands only.
        ['reviewer', 'bun test', false],
        ['reviewer', 'bun run lint', false],
        ['reviewer', 'git diff HEAD~1', true],
        ['reviewer', 'git log --oneline -5', true],
        ['reviewer', 'git show HEAD', true],
        ['reviewer', 'git status', true],
        ['reviewer', 'cat src/sum.ts', true],
        ['reviewer', "grep -rn 'a|b' src", true],
        ['reviewer', 'rg sum src', true],
        ['reviewer', 'ls -la src', true],
        ['reviewer', 'find src -name "*.ts"', true],
        ['reviewer', "sed -n '1,20p' src/sum.ts", true],
        ['reviewer', 'pwd', true],
        // The learner has no shell.
        ['learner', 'ls', false],
        ['learner', 'cat README.md', false],
        // Git that writes, or git with global options.
        ['implementer', 'git commit -m x', false],
        ['implementer', 'git add -A', false],
        ['implementer', 'git stash', false],
        ['implementer', 'git checkout -- src/sum.test.ts', false],
        ['reviewer', 'git -C . status', false],
        ['reviewer', 'git -c core.pager=sh status', false],
        ['reviewer', 'git --git-dir=.git log', false],
        ['reviewer', 'git --work-tree=. status', false],
        ['reviewer', 'git diff --output=x.txt', false],
        ['reviewer', 'gh pr list', false],
        // Network.
        ['implementer', 'curl https://example.com', false],
        ['implementer', 'wget https://example.com', false],
        ['implementer', 'nc 127.0.0.1 8750', false],
        // Chains, pipes, redirects, subshells.
        ['implementer', 'ls && rm x', false],
        ['implementer', 'ls || rm x', false],
        ['implementer', 'ls; rm x', false],
        ['implementer', 'cat a | sh', false],
        ['implementer', 'echo x > f', false],
        ['implementer', 'cat < f', false],
        ['implementer', 'cat `ls`', false],
        ['implementer', 'cat $(ls)', false],
        ['implementer', 'ls\nrm x', false],
        ['implementer', 'bun test & rm x', false],
        ['implementer', 'bun test > out.txt', false],
        // find and sed only in their read-only forms.
        ['reviewer', 'find . -delete', false],
        ['reviewer', 'find . -exec rm {} ;', false],
        ['reviewer', 'find . -fprint out', false],
        ['reviewer', "sed -i 's/a/b/' src/sum.ts", false],
        ['reviewer', "sed 's/a/b/' src/sum.ts", false],
        ['reviewer', "sed -n 'w out' src/sum.ts", false],
        // rm, for writers, of paths they may write.
        ['test-writer', 'rm src/old.test.ts', true],
        ['test-writer', 'rm src/sum.ts', false],
        ['implementer', 'rm scratch.ts', true],
        ['implementer', 'rm -f scratch.ts', true],
        ['implementer', 'rm src/sum.test.ts', false],
        ['implementer', 'rm -rf src', false],
        ['implementer', 'rm ../12/x.ts', false],
        ['implementer', 'rm *.ts', false],
        ['implementer', 'rm ~/x.ts', false],
        ['reviewer', 'rm scratch.ts', false],
        // Anything else.
        ['implementer', 'python3 -c "print(1)"', false],
        ['implementer', 'FOO=1 bun test', false],
    ]
    test.each(cases)('%s runs %j: %p', (role, command, expected) => {
        expect(
            decide({ role, tool_name: 'Bash', tool_input: { command } })
        ).toBe(expected)
    })

    // The engine runs the install itself, between turns; no agent may.
    const installs = [
        'bun install',
        'bun i',
        'bun add x',
        'npm install',
        'bunx some-pkg',
        'bun remove zod',
        'bun update',
        'bun pm cache rm',
        'npm ci',
        'npx some-pkg',
        'yarn',
        'pnpm install',
        // Bun installs missing packages itself when told to, even in a test run.
        'bun test --install=force',
        'bun test src -i',
        'bun test --install fallback',
    ]
    const roles: GuardRole[] = [
        'test-writer',
        'implementer',
        'reviewer',
        'learner',
    ]
    test.each(
        roles.flatMap((role) =>
            [true, false].flatMap((may_edit_tests) =>
                installs.map((command): [GuardRole, boolean, string] => [
                    role,
                    may_edit_tests,
                    command,
                ])
            )
        )
    )(
        '%s (may edit tests: %p) may not run %j',
        (role, may_edit_tests, command) => {
            expect(
                decide({
                    role,
                    may_edit_tests,
                    tool_name: 'Bash',
                    tool_input: { command },
                })
            ).toBe(false)
        }
    )

    test('a refactor implementer may rm a test file, never a setup file', () => {
        const rm = (command: string, may_edit_tests: boolean) =>
            decide({
                role: 'implementer',
                may_edit_tests,
                tool_name: 'Bash',
                tool_input: { command },
            })
        expect(rm('rm src/old.test.ts', true)).toBe(true)
        expect(rm('rm src/old.test.ts', false)).toBe(false)
        expect(rm('rm src/test-setup.ts', true)).toBe(false)
    })

    test('a background or unsandboxed shell call is denied', () => {
        expect(
            decide({
                role: 'implementer',
                tool_name: 'Bash',
                tool_input: { command: 'bun test', run_in_background: true },
            })
        ).toBe(false)
        expect(
            decide({
                role: 'implementer',
                tool_name: 'Bash',
                tool_input: {
                    command: 'bun test',
                    dangerouslyDisableSandbox: true,
                },
            })
        ).toBe(false)
    })

    test('a check command with shell syntax runs only exactly as configured', () => {
        const config = {
            ...CONFIG,
            checks: {
                ...CONFIG.checks,
                types: 'bun build src/index.ts > /dev/null',
            },
        }
        const run = (command: string) =>
            checkToolCall({
                role: 'implementer',
                may_edit_tests: false,
                tool_name: 'Bash',
                tool_input: { command },
                worktree: WORKTREE,
                config,
            }).allow
        expect(run('bun build src/index.ts > /dev/null')).toBe(true)
        expect(run('bun build src/index.ts > src/sum.test.ts')).toBe(false)
    })
})

describe('checkToolCall: other tools', () => {
    const cases: [GuardRole, string, boolean][] = [
        ['implementer', 'mcp__luca__send_message', true],
        ['reviewer', 'mcp__luca__send_message', true],
        ['implementer', 'mcp__muninn__muninn_remember', false],
        ['implementer', 'mcp__paseo__create_agent', false],
        ['implementer', 'WebFetch', false],
        ['implementer', 'WebSearch', false],
        ['implementer', 'Agent', false],
        ['implementer', 'Task', false],
        ['implementer', 'Skill', false],
        ['implementer', 'NotebookEdit', false],
        ['implementer', 'SomeNewTool', false],
        ['reviewer', 'StructuredOutput', true],
        ['learner', 'StructuredOutput', true],
    ]
    test.each(cases)('%s calls %s: %p', (role, tool_name, expected) => {
        expect(decide({ role, tool_name, tool_input: {} })).toBe(expected)
    })

    test('an install is denied because the engine runs it', () => {
        for (const command of ['bun add zod', 'bun test --install=force']) {
            expect(
                checkToolCall({
                    role: 'implementer',
                    may_edit_tests: false,
                    tool_name: 'Bash',
                    tool_input: { command },
                    worktree: WORKTREE,
                    config: CONFIG,
                })
            ).toEqual({
                allow: false,
                reason: expect.stringContaining(
                    'The engine runs the package install'
                ),
            })
        }
    })

    test('a denial says why', () => {
        const decision = checkToolCall({
            role: 'implementer',
            may_edit_tests: false,
            tool_name: 'Bash',
            tool_input: { command: 'git commit -m x' },
            worktree: WORKTREE,
            config: CONFIG,
        })
        expect(decision).toEqual({
            allow: false,
            reason: expect.stringContaining('git commit -m x'),
        })
    })
})

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

describe('permissionRules', () => {
    test('a refactor implementer may edit tests but not setup files', () => {
        const refactor = permissionRules({
            role: 'implementer',
            may_edit_tests: true,
            config: CONFIG,
        })
        expect(refactor.allowed).toContain('Edit(**)')
        expect(refactor.disallowed).not.toContain('Edit(src/**/*.test.ts)')
        expect(refactor.disallowed).toContain('Edit(src/test-setup.ts)')
    })

    test('a test-writer that may not edit tests may edit nothing', () => {
        const rules = permissionRules({
            role: 'test-writer',
            may_edit_tests: false,
            config: CONFIG,
        })
        expect(rules.allowed).not.toContain('Edit(src/**/*.test.ts)')
        expect(rules.disallowed).toContain('Edit')
        expect(rules.disallowed).toContain('Write')
    })

    test('no role is pre-approved to install packages', () => {
        for (const role of [
            'test-writer',
            'implementer',
            'reviewer',
            'learner',
        ] as const) {
            const { allowed } = permissionRules({
                role,
                may_edit_tests: role === 'test-writer',
                config: CONFIG,
            })
            expect(
                allowed.filter((rule) =>
                    /^Bash\((bun (install|i|add)|npm|bunx (?!--bun tsc))/.test(
                        rule
                    )
                )
            ).toEqual([])
        }
    })

    test('every role is denied the package install and what it writes', () => {
        for (const role of [
            'test-writer',
            'implementer',
            'reviewer',
            'learner',
        ] as const) {
            for (const may_edit_tests of [true, false]) {
                const { allowed, disallowed } = permissionRules({
                    role,
                    may_edit_tests,
                    config: CONFIG,
                })
                expect(disallowed).toEqual(
                    expect.arrayContaining([
                        'Bash(bun install)',
                        'Bash(bun install *)',
                        'Bash(bun add *)',
                        'Bash(bun remove *)',
                        'Bash(npm *)',
                        'Bash(pnpm *)',
                        'Edit(node_modules/**)',
                        'Edit(**/node_modules/**)',
                        'Edit(bun.lock)',
                        'Edit(**/bun.lock)',
                    ])
                )
                // The type check runs through bunx, so bunx is left to the hook.
                expect(
                    disallowed.filter((rule) => rule.startsWith('Bash(bunx'))
                ).toEqual([])
                if (role === 'implementer') {
                    expect(allowed).toContain('Bash(bunx --bun tsc --noEmit)')
                }
            }
        }
    })

    test('writers are pre-approved for their check commands; reviewers are not', () => {
        const writer = permissionRules({
            role: 'implementer',
            may_edit_tests: false,
            config: CONFIG,
        })
        expect(writer.allowed).toContain('Bash(bun test)')
        expect(writer.allowed).toContain('Bash(bun test *)')
        expect(writer.allowed).toContain('Bash(bunx --bun tsc --noEmit)')
        expect(writer.allowed).toContain('Bash(bun run lint)')
        expect(writer.allowed).toContain('Edit(**)')
        expect(writer.disallowed).toContain('Edit(src/**/*.test.ts)')
        expect(writer.disallowed).toContain('Edit(src/test-setup.ts)')

        const testWriter = permissionRules({
            role: 'test-writer',
            may_edit_tests: true,
            config: CONFIG,
        })
        expect(testWriter.allowed).toContain('Edit(src/**/*.test.ts)')
        expect(testWriter.allowed).not.toContain('Edit(**)')

        const reviewer = permissionRules({
            role: 'reviewer',
            may_edit_tests: false,
            config: CONFIG,
        })
        expect(reviewer.allowed).not.toContain('Bash(bun test)')
        expect(reviewer.allowed).toContain('Bash(git diff *)')
        expect(reviewer.disallowed).toContain('Write')
        expect(reviewer.disallowed).toContain('Edit')

        const learner = permissionRules({
            role: 'learner',
            may_edit_tests: false,
            config: CONFIG,
        })
        expect(learner.allowed).not.toContain('Bash(bun test)')
        expect(learner.disallowed).toContain('Bash')
        for (const rules of [writer, testWriter, reviewer, learner]) {
            expect(rules.disallowed).toContain('WebFetch')
            expect(rules.disallowed).toContain('Agent')
            expect(rules.disallowed).toContain('Skill')
        }
    })

    test('each role gets only its own tools', () => {
        expect(
            permissionRules({
                role: 'test-writer',
                may_edit_tests: true,
                config: CONFIG,
            }).tools
        ).toEqual(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'])
        expect(
            permissionRules({
                role: 'implementer',
                may_edit_tests: false,
                config: CONFIG,
            }).tools
        ).toEqual(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'])
        expect(
            permissionRules({
                role: 'reviewer',
                may_edit_tests: false,
                config: CONFIG,
            }).tools
        ).toEqual(['Read', 'Grep', 'Glob', 'Bash'])
        expect(
            permissionRules({
                role: 'learner',
                may_edit_tests: false,
                config: CONFIG,
            }).tools
        ).toEqual(['Read', 'Grep', 'Glob'])
    })
})
