/**
 * What a build step's executor works with (`BuildContext`, `buildContext`),
 * and the small lookups every step shares: a journaled value, a ticket's
 * worktree, a report file, and the test files in a worktree.
 */
import { mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type { AgentLauncher } from '../agents/agent-launcher'
import type { EngineConfig } from '../config/engine-config'
import { testFilesAmong } from '../gates/test-runner'
import type { GitAdapter } from '../git/git-adapter'
import type { Journal } from '../journal/journal'
import {
    replayRun,
    type ReplayedWorktree,
    type RunState,
} from '../journal/replay'
import type { CommentStep } from '../tracker/post-comment-once'
import type { Tracker } from '../tracker/tracker'

/** What the engine needs, beyond the journal and tracker, to build tickets. */
export type BuildDeps = {
    git: GitAdapter
    launcher: AgentLauncher
}

/** What a build step's executor works with. */
export type BuildContext = BuildDeps & {
    journal: Journal
    tracker: Tracker
    state: RunState
    config: EngineConfig
    /** The run's folder, next to its journal and outside git. */
    run_dir: string
    /**
     * Which try of its step this is: a redo after a crash adopts what its
     * first try left behind.
     */
    step: CommentStep
}

/** A journaled value, or a clear error that the journal has none yet. */
export const need = <T>({
    value,
    what,
}: {
    value: T | null | undefined
    what: string
}): T => {
    if (value === null || value === undefined) {
        throw new Error(`The journal has no ${what} yet.`)
    }
    return value
}

export const ticketWorktree = ({
    state,
    ticket,
}: {
    state: RunState
    ticket: number
}): ReplayedWorktree =>
    need({
        value: state.tickets[ticket]?.worktree,
        what: `worktree for #${ticket}`,
    })

/** A fresh report file outside the worktree, so it is never a leftover. */
export const reportFile = async ({
    context,
    ticket,
    label,
}: {
    context: BuildContext
    /** `null` for the final review. */
    ticket: number | null
    label: string
}): Promise<string> => {
    const folder = join(context.run_dir, 'reports')
    await mkdir(folder, { recursive: true })
    return join(
        folder,
        `${context.state.last_seq + 1}-${ticket ?? 'final'}-${label}.xml`
    )
}

export const testFilesIn = async ({
    context,
    cwd,
}: {
    context: BuildContext
    cwd: string
}): Promise<string[]> =>
    testFilesAmong({
        files: await context.git.listFiles({ cwd }),
        test_file_patterns: context.config.test_file_patterns,
    })

/**
 * What a build step's executor works with, from the journal as it is now.
 *
 * @example
 * const context = buildContext({ journal, tracker, git, launcher })
 */
export const buildContext = ({
    journal,
    tracker,
    git,
    launcher,
    step,
}: BuildDeps & {
    journal: Journal
    tracker: Tracker
    /** Left out, a first try, numbered after the journal's last record. */
    step?: CommentStep
}): BuildContext => {
    const records = journal.read()
    const state = replayRun({ records })
    const run_dir = dirname(journal.file)
    return {
        git,
        launcher,
        journal,
        tracker,
        state,
        config: need({ value: state.config, what: 'engine config' }),
        run_dir,
        step: step ?? {
            run_id: basename(run_dir),
            first_seq: (records.at(-1)?.seq ?? 0) + 1,
            redo: false,
        },
    }
}
