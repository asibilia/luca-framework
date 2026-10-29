import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { dirs, disk, nothingToDoRun } from './journal-rebuild-helpers'
import {
    createHarness,
    type CommandHandler,
    type Harness,
} from './testing/board-harness'
import { stamp } from './testing/journal-fixtures'

/**
 * A run the board did not start shows in every checkout of its repo (#701):
 * in each workspace whose folder has the same `git rev-parse
 * --git-common-dir` as the run's `repo`. When git fails for the workspace's
 * folder, it falls back to the exact folder. The helpers are in
 * `journal-rebuild-helpers.ts`.
 */

const harnesses: Harness[] = []

afterEach(async () => {
    for (const harness of harnesses.splice(0)) await harness.cleanup()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

/** Each folder's git common dir, as the fake git answers it. */
const COMMON_DIRS: Record<string, string> = {
    '/repo': '/repo/.git',
    '/work/app-wt2': '/repo/.git',
    '/work/app-wt3': '/repo/.git',
    '/other': '/other/.git',
}

/**
 * A fake `git rev-parse --git-common-dir`, run in a folder (`cwd`, or
 * `-C <folder>`): the folder's common dir, or "not a git repository" for a
 * folder it doesn't know or one in `failing`. Other commands get the
 * harness's default answer.
 */
const fakeGit =
    ({ failing = [] }: { failing?: string[] } = {}): CommandHandler =>
    (request) => {
        if (!request.args.includes('--git-common-dir')) return null
        const at = request.args.indexOf('-C')
        const folder = at === -1 ? request.cwd : (request.args[at + 1] ?? '')
        const common = failing.includes(folder)
            ? undefined
            : COMMON_DIRS[folder]
        return common
            ? { exit_code: 0, stdout: `${common}\n`, stderr: '' }
            : {
                  exit_code: 128,
                  stdout: '',
                  stderr: 'fatal: not a git repository (or any of the parent directories): .git\n',
              }
    }

/** Writes the journal of a run from the command line on `repo`. */
const writeRunOn = async ({
    runs_dir,
    run_id,
    repo,
}: {
    runs_dir: string
    run_id: string
    repo: string
}) => {
    await mkdir(join(runs_dir, run_id), { recursive: true })
    const lines = stamp({ entries: nothingToDoRun() }).map((record) =>
        JSON.stringify(
            record.kind === 'run_started'
                ? {
                      ...record,
                      content: { ...(record.content as object), repo },
                  }
                : record
        )
    )
    await writeFile(
        join(runs_dir, run_id, 'journal.jsonl'),
        `${lines.join('\n')}\n`
    )
}

const WORKTREE_RUN = '20261029t100000z-wt200001'
const OTHER_RUN = '20261029t100000z-other001'
const EXACT_RUN = '20261029t100000z-exact001'

/** A board with these runs on disk, and the fake git. */
const boardWith = async ({
    runs,
    failing = [],
}: {
    runs: { run_id: string; repo: string }[]
    failing?: string[]
}) => {
    const folders = await disk()
    for (const run of runs) await writeRunOn({ ...folders, ...run })
    const board = await createHarness(folders)
    harnesses.push(board)
    board.setCommandHandler({ handler: fakeGit({ failing }) })
    /** The run ids the workspace in `directory` lists. */
    const shownIn = async ({ directory }: { directory: string }) => {
        const { runs: listed } = await board.board.readBoard({
            workspace_id: 'ws-1',
            directory,
            run_id: null,
        })
        return listed.map((run) => run.run_id)
    }
    return { board, shownIn }
}

describe('a run the board did not start shows in every checkout of its repo', () => {
    test('a run in a second worktree of the workspace repo shows in the workspace', async () => {
        const { shownIn } = await boardWith({
            runs: [{ run_id: WORKTREE_RUN, repo: '/work/app-wt2' }],
        })

        expect(await shownIn({ directory: '/repo' })).toContain(WORKTREE_RUN)
    })

    test('a run whose repo has another git common dir does not show', async () => {
        const { shownIn } = await boardWith({
            runs: [
                { run_id: WORKTREE_RUN, repo: '/work/app-wt2' },
                { run_id: OTHER_RUN, repo: '/other' },
            ],
        })

        const shown = await shownIn({ directory: '/repo' })
        expect(shown).toContain(WORKTREE_RUN)
        expect(shown).not.toContain(OTHER_RUN)
    })

    test('when git fails for the workspace folder, only a run with that exact folder shows there', async () => {
        const { shownIn } = await boardWith({
            runs: [
                { run_id: EXACT_RUN, repo: '/repo' },
                { run_id: WORKTREE_RUN, repo: '/work/app-wt2' },
            ],
            failing: ['/repo'],
        })

        const shown = await shownIn({ directory: '/repo' })
        expect(shown).toContain(EXACT_RUN)
        expect(shown).not.toContain(WORKTREE_RUN)
        // A folder git answers for still matches by common dir.
        expect(await shownIn({ directory: '/work/app-wt3' })).toContain(
            WORKTREE_RUN
        )
    })
})
