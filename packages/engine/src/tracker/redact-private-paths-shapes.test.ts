import { describe, expect, test } from 'bun:test'

import { redactPrivatePaths, type KnownRoots } from './redact-private-paths'

/**
 * Every path shape a review found leaking, with what it must become. The
 * home is a made-up `/Users/jdoe`. Forms the repo's own lint would flag are
 * built when the test runs.
 */
const MAC = ['Jdoes', 'MacBook', 'Pro'].join('-')
const HOME_VAR = ['$', 'HOME'].join('')
const HOME_BRACED = ['$', '{HOME}'].join('')
const BUILD_HOST = ['build-01', 'local'].join('.')
const MBP = ['jdoe-mbp', 'local'].join('.')
const ROUTE = ['/home', 'feed'].join('/')
const LIST = ['/Users', 'list'].join('/')
const PAGE = ['/home', 'page.tsx'].join('/')
const SMITH = ['C:', 'Users', 'John Smith', 'src', 'a.ts'].join('\\')

/** [input, output], with no known roots. */
const SHAPES: [string, string][] = [
    // 1. The slug form, and the temp roots.
    ['-Users-jdoe-Github-acme-app', '[home]'],
    [
        '/private/tmp/claude-501/-Users-jdoe-Github-acme-app/tasks/a.output',
        '[tmp]/claude-501/[home]/tasks/a.output',
    ],
    [
        '~/.claude/projects/-Users-jdoe-Github-acme-app/x.jsonl',
        '~/.claude/projects/[home]/x.jsonl',
    ],
    ['/tmp/luca-1/a.txt', '[tmp]/luca-1/a.txt'],
    ['/var/folders/zz/yy999/T/x/e.txt', '[tmp]/x/e.txt'],
    // 2. Spaces, parentheses and globs don't cut the path.
    ['/Users/jdoe/My Projects/secret-client/a.ts', '[home]/…/a.ts'],
    [
        '/Users/jdoe/Library/Application Support/Code/User/settings.json',
        '[home]/…/settings.json',
    ],
    ['/Users/jdoe/app (copy)/secret/a.ts', '[home]/…/a.ts'],
    [SMITH, '[home]\\…\\a.ts'],
    ['/Users/jdoe/Github/*/a.ts', '[home]/…/a.ts'],
    ['at f (/Users/jdoe/Github/app/a.ts:3:7)', 'at f ([home]/…/a.ts:3:7)'],
    ['`/Users/jdoe/My Projects/a.ts` is missing', '`[home]/…/a.ts` is missing'],
    // 3. A path glued to what comes before it, and long climbs.
    [
        '-I/Users/jdoe/include -L/Users/jdoe/lib',
        '-I[home]/include -L[home]/lib',
    ],
    ['../../../Users/jdoe/x', '../../..[home]/x'],
    ['cwd/Users/jdoe/x', 'cwd[home]/x'],
    ['--cwd-/Users/jdoe/x', '--cwd-[home]/x'],
    [
        '../../../../../Github/acme-app/node_modules/zod/index.js:3:1',
        '[outside]/…/index.js:3:1',
    ],
    // 4. Any case.
    ['/users/jdoe/github/a.ts', '[home]/…/a.ts'],
    ['/USERS/JDOE/X', '[home]/X'],
    ['c:\\users\\jdoe\\src', '[home]\\src'],
    // 5. Escaped and encoded.
    [
        '{"p":"\\/Users\\/jdoe\\/Github\\/other\\/a.ts"}',
        '{"p":"[home]\\/…\\/a.ts"}',
    ],
    ['%2FUsers%2Fjdoe%2FGithub%2Fother', '[home]%2F…%2Fother'],
    // 6. URLs that aren't on a web host.
    ['vscode://file/Users/jdoe/Github/a.ts', 'vscode://file[home]/…/a.ts'],
    ['webpack:////Users/jdoe/x.ts', 'webpack:///[home]/x.ts'],
    ['git+file:///Users/jdoe/r.git', 'git+file://[home]/r.git'],
    // 7. Other home forms, and Luca's and Paseo's state folders.
    ['~jdoe/notes/a.md', '[home]/…/a.md'],
    [`${HOME_VAR}/Github/a.ts`, '[home]/…/a.ts'],
    [`${HOME_BRACED}/x/a.ts`, '[home]/…/a.ts'],
    ['/mnt/c/Users/jdoe/src/a.ts', '[home]/…/a.ts'],
    ['/Volumes/Backup Disk/work/a.ts', '[home]/…/a.ts'],
    ['\\\\wsl$\\Ubuntu\\home\\jdoe\\src\\a.ts', '[home]\\…\\a.ts'],
    [
        '~/.local/state/luca/runs/r1/tickets/11/src/a.ts',
        '[runs]/r1/tickets/11/src/a.ts',
    ],
    ['~/.paseo/worktrees/ab12/fix-x/src/a.ts', '[worktree]/src/a.ts'],
    // 8. Computer names; an account name alone stays (it is also an npm scope).
    [`Committer: J Doe <jdoe@${MAC}.local>`, 'Committer: J Doe <jdoe@[host]>'],
    [`ssh ${MAC} and ${BUILD_HOST}`, 'ssh [host] and [host]'],
    [`http://${MBP}:3000/x`, 'http://[host]:3000/x'],
    [
        'PATH=/usr/bin:/Users/jdoe/.bun/bin:/bin',
        'PATH=/usr/bin:[home]/…/bin:/bin',
    ],
    // A sentence's full stop stays outside the path.
    ['see /Users/jdoe/x/a.ts.', 'see [home]/…/a.ts.'],
    ['"/home/jdoe"', '"[home]"'],
]

/** Text that must come out exactly as it went in. */
const UNTOUCHED = [
    `GET ${ROUTE} returned 500; route ${LIST}`,
    'approx ~/5',
    'Read ~/.claude/skills and ~/.bun/bin',
    'https://github.com/Users/foo and http://localhost:3000/home/jdoe/feed',
    'settings.local.json, .env.local and @jdoe/luca by jdoe',
    `src${PAGE} and /home/.config/luca/.env`,
    '<!-- luca:run-1:42:0 -->',
]

describe('redactPrivatePaths: the shapes a review found', () => {
    test.each(SHAPES)('%p', (input, output) => {
        const once = redactPrivatePaths({ text: input })

        expect(once).toBe(output)
        expect(redactPrivatePaths({ text: once })).toBe(once)
    })

    test('ordinary text, web URLs, tool folders and file names stay', () => {
        for (const text of UNTOUCHED) {
            expect(redactPrivatePaths({ text })).toBe(text)
        }
    })

    test('a known home: a bare mention goes, and a Windows home is never split at its drive', () => {
        const known: KnownRoots = { home: '/Users/jdoe' }

        expect(redactPrivatePaths({ text: 'cd /Users/jdoe', known })).toBe(
            'cd [home]'
        )
        expect(
            redactPrivatePaths({
                text: 'C:\\Users\\jdoe\\x',
                known: { home: 'C:\\Users\\jdoe' },
            })
        ).toBe('[home]\\x')
        expect(redactPrivatePaths({ text: 'C:\\Users\\jdoe\\x', known })).toBe(
            '[home]\\x'
        )
    })
})
