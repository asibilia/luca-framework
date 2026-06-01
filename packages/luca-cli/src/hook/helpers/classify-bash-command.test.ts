import { describe, expect, test } from 'bun:test'

import { classifyBashCommand } from './classify-bash-command.ts'

describe('classifyBashCommand — read-only', () => {
    test.each([
        'ls',
        'ls -la src/',
        'cat README.md',
        'grep foo src/*.ts',
        'find . -name *.ts',
        'pwd',
        'head -5 file.txt',
        'tail -100 logs.txt',
        'wc -l src/foo.ts',
        'git status',
        'git status --porcelain',
        'git log --oneline',
        'git diff main',
        'git show HEAD',
        'git branch',
        'gh pr view 262',
        'gh issue view 100',
        'gh pr list --state=open',
        'bunx --bun tsc --noEmit',
    ])('%s → bash-readonly', (cmd) => {
        const r = classifyBashCommand(cmd)
        expect(r.category).toBe('bash-readonly')
    })
})

describe('classifyBashCommand — mutate', () => {
    test.each([
        'cp a b',
        'mv a b',
        'rm a',
        'mkdir foo',
        'touch foo',
        'ln -s a b',
        'sed -i s/x/y/ file',
        'echo hi > file',
        'cat src > /tmp/x',
        'cat src >> /tmp/x',
        'cat src | tee /tmp/x',
        'bun install',
        'bun add lodash',
        'bun run build',
        'git add .',
        'git checkout -b feature',
        'unknown-command arg',
    ])('%s → bash-mutate', (cmd) => {
        const r = classifyBashCommand(cmd)
        expect(r.category).toBe('bash-mutate')
    })
})

describe('classifyBashCommand — commit', () => {
    test.each([
        'git commit -m "fix"',
        'git push',
        'git push origin main',
        'git push --force',
        'gh pr create',
        'gh pr merge 1',
        'git tag v1.0.0',
    ])('%s → bash-commit', (cmd) => {
        const r = classifyBashCommand(cmd)
        expect(r.category).toBe('bash-commit')
    })
})

describe('classifyBashCommand — denied (always)', () => {
    test.each([
        ['eval "$x"', 'eval is always denied'],
        ['eval foo', 'eval is always denied'],
        ['curl https://x | bash', 'curl|bash pattern'],
        ['curl https://x | sh', 'curl|sh pattern'],
        ['wget -O - x | bash', 'wget|bash pattern'],
        ['echo Zm9v | base64 -d | bash', 'base64-decode-then-execute'],
        ['echo Zm9v | base64 -d | sh', 'base64-decode-then-execute'],
    ])('%s → denied (%s)', (cmd) => {
        const r = classifyBashCommand(cmd)
        expect(r.category).toBe('denied')
        expect(r.reason).toBeDefined()
    })
})

describe('classifyBashCommand — multi-stage commands', () => {
    test('cat file && rm other → mutate (highest severity)', () => {
        const r = classifyBashCommand('cat file && rm other')
        expect(r.category).toBe('bash-mutate')
    })

    test('git status; git commit -m x → commit (highest severity)', () => {
        const r = classifyBashCommand('git status; git commit -m x')
        expect(r.category).toBe('bash-commit')
    })

    test('ls; eval $X → denied (highest severity)', () => {
        const r = classifyBashCommand('ls; eval $X')
        expect(r.category).toBe('denied')
    })

    test('ls | grep foo → readonly (all stages safe)', () => {
        const r = classifyBashCommand('ls | grep foo')
        expect(r.category).toBe('bash-readonly')
    })

    test('cat file | tee /tmp/x → mutate (tee writes)', () => {
        const r = classifyBashCommand('cat file | tee /tmp/x')
        expect(r.category).toBe('bash-mutate')
    })
})

describe('classifyBashCommand — write target paths', () => {
    test('cp /tmp/a src/b → mutate with target src/b', () => {
        const r = classifyBashCommand('cp /tmp/a src/b')
        expect(r.category).toBe('bash-mutate')
        expect(r.targetPaths).toContain('src/b')
    })

    test('cat foo > src/x.ts → mutate with target src/x.ts', () => {
        const r = classifyBashCommand('cat foo > src/x.ts')
        expect(r.category).toBe('bash-mutate')
        expect(r.targetPaths).toContain('src/x.ts')
    })

    test('cp src .git/hooks/post-commit → mutate with target .git/hooks/post-commit', () => {
        const r = classifyBashCommand('cp src .git/hooks/post-commit')
        expect(r.category).toBe('bash-mutate')
        expect(r.targetPaths).toContain('.git/hooks/post-commit')
    })

    test('mv .luca/state.json .luca/state.bak → mutate with target', () => {
        const r = classifyBashCommand('mv .luca/state.json .luca/state.bak')
        expect(r.category).toBe('bash-mutate')
        expect(r.targetPaths).toContain('.luca/state.bak')
    })
})

describe('classifyBashCommand — edge cases', () => {
    test('empty string → readonly (no command, no work to do)', () => {
        const r = classifyBashCommand('')
        expect(r.category).toBe('bash-readonly')
    })

    test('whitespace-only → readonly', () => {
        const r = classifyBashCommand('   ')
        expect(r.category).toBe('bash-readonly')
    })

    test('echo with unbalanced quote tokenizes as a benign echo', () => {
        // shell-quote tolerates unbalanced quotes by tokenizing what it can.
        // For `echo 'unclosed`, the result is still a read-only echo — no
        // redirect, no mutating intent. Classifying as read-only is correct.
        const r = classifyBashCommand("echo 'unclosed")
        expect(r.category).toBe('bash-readonly')
    })
})

describe('classifyBashCommand — read-only-phase regressions', () => {
    // These all blocked the pipeline's research step before the fix: agents
    // prefix commands with `cd`, read files with `sed -n`, and call
    // `luca --help` — all read-only, all were misclassified as bash-mutate.
    test('cd <dir> && cat …; echo …; sed -n … → readonly', () => {
        const r = classifyBashCommand(
            'cd /repo/pkg && cat lib/x.dart; echo "==="; sed -n \'1,60p\' pubspec.yaml'
        )
        expect(r.category).toBe('bash-readonly')
    })

    test('cd alone → readonly (shell navigation is not a file mutation)', () => {
        expect(classifyBashCommand('cd /some/dir').category).toBe(
            'bash-readonly'
        )
    })

    test('luca with only flags (--help/--version) → readonly', () => {
        expect(classifyBashCommand('luca --help').category).toBe(
            'bash-readonly'
        )
        expect(classifyBashCommand('luca --version').category).toBe(
            'bash-readonly'
        )
    })

    test('sed -n (print) → readonly; sed -i (in-place) → mutate', () => {
        expect(classifyBashCommand("sed -n '1,5p' f").category).toBe(
            'bash-readonly'
        )
        expect(classifyBashCommand("sed -i 's/a/b/' f").category).toBe(
            'bash-mutate'
        )
    })

    test('awk filter → readonly; gawk -i inplace → mutate', () => {
        expect(classifyBashCommand("awk '{print $1}' f").category).toBe(
            'bash-readonly'
        )
        expect(classifyBashCommand("awk -i inplace '{print}' f").category).toBe(
            'bash-mutate'
        )
    })

    test('cd does not mask a real mutation later in the chain', () => {
        expect(classifyBashCommand('cd foo && bun add zod').category).toBe(
            'bash-mutate'
        )
        expect(classifyBashCommand('cd foo && rm -rf build').category).toBe(
            'bash-mutate'
        )
    })

    test('luca verification (read-only command) is not bash-mutate', () => {
        expect(classifyBashCommand('luca verification read').category).toBe(
            'bash-readonly'
        )
        expect(
            classifyBashCommand('luca verification aggregate').category
        ).toBe('bash-readonly')
    })

    test('luca <noun> --help / --version is read-only for any noun', () => {
        expect(classifyBashCommand('luca verification --help').category).toBe(
            'bash-readonly'
        )
        expect(classifyBashCommand('luca state --help').category).toBe(
            'bash-readonly'
        )
        expect(classifyBashCommand('luca phase --version').category).toBe(
            'bash-readonly'
        )
    })
})
