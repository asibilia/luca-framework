import { describe, expect, test } from 'bun:test'

import { classifyWritePath } from './classify-write-path.ts'

describe('classifyWritePath — .luca/ paths', () => {
    test('classifies .luca/ root files as planning-general', () => {
        expect(classifyWritePath('.luca/state.json').class).toBe(
            'planning-general'
        )
        expect(classifyWritePath('.luca/config.json').class).toBe(
            'planning-general'
        )
        expect(classifyWritePath('.luca/roadmap.md').class).toBe(
            'planning-general'
        )
    })

    test('classifies phase artifacts as planning-general', () => {
        expect(classifyWritePath('.luca/phases/01-auth/plan.md').class).toBe(
            'planning-general'
        )
        expect(
            classifyWritePath('.luca/phases/01-auth/research.md').class
        ).toBe('planning-general')
        expect(
            classifyWritePath('.luca/phases/01-auth/execute/summary.md').class
        ).toBe('planning-general')
    })

    test('classifies audit files as planning-audit', () => {
        expect(
            classifyWritePath('.luca/phases/01-auth/audits/code-review.md')
                .class
        ).toBe('planning-audit')
        expect(
            classifyWritePath('.luca/phases/12-x/audits/security.md').class
        ).toBe('planning-audit')
        expect(
            classifyWritePath('.luca/phases/01-x/audits/architect.md').class
        ).toBe('planning-audit')
    })

    test('milestones + telemetry + archive are planning-general', () => {
        expect(
            classifyWritePath('.luca/milestones/v12.0.0-roadmap.md').class
        ).toBe('planning-general')
        expect(classifyWritePath('.luca/telemetry/run-abc.jsonl').class).toBe(
            'planning-general'
        )
        expect(classifyWritePath('.luca/archive/01-old/plan.md').class).toBe(
            'planning-general'
        )
    })
})

describe('classifyWritePath — code paths', () => {
    test.each([
        'src/foo.ts',
        'packages/luca-core/src/index.ts',
        'package.json',
        'tsconfig.json',
        'README.md',
        'node_modules/lodash/index.js',
        'dist/index.mjs',
    ])('classifies %s as code', (path) => {
        expect(classifyWritePath(path).class).toBe('code')
    })
})

describe('classifyWritePath — always-denied paths', () => {
    test.each([
        '.git/HEAD',
        '.git/hooks/pre-commit',
        '.git/refs/heads/main',
        '/etc/passwd',
        '/usr/local/bin/luca',
        '/var/log/system.log',
        '/System/Library/foo',
        '/bin/sh',
        '/sbin/init',
    ])('denies %s', (path) => {
        const r = classifyWritePath(path)
        expect(r.class).toBe('denied')
        expect(r.reason).toBeDefined()
    })

    test('denies ~/.claude/* even when written as tilde-prefixed', () => {
        expect(classifyWritePath('~/.claude/settings.json').class).toBe(
            'denied'
        )
        expect(classifyWritePath('~/.luca/foo').class).toBe('denied')
    })

    test('denies legacy shared-tmp luca handoff payloads', () => {
        // Regression: /tmp/luca-*.json payloads collide across repos —
        // two concurrent pipelines overwrite each other's checks files.
        for (const path of [
            '/tmp/luca-checks-07.json',
            '/tmp/luca-roadmap.json',
            '/private/tmp/luca-checks-01.json',
        ]) {
            const r = classifyWritePath(path)
            expect(r.class).toBe('denied')
            expect(r.reason).toContain('.luca/tmp/')
        }
    })

    test('classifies non-luca /tmp scratch files as ephemeral (not denied)', () => {
        expect(classifyWritePath('/tmp/scratch.json').class).toBe('ephemeral')
        expect(classifyWritePath('/tmp/some-script.sh').class).toBe('ephemeral')
    })

    test('denies absolute paths under the user home .claude/ or .luca/', () => {
        const homedir = '/Users/alec'
        expect(
            classifyWritePath('/Users/alec/.claude/settings.json', {
                homedir,
            }).class
        ).toBe('denied')
        expect(
            classifyWritePath('/Users/alec/.luca/global-state.json', {
                homedir,
            }).class
        ).toBe('denied')
    })
})

describe('classifyWritePath — ephemeral OS-temp + preview scratch', () => {
    test('classifies universal /tmp and /private/tmp writes as ephemeral', () => {
        expect(classifyWritePath('/tmp/decision.html').class).toBe('ephemeral')
        expect(
            classifyWritePath('/private/tmp/ramora-p4-decision.html').class
        ).toBe('ephemeral')
    })

    test('classifies platform tmpdir (macOS /var/folders) as ephemeral via tmpdirs opt', () => {
        const tmpdirs = ['/var/folders/ab/cd1234/T']
        expect(
            classifyWritePath('/var/folders/ab/cd1234/T/abc/decision.html', {
                tmpdirs,
            }).class
        ).toBe('ephemeral')
        // A custom $TMPDIR-style root also passed via tmpdirs.
        expect(
            classifyWritePath('/Users/alec/.cache/tmp/x.html', {
                tmpdirs: ['/Users/alec/.cache/tmp'],
            }).class
        ).toBe('ephemeral')
    })

    test('platform /var/folders temp is NOT denied by the /var system-dir rule', () => {
        // Without the tmpdirs opt it falls back to the /var denial — but the
        // hook always supplies os.tmpdir(), so the real path is exercised above.
        const r = classifyWritePath('/var/folders/ab/cd/T/x.html', {
            tmpdirs: ['/var/folders/ab/cd/T'],
        })
        expect(r.class).not.toBe('denied')
    })

    test('legacy /tmp/luca-* payloads stay denied even though they live under /tmp', () => {
        // The collision denial is checked before the ephemeral allow.
        const r = classifyWritePath('/tmp/luca-checks-07.json', {
            tmpdirs: ['/tmp'],
        })
        expect(r.class).toBe('denied')
        expect(r.reason).toContain('.luca/tmp/')
    })

    test('non-temp /var paths remain denied', () => {
        expect(classifyWritePath('/var/log/system.log').class).toBe('denied')
    })

    test('classifies .luca/tmp/previews/<name> as ephemeral', () => {
        expect(
            classifyWritePath('.luca/tmp/previews/auth-decision.html').class
        ).toBe('ephemeral')
        expect(
            classifyWritePath('/repo/.luca/tmp/previews/ws-reconnect.html', {
                cwd: '/repo',
            }).class
        ).toBe('ephemeral')
    })

    test('flat .luca/tmp/<name>.json handoffs remain planning-general (unchanged)', () => {
        expect(classifyWritePath('.luca/tmp/roadmap.json').class).toBe(
            'planning-general'
        )
    })
})

describe('classifyWritePath — reason field', () => {
    test('returns a human-readable reason for denied paths', () => {
        const r = classifyWritePath('.git/HEAD')
        expect(r.class).toBe('denied')
        expect(r.reason).toContain('.git')
    })
})

describe('classifyWritePath — absolute paths normalized via cwd', () => {
    // Regression: Claude Code passes an ABSOLUTE file_path. Without cwd
    // normalization an absolute `.luca/` artifact classified as `code`, and
    // the stage-gate matrix wrongly blocked legal artifact writes (e.g. the
    // researcher writing research.md in the research step).
    const cwd = '/Users/dev/proj'

    test('absolute .luca artifact → planning-general', () => {
        expect(
            classifyWritePath(`${cwd}/.luca/phases/01-x/research.md`, { cwd })
                .class
        ).toBe('planning-general')
    })

    test('absolute .luca audit → planning-audit', () => {
        expect(
            classifyWritePath(
                `${cwd}/.luca/phases/01-x/audits/code-review.md`,
                { cwd }
            ).class
        ).toBe('planning-audit')
    })

    test('absolute code file → code', () => {
        expect(classifyWritePath(`${cwd}/lib/main.dart`, { cwd }).class).toBe(
            'code'
        )
    })

    test('absolute system path stays denied even with cwd set', () => {
        expect(classifyWritePath('/etc/passwd', { cwd }).class).toBe('denied')
    })

    test('without cwd, an absolute .luca path is still recognized', () => {
        // toLucaRelative's segment fallback recovers the contract-relative
        // portion even when no cwd is provided (or cwd is not the repo
        // root) — see its docstring.
        expect(
            classifyWritePath(`${cwd}/.luca/phases/01-x/research.md`).class
        ).toBe('planning-general')
    })
})
