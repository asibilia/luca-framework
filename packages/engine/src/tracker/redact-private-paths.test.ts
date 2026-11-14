import { describe, expect, test } from 'bun:test'

import { redactPrivatePaths, type KnownRoots } from './redact-private-paths'

/** What no redacted text may hold. */
const PRIVATE = [/\/Users\//, /\/home\//, /\/var\/folders/, /C:\\Users/i, /~\//]

const expectNoPrivatePaths = (text: string): void => {
    for (const pattern of PRIVATE) expect(text).not.toMatch(pattern)
}

/** A Mac's known roots: the runs folder sits inside the home folder. */
const MAC: KnownRoots = {
    home: '/Users/me',
    runs_dir: '/Users/me/.local/state/luca/runs',
    worktree_roots: ['/Users/me/Github/app'],
    tmp_dirs: ['/var/folders/ab/cd123/T'],
}

describe('redactPrivatePaths', () => {
    test('known roots become tokens, the most specific first, and the home keeps only its last folder name', () => {
        const text = [
            'Worktree: /Users/me/.local/state/luca/runs/run-1/tickets/11',
            'at /Users/me/Github/app/src/sum.ts:3:7',
            'temp: /private/var/folders/ab/cd123/T/bun-1/out.txt',
            'other: /Users/me/Github/secret-project/notes.md',
            'home: /Users/me',
        ].join('\n')

        expect(redactPrivatePaths({ text, known: MAC })).toBe(
            [
                'Worktree: [runs]/run-1/tickets/11',
                'at [worktree]/src/sum.ts:3:7',
                'temp: [tmp]/bun-1/out.txt',
                'other: [home]/…/notes.md',
                'home: [home]',
            ].join('\n')
        )
    })

    test("an unknown machine's home folders, temp folders and home-relative paths go too", () => {
        const text = [
            'Error: ENOENT /home/me/work/repo/a.ts',
            'at C:\\Users\\me\\code\\repo\\b.ts:1:2',
            'json: {"path":"C:\\\\Users\\\\me\\\\repo\\\\c.ts"}',
            'mixed: C:/Users/me/repo/d.ts',
            'tmp: /var/folders/zz/yy999/T/x/e.txt',
            'see ~/work/repo/f.ts and `/Users/me/g.ts`',
        ].join('\n')

        const redacted = redactPrivatePaths({ text })

        expectNoPrivatePaths(redacted)
        expect(redacted).toContain('ENOENT [home]/…/a.ts')
        expect(redacted).toContain('at [home]\\…\\b.ts:1:2')
        expect(
            JSON.parse(redacted.split('json: ')[1]?.split('\n')[0] ?? '')
        ).toEqual({
            path: '[home]\\…\\c.ts',
        })
        expect(redacted).toContain('[tmp]/x/e.txt')
        expect(redacted).toContain('see [home]/…/f.ts and `[home]/g.ts`')
    })

    test('URLs, markers, dotfiles under ~ and plain words stay as they are', () => {
        const text = [
            'https://github.com/Users/foo and http://x/home/y',
            '<!-- luca:run-1:42:0 -->',
            '<!-- luca-pr-story v=1 part=1/1 head=abc sha256=def -->',
            'Read ~/.claude.json, then reply `retry #11`.',
            'src/home/page.tsx and the Users list',
        ].join('\n')

        expect(redactPrivatePaths({ text, known: MAC })).toBe(text)
    })

    test('it is idempotent', () => {
        const text =
            'a /Users/me/x/y/z.ts b /home/me c C:\\Users\\me\\q d ~/work/r e /Users/me/.local/state/luca/runs/r/run-branch f /private/var/folders/ab/cd123/T/g'
        const once = redactPrivatePaths({ text, known: MAC })

        expect(redactPrivatePaths({ text: once, known: MAC })).toBe(once)
        expect(redactPrivatePaths({ text: once })).toBe(once)
    })

    test('a broken known root never throws, and the generic fallback still runs', () => {
        const known: KnownRoots = {
            home: '/Users/me',
            // Not absolute, or the bare root: ignored.
            worktree_roots: ['relative/dir', '/', ''],
        }

        expect(redactPrivatePaths({ text: 'at /Users/me/a/b.ts', known })).toBe(
            'at [home]/…/b.ts'
        )
    })
})
