import { describe, expect, test } from 'bun:test'

import { checkToolCall, type GuardRole } from './role-rules'
import { CONFIG, WORKTREE, decide } from './role-rules-helpers'

/** Seam 3: the guard rules for Bash, table by table. Pure: no files, no git. */

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
