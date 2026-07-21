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

    test('denies the cross-repo handoff mailbox under the user home', () => {
        // Guard (risk G1): the machine-global mailbox at `<home>/.luca/handoff/`
        // is CLI-only. Agents must not hand-forge envelopes with a direct
        // Write — every envelope goes through the schema-validated transport.
        // The always-deny on `<home>/.luca/` must never be narrowed to carve
        // out this directory.
        const homedir = '/Users/alec'
        const r = classifyWritePath(`${homedir}/.luca/handoff/x.json`, {
            homedir,
        })
        expect(r.class).toBe('denied')
        expect(r.reason).toContain('user tooling dir')

        // A nested envelope path is denied by the same rule.
        expect(
            classifyWritePath(`${homedir}/.luca/handoff/nested/x.json`, {
                homedir,
            }).class
        ).toBe('denied')
    })

    test('denies the handoff mailbox even when no homedir is supplied', () => {
        // Fail CLOSED: with `homedir` absent the home-deny above never runs,
        // and `toLucaRelative`'s segment fallback recovers `.luca/handoff/x.json`
        // from the absolute path — which previously classified as the ALLOWED
        // `planning-general`, letting an agent hand-forge an envelope into the
        // machine-global mailbox.
        const r = classifyWritePath('/Users/alec/.luca/handoff/x.json')
        expect(r.class).not.toBe('planning-general')
        expect(r.class).toBe('denied')
        expect(r.reason).toContain('/.luca/handoff/')

        // Same for the repo-relative spelling and a nested envelope path.
        expect(classifyWritePath('.luca/handoff/x.json').class).toBe('denied')
        expect(
            classifyWritePath('/Users/alec/.luca/handoff/nested/x.json').class
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

describe('classifyWritePath — release-artifact (.changeset)', () => {
    test('classifies .changeset/<name>.md as release-artifact', () => {
        expect(classifyWritePath('.changeset/foo.md').class).toBe(
            'release-artifact'
        )
        expect(
            classifyWritePath('.changeset/tricky-mongoose-jump.md').class
        ).toBe('release-artifact')
    })

    test('excludes changesets own docs/config — README.md + config.json stay code', () => {
        // README.md is changesets' own documentation and config.json its
        // configuration; finalize may ADD a release note, never reconfigure
        // the tool. Both fall through to the code-write column.
        expect(classifyWritePath('.changeset/README.md').class).toBe('code')
        expect(classifyWritePath('.changeset/config.json').class).toBe('code')
    })

    test('does NOT match nested .changeset/<dir>/<name>.md (one level deep only)', () => {
        expect(classifyWritePath('.changeset/sub/x.md').class).toBe('code')
    })

    test('recognizes an absolute .changeset/<name>.md path', () => {
        // Claude Code passes ABSOLUTE file_paths; the segment-anchored
        // pattern matches both spellings.
        expect(
            classifyWritePath('/Users/dev/proj/.changeset/foo.md').class
        ).toBe('release-artifact')
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
