/**
 * Taking paths from this computer out of text Luca sends to GitHub. A
 * comment, a PR, or a story must never show where the owner keeps things:
 * their home folder (it names their account), the folders under it, the
 * computer's temp folders, or the computer's name. Every one of them
 * becomes a token (see `PRIVATE_PATH_TOKENS`).
 */
import { homedir, tmpdir } from 'node:os'

import { matchPrivatePaths, type KnownRoots } from './private-path-matcher'

export type { KnownRoots } from './private-path-matcher'

/** What a text becomes when even the simplest redaction failed. */
export const REDACTION_FAILED_TEXT =
    '(Luca left this text out: it could not check it for paths from this computer.)'

/** The last resort when the matcher fails: any home folder's name goes. */
const PLAIN_HOME =
    /(?:[A-Za-z]:[\\/]+Users|\/Users|\/home)[\\/]+[^\s\\/]+|-(?:Users|home)-[^\s/\\]+/gi

/**
 * Takes every path from this computer out of `text`, for anything Luca
 * sends to GitHub. Pure, idempotent (`f(f(x)) === f(x)`), and it never
 * throws. The matching is `matchPrivatePaths`, the same the repo's lint
 * uses.
 *
 * - The `known` roots first, the most specific first: the runs folder
 *   becomes `[runs]`, a worktree or repo root `[worktree]`, a temp folder
 *   `[tmp]`, each keeping the path after it.
 * - Luca's and Paseo's state folders under any home (`~/.local/state/luca/
 *   runs`, `~/.paseo/worktrees/<id>/<name>`), and `/tmp`, `/private/tmp`
 *   and `/var/folders/...` on any computer, the same way.
 * - Any home folder becomes `[home]`, keeping at most the path's final
 *   file name (`[home]/…/a.ts`): `/Users/<name>`, `/home/<name>` (in any
 *   case, glued to what comes before, JSON-escaped or `%2F`-encoded),
 *   `C:\Users\<name>`, `/mnt/c/Users/<name>`, `\\wsl$\...\home\<name>`,
 *   `/Volumes/<name>`, `~<name>/`, `~/<folder>`, `$HOME/`, and the slug
 *   form `-Users-<name>-...` that tools make of a path. The path runs
 *   through spaces and parentheses, up to the end of the line, a quote, a
 *   bracket that closes one opened before it, or a `:line:col`.
 * - `../` climbed four or more times becomes `[outside]`, and a computer's
 *   name (`<name>.local`, `<name>-MacBook-Pro`) `[host]`.
 *
 * Left as they are: web URLs (`https://github.com/Users/x`), tool folders
 * with nothing private after them (`~/.claude/skills`), a web route with
 * nothing after the name (`/home/<route>`), and markers (`<!-- luca:... -->`).
 * On an error, a plain replace of home folders is tried, then
 * `REDACTION_FAILED_TEXT`.
 *
 * @param text - The text to send.
 * @param known - This computer's folders; see `localRoots`.
 * @returns The text with no path from this computer in it.
 *
 * @example
 * redactPrivatePaths({
 *     text: 'at /Users/me/.local/state/luca/runs/r1/tickets/11/src/a.ts',
 *     known: { home: '/Users/me', runs_dir: '/Users/me/.local/state/luca/runs' },
 * })
 * // 'at [runs]/r1/tickets/11/src/a.ts'
 *
 * @example
 * redactPrivatePaths({ text: 'ENOENT /home/me/My Work/repo/a.ts' })
 * // 'ENOENT [home]/…/a.ts'
 */
export const redactPrivatePaths = ({
    text,
    known = {},
}: {
    text: string
    known?: KnownRoots
}): string => {
    try {
        const matches = matchPrivatePaths({ text, known })
        let out = ''
        let at = 0
        for (const { start, end, replacement } of matches) {
            out += text.slice(at, start) + replacement
            at = end
        }
        return out + text.slice(at)
    } catch {
        try {
            return text.replace(PLAIN_HOME, '[home]')
        } catch {
            return REDACTION_FAILED_TEXT
        }
    }
}

/**
 * This computer's known roots: its home folder and temp folder, plus the
 * runs folder and any worktree or repo roots the caller knows.
 *
 * @example
 * const known = localRoots({ runs_dir: defaultRunsDir(), worktree_roots: [repo] })
 * redactPrivatePaths({ text: body, known })
 */
export const localRoots = ({
    runs_dir,
    worktree_roots = [],
}: {
    runs_dir?: string
    worktree_roots?: string[]
} = {}): KnownRoots => ({
    home: homedir(),
    tmp_dirs: [tmpdir()],
    worktree_roots,
    ...(runs_dir === undefined ? {} : { runs_dir }),
})
