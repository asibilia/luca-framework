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

const decide = ({
    role,
    tool_name,
    tool_input,
}: {
    role: GuardRole
    tool_name: string
    tool_input: unknown
}): boolean =>
    checkToolCall({
        role,
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
    const cases: [GuardRole, string, boolean][] = [
        ['test-writer', 'src/sum.test.ts', true],
        ['test-writer', 'src/deep/a/b.test.ts', true],
        ['test-writer', 'src/sum.ts', false],
        ['test-writer', 'README.md', false],
        ['test-writer', 'src/test-setup.ts', false],
        ['implementer', 'src/sum.ts', true],
        ['implementer', 'package.json', true],
        ['implementer', 'src/sum.test.ts', false],
        ['implementer', 'src/test-setup.ts', false],
        ['implementer', '.git', false],
        ['implementer', '.git/config', false],
        ['implementer', '../other/src/sum.ts', false],
        ['implementer', 'src/../../escape.ts', false],
        ['implementer', '/etc/passwd', false],
        ['reviewer', 'src/sum.ts', false],
        ['reviewer', 'src/sum.test.ts', false],
        ['learner', 'src/sum.ts', false],
        ['learner', 'notes.md', false],
    ]
    test.each(cases)('%s writing %s: %p', (role, path, expected) => {
        expect(mayWrite({ role, path, config: CONFIG })).toBe(expected)
    })
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

    test('a denial says why', () => {
        const decision = checkToolCall({
            role: 'implementer',
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

describe('permissionRules', () => {
    test('writers are pre-approved for their check commands; reviewers are not', () => {
        const writer = permissionRules({ role: 'implementer', config: CONFIG })
        expect(writer.allowed).toContain('Bash(bun test)')
        expect(writer.allowed).toContain('Bash(bun test *)')
        expect(writer.allowed).toContain('Bash(bunx --bun tsc --noEmit)')
        expect(writer.allowed).toContain('Bash(bun run lint)')
        expect(writer.allowed).toContain('Edit(**)')
        expect(writer.disallowed).toContain('Edit(src/**/*.test.ts)')
        expect(writer.disallowed).toContain('Edit(src/test-setup.ts)')

        const testWriter = permissionRules({
            role: 'test-writer',
            config: CONFIG,
        })
        expect(testWriter.allowed).toContain('Edit(src/**/*.test.ts)')
        expect(testWriter.allowed).not.toContain('Edit(**)')

        const reviewer = permissionRules({ role: 'reviewer', config: CONFIG })
        expect(reviewer.allowed).not.toContain('Bash(bun test)')
        expect(reviewer.allowed).toContain('Bash(git diff *)')
        expect(reviewer.disallowed).toContain('Write')
        expect(reviewer.disallowed).toContain('Edit')

        const learner = permissionRules({ role: 'learner', config: CONFIG })
        expect(learner.disallowed).toContain('Bash')
        for (const rules of [writer, testWriter, reviewer, learner]) {
            expect(rules.disallowed).toContain('WebFetch')
            expect(rules.disallowed).toContain('Agent')
            expect(rules.disallowed).toContain('Skill')
        }
    })

    test('each role gets only its own tools', () => {
        expect(
            permissionRules({ role: 'test-writer', config: CONFIG }).tools
        ).toEqual(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'])
        expect(
            permissionRules({ role: 'implementer', config: CONFIG }).tools
        ).toEqual(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'])
        expect(
            permissionRules({ role: 'reviewer', config: CONFIG }).tools
        ).toEqual(['Read', 'Grep', 'Glob', 'Bash'])
        expect(
            permissionRules({ role: 'learner', config: CONFIG }).tools
        ).toEqual(['Read', 'Grep', 'Glob'])
    })
})
