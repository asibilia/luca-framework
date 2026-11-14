/**
 * Formatting the stuck comments share: a clipped code fence for error text,
 * and counted words.
 */
import max from 'lodash/max'

/** Longest error text a comment or prompt quotes. */
const DETAIL_MAX = 3000

/** A code fence longer than any run of backticks in `text`. */
export const fenced = (text: string): string => {
    const longest = max((text.match(/`+/g) ?? []).map(({ length }) => length))
    const fence = '`'.repeat(Math.max(3, (longest ?? 0) + 1))
    const clipped =
        text.length > DETAIL_MAX
            ? `${text.slice(0, DETAIL_MAX)}\n... (clipped)`
            : text
    return `${fence}\n${clipped}\n${fence}`
}

/**
 * `count` and `word`, with `s` past one; a word ending in a consonant and
 * `y` ends in `ies` instead.
 *
 * @example
 * plural(2, 'fix round') // '2 fix rounds'
 * plural(3, 'failed try') // '3 failed tries'
 */
export const plural = (count: number, word: string): string => {
    if (count === 1) return `${count} ${word}`
    return /[^aeiou]y$/.test(word)
        ? `${count} ${word.slice(0, -1)}ies`
        : `${count} ${word}s`
}

/**
 * A worktree as a stuck comment names it, with no path from the owner's
 * computer: relative to Luca's runs folder, where the engine makes every
 * worktree (`<run id>/tickets/<n>`, `<run id>/run-branch`), or else just
 * its last folder's name.
 *
 * @example
 * worktreeLabel({ path: '/Users/me/.local/state/luca/runs/r1/tickets/11' })
 * // 'runs/r1/tickets/11'
 * worktreeLabel({ path: '/Users/me/elsewhere/wt-11' }) // 'wt-11'
 */
export const worktreeLabel = ({ path }: { path: string }): string => {
    const names = path.split(/[\\/]+/).filter((name) => name !== '')
    const [run_id, kind, ticket] = names.slice(-3)
    if (kind === 'tickets' && run_id !== undefined && ticket !== undefined) {
        return `runs/${run_id}/tickets/${ticket}`
    }
    const [run, last] = names.slice(-2)
    if (last === 'run-branch' && run !== undefined) {
        return `runs/${run}/run-branch`
    }
    return names.at(-1) ?? 'the worktree'
}

/** Where a worktree named by `worktreeLabel` is, said once per comment. */
export const RUNS_FOLDER_NOTE =
    "It is in Luca's runs folder on the computer that ran the run; `/luca-unstick` there shows its full path."
