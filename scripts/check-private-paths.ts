#!/usr/bin/env bun
/**
 * Fails when the repo's own files, its commit messages, or a PR's title and
 * body hold a private path: this is a public repo, and a path such as
 * `/Users/<name>/...` names its owner's account and shows how they lay
 * things out on their computer.
 *
 * It uses the engine's own matcher (`matchPrivatePaths`), the one Luca's
 * redaction uses, so the two find the same shapes. What fails
 * (`findPrivatePaths`):
 * - A home folder of any form (`/Users/<name>`, `/home/<name>`,
 *   `C:\Users\<name>`, `/mnt/c/Users/<name>`, `\\wsl$\...\home\<name>`,
 *   `~<name>/`, the slug form `-Users-<name>-...`, in any case, glued to what
 *   comes before it, escaped, or in a `file://` URL), unless its whole name
 *   is a placeholder from `PLACEHOLDER_NAMES`.
 * - `$HOME/...`, and `~/` followed by `Github`, `Documents`, `Desktop` or
 *   `Downloads`, where people keep their own files.
 * - A computer's name (`<name>.local`, `<name>-MacBook-Pro`).
 *
 * Temp folders, `~/.claude/...` and other tool folders, and web URLs pass.
 *
 * Three modes:
 * - default (`bun run lint`, so Luca's gates and CI): every file git
 *   tracks, plus untracked files git does not ignore. The lockfile
 *   (`bun.lock`) and files git treats as binary are skipped.
 * - `--commits <range>` (CI, for a PR's commits): the messages of the
 *   commits in `<range>`, such as `origin/main..HEAD`.
 * - `--stdin` (CI's `pr-text-check.yml`, for a PR's title and body): the text on stdin.
 *
 * Exits 0 and prints nothing when there is no hit; exits 1 and prints each
 * hit as `file:line: hit` (or `commit <sha>: hit`, `stdin:line: hit`) when
 * there is one; exits 2 on a bad argument.
 *
 * Usage: bun scripts/check-private-paths.ts [--commits <range> | --stdin]
 */
import { lstatSync } from 'node:fs'

import { matchPrivatePaths } from '../packages/engine/src/tracker/private-path-matcher'

/** Account names the repo's fixtures use, never a real person's. */
export const PLACEHOLDER_NAMES = ['me', 'you', 'x', 'runner', 'jdoe']

/** Folders right under the home where people keep their own files. */
const OWN_FILES_FOLDERS = ['github', 'documents', 'desktop', 'downloads']

/** The forms whose `name` is an account name. */
const NAMED_FORMS = ['unix', 'windows', 'wsl', 'slug', 'tilde_name', 'state']

/** Files never checked: Bun writes the lockfile, nobody edits it. */
const SKIPPED_NAMES = ['bun.lock']

/** How many leading bytes git looks at to decide a file is binary. */
const BINARY_SNIFF_BYTES = 8000

/** One private path in a text: its line (from 1) and what matched. */
export type PrivatePathHit = { line: number; hit: string }

/**
 * The private paths in `text` (see the file comment for what counts). A
 * home folder named with nothing after it counts here, unlike in the
 * redaction, which leaves a web route such as `/home/<route>` alone.
 *
 * @example
 * findPrivatePaths({ text: 'cd /Users/me/app' }) // []
 * // A real account's home folder on line 2 gives
 * // [{ line: 2, hit: '/Users/<that name>/...' }]
 */
export const findPrivatePaths = ({
    text,
}: {
    text: string
}): PrivatePathHit[] =>
    matchPrivatePaths({ text, bare_names: true })
        .filter(({ kind, form, name, first }) => {
            if (kind === 'host' || form === 'env_home') return true
            if (form === 'tilde') {
                return OWN_FILES_FOLDERS.includes((first ?? '').toLowerCase())
            }
            return (
                NAMED_FORMS.includes(form) &&
                name !== null &&
                !PLACEHOLDER_NAMES.includes(name.toLowerCase())
            )
        })
        .map(({ start, end }) => ({
            line: text.slice(0, start).split('\n').length,
            hit: text.slice(start, Math.min(end, start + 120)),
        }))

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
    const stdin = args.length === 1 && args[0] === '--stdin'
    const valid =
        args.length === 0 ||
        stdin ||
        (args.length === 2 && range !== undefined && range !== '')
    if (!valid) {
        console.error(
            'Usage: bun scripts/check-private-paths.ts [--commits <range> | --stdin]'
        )
        process.exit(2)
    }
    const hits = stdin
        ? findPrivatePaths({ text: await Bun.stdin.text() }).map(
              ({ line, hit }) => ({ where: `stdin:${line}`, hit })
          )
        : range === undefined
          ? await checkFiles()
          : await checkCommits({ range })
    if (hits.length > 0) {
        console.error(formatHits({ hits }))
        process.exit(1)
    }
}
