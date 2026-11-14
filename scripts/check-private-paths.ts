#!/usr/bin/env bun
/**
 * Fails when the repo's own files, or its commit messages, hold a path to a
 * private folder: this is a public repo, and a path such as
 * `/Users/<name>/...` names its owner's account and shows how they lay
 * things out on their computer.
 *
 * What fails (`findPrivatePaths`):
 * - `/Users/<name>` and `/home/<name>`, and `C:\Users\<name>` (or
 *   `C:/Users/<name>`), unless `<name>` is a placeholder from
 *   `PLACEHOLDER_NAMES` (`me`, `you`, `runner`, ...; case matters). A match
 *   inside a URL or a longer path (`github.com/Users/x`, `src/home/x`) is
 *   not a local path and passes.
 * - A `Github` folder right under `~` anywhere, the usual home of the
 *   owner's checkouts.
 *
 * Two modes:
 * - default (`bun run lint`, so Luca's gates and CI): every file git
 *   tracks, plus untracked files git does not ignore. The lockfile
 *   (`bun.lock`) and files git treats as binary are skipped.
 * - `--commits <range>` (CI, for a PR's commits): the messages of the
 *   commits in `<range>`, such as `origin/main..HEAD`.
 *
 * Exits 0 and prints nothing when there is no hit; exits 1 and prints each
 * hit as `file:line: hit` (or `commit <sha>: hit`) when there is one; exits
 * 2 on a bad argument.
 *
 * Usage: bun scripts/check-private-paths.ts [--commits <range>]
 */
import { lstatSync } from 'node:fs'

/** Account names that are placeholders, never a real person's. */
export const PLACEHOLDER_NAMES = [
    'me',
    'you',
    'x',
    'a',
    'dev',
    'test',
    'example',
    'runner',
]

/** Files never checked: Bun writes the lockfile, nobody edits it. */
const SKIPPED_NAMES = ['bun.lock']

/** How many leading bytes git looks at to decide a file is binary. */
const BINARY_SNIFF_BYTES = 8000

/**
 * A home folder: not inside a URL or a longer path (a name character, a
 * `/`, or a `.` before it), with a name that starts like an account name.
 */
const HOME_PATTERN =
    /(?<![\w.~%+\-/\\])(?:\/(?:Users|home)\/|[A-Za-z]:(?:\\+|\/)Users(?:\\+|\/))([A-Za-z0-9_][\w-]*)/g

/** The usual home of the owner's checkouts. */
const CHECKOUTS_PATTERN = /~\/Github\//gi

/** One private path in a text: its line (from 1) and what matched. */
export type PrivatePathHit = { line: number; hit: string }

/**
 * The private paths in `text` (see the file comment for what counts).
 *
 * @example
 * findPrivatePaths({ text: 'cd /Users/me/app' }) // []
 * // A real account's home folder on line 2 gives
 * // [{ line: 2, hit: '/Users/<that name>' }]
 */
export const findPrivatePaths = ({
    text,
}: {
    text: string
}): PrivatePathHit[] =>
    text.split('\n').flatMap((content, at) => [
        ...[...content.matchAll(HOME_PATTERN)]
            .filter(([, name]) => !PLACEHOLDER_NAMES.includes(name ?? ''))
            .map(([hit]) => ({ line: at + 1, hit })),
        ...[...content.matchAll(CHECKOUTS_PATTERN)].map(([hit]) => ({
            line: at + 1,
            hit,
        })),
    ])

/**
 * The failure message for the hits found, each with where it is.
 *
 * @example
 * formatHits({ hits: [{ where: 'docs/a.md:2', hit: '/home/<name>' }] })
 */
export const formatHits = ({
    hits,
}: {
    hits: { where: string; hit: string }[]
}): string =>
    [
        'Private paths found. This repo is public: use repo-relative paths, or a placeholder such as /Users/me or /home/me.',
        ...hits.map(({ where, hit }) => `${where}: ${hit}`),
    ].join('\n')

const git = async (args: string[]): Promise<string> =>
    Bun.$`git ${args}`.quiet().text()

/** The files to check: tracked, plus untracked ones git does not ignore. */
const repoFiles = async (): Promise<string[]> => {
    const listed = await git([
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
    ])
    return [...new Set(listed.split('\0'))].filter((path) => {
        if (path === '') return false
        if (SKIPPED_NAMES.includes(path.split('/').at(-1) ?? '')) return false
        try {
            return lstatSync(path).isFile()
        } catch {
            return false
        }
    })
}

/** The hits in every file of the repo (see the file comment). */
const checkFiles = async (): Promise<{ where: string; hit: string }[]> => {
    const found = await Promise.all(
        (await repoFiles()).map(async (path) => {
            const bytes = await Bun.file(path).bytes()
            if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return []
            const text = new TextDecoder().decode(bytes)
            return findPrivatePaths({ text }).map(({ line, hit }) => ({
                where: `${path}:${line}`,
                hit,
            }))
        })
    )
    return found.flat()
}

/** The hits in the messages of the commits in `range`. */
const checkCommits = async ({
    range,
}: {
    range: string
}): Promise<{ where: string; hit: string }[]> => {
    const log = await git(['log', '--format=%H%x00%B%x01', range])
    return log.split('\x01').flatMap((entry) => {
        const [sha = '', message = ''] = entry.trim().split('\0')
        return findPrivatePaths({ text: message }).map(({ hit }) => ({
            where: `commit ${sha.slice(0, 9)}`,
            hit,
        }))
    })
}

if (import.meta.main) {
    const args = process.argv.slice(2)
    const range = args[0] === '--commits' ? args[1] : undefined
    const valid =
        args.length === 0 ||
        (args.length === 2 && range !== undefined && range !== '')
    if (!valid) {
        console.error(
            'Usage: bun scripts/check-private-paths.ts [--commits <range>]'
        )
        process.exit(2)
    }
    const hits =
        range === undefined ? await checkFiles() : await checkCommits({ range })
    if (hits.length > 0) {
        console.error(formatHits({ hits }))
        process.exit(1)
    }
}
