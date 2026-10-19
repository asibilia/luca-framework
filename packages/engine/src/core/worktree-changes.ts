/**
 * What a step counts as a worktree's changes: it notes what the prepare
 * command made (`watchPrepare`), leaves that and outside links out
 * (`leaveOutIn`), and lists the rest (`ticketChanges`).
 */
import difference from 'lodash/difference'

import type { BuildContext } from './build-context'

import type { FileChange } from '../git/git-adapter'
import { outsideLinks } from '../git/outside-links'

/**
 * Runs `run`, a run of the config's prepare command in `cwd`, and journals
 * as `prepare_made` the untracked paths it made: there after it ran, not
 * before, and not known yet. Without a prepare command it only runs `run`.
 *
 * A crash in the middle of a prepare run leaves what it made so far; the
 * redo's own "before" then holds those paths, so they count as the
 * ticket's unless an earlier prepare run already noted them.
 */
export const watchPrepare = async <Result>({
    context,
    cwd,
    ticket,
    run,
}: {
    context: BuildContext
    cwd: string
    /** The step's ticket, `null` in the final review. */
    ticket: number | null
    run: () => Promise<Result>
}): Promise<Result> => {
    if (context.config.prepare === undefined) return run()
    const before = await context.git.untracked({ cwd })
    const result = await run()
    const paths = difference(
        await context.git.untracked({ cwd }),
        before,
        context.state.prepare_made
    )
    if (paths.length > 0) {
        context.journal.append({
            kind: 'prepare_made',
            ticket,
            role: null,
            content: { paths },
        })
    }
    return result
}

/**
 * The paths the engine leaves out of the changes at `cwd`: what prepare
 * made (`prepare_made`), and every untracked symlink pointing outside the
 * checkout, which no commit may hold (#496). Such a link not noted yet is
 * most likely a prepare run's from before the engine noted what prepare
 * made (an older engine's run, resumed); it is journaled as
 * `prepare_made { paths, outside_links: true }`, so every later step leaves
 * it out too.
 *
 * @param ticket - The step's ticket, `null` on the run branch.
 * @returns Every path to leave out, the new links included.
 *
 * @example
 * const leave_out = await leaveOutIn({ context, cwd, ticket: 11 })
 * await context.git.commitAll({ cwd, message, leave_out })
 */
export const leaveOutIn = async ({
    context,
    cwd,
    ticket,
}: {
    context: BuildContext
    cwd: string
    ticket: number | null
}): Promise<string[]> => {
    const { prepare_made } = context.state
    const links = await outsideLinks({
        cwd,
        paths: difference(await context.git.untracked({ cwd }), prepare_made),
    })
    if (links.length > 0) {
        context.journal.append({
            kind: 'prepare_made',
            ticket,
            role: null,
            content: { paths: links, outside_links: true },
        })
    }
    return [...prepare_made, ...links]
}

/** The changes at `cwd`, less the paths in `leave_out`. */
export const ticketChanges = async ({
    context,
    cwd,
    leave_out,
}: {
    context: BuildContext
    cwd: string
    leave_out: string[]
}): Promise<FileChange[]> =>
    (await context.git.changes({ cwd })).filter(
        ({ path }) => !leave_out.includes(path)
    )
