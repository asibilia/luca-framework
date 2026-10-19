import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createHarness } from './testing/board-harness'
import {
    intakeOfThree,
    nothingToDo,
    pullRequestOpened,
    runStarted,
    stamp,
    ticketStuck,
    ticketWorktreeCreated,
    wholeTicket,
    type Entry,
} from './testing/journal-fixtures'

import type { BoardState } from '../shared/board-state'

/**
 * Helpers shared by the journal rebuild tests (`journal-rebuild.test.ts` and
 * the `journal-rebuild-*.test.ts` files beside it).
 *
 * Each test writes journals to a runs folder
 * (`<runs_dir>/<run_id>/journal.jsonl`, as the engine does) and reads the
 * board a plugin built from them. The folders a test makes are in `dirs`;
 * each test file removes them after every test.
 */

export const dirs: string[] = []

export const tempDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luca-board-journal-'))
    dirs.push(dir)
    return dir
}

/** A registry folder and a runs folder that outlive one plugin. */
export const disk = async () => ({
    registry_dir: await tempDir(),
    runs_dir: await tempDir(),
})

/** The repo of the harness's chats, and so the folder of workspace `ws-1`. */
export const REPO = '/repo'

/**
 * The entries with their `run_started` naming the repo the run is on, as
 * the engine journals it.
 */
export const inRepo = ({ entries }: { entries: Entry[] }): Entry[] =>
    entries.map((entry) =>
        entry.kind === 'run_started'
            ? {
                  ...entry,
                  content: { ...(entry.content as object), repo: REPO },
              }
            : entry
    )

/**
 * Writes a run on `REPO`'s journal the way the engine does: one JSON line
 * per record.
 */
export const writeJournal = async ({
    runs_dir,
    run_id,
    entries,
}: {
    runs_dir: string
    run_id: string
    entries: Entry[]
}) => {
    await mkdir(join(runs_dir, run_id), { recursive: true })
    const lines = stamp({ entries: inRepo({ entries }) }).map((record) =>
        JSON.stringify(record)
    )
    await writeFile(
        join(runs_dir, run_id, 'journal.jsonl'),
        `${lines.join('\n')}\n`
    )
}

/**
 * A board plugin on `registry_dir` and `runs_dir`, built with the shared
 * harness. Making a second one on the same folders is a reload.
 */
export const plugin = async ({
    registry_dir,
    runs_dir,
}: {
    registry_dir: string
    runs_dir: string
}) => {
    const harness = await createHarness({ registry_dir, runs_dir })

    /** Starts a run from a chat, as `/luca-run 10` does. */
    const start = async () => {
        const { output, run_id, token } = await harness.start()
        if (!output.ok) throw new Error(output.message)
        return { run_id, token }
    }

    /** One run's full state, as the side panel of `ws-1` (in `REPO`) reads it. */
    const stateOf = async ({
        run_id,
    }: {
        run_id: string
    }): Promise<BoardState> => {
        const { selected } = await harness.board.readBoard({
            workspace_id: 'ws-1',
            directory: REPO,
            run_id,
        })
        if (selected?.run.run_id !== run_id) {
            throw new Error(`the board doesn't show run ${run_id}`)
        }
        return selected
    }

    return { ...harness, start, stateOf }
}

/** A whole run of spec 10: three tickets built, the review passed, a PR. */
export const finishedRun = (): Entry[] => [
    ...intakeOfThree(),
    ...wholeTicket({ ticket: 11 }),
    ...wholeTicket({ ticket: 12 }),
    ...wholeTicket({ ticket: 13 }),
    pullRequestOpened({
        number: 408,
        url: 'https://github.com/acme/app/pull/408',
    }),
]

/** Spec 10 with ticket 13 stuck and nothing else running. */
export const stuckRun = (): Entry[] => [
    ...intakeOfThree(),
    ticketWorktreeCreated({ ticket: 13 }),
    ticketStuck({ ticket: 13, reason: 'red_check_failed', detail: 'x' }),
]

export const nothingToDoRun = (): Entry[] => [
    runStarted({ spec: 10 }),
    nothingToDo(),
]

/** A run the board launched, whose journal then went on without it. */
export const launchedRun = async ({
    registry_dir,
    runs_dir,
    entries,
}: {
    registry_dir: string
    runs_dir: string
    entries: Entry[]
}) => {
    const first = await plugin({ registry_dir, runs_dir })
    const { run_id, token } = await first.start()
    await first.board.handleEngineEvent({
        run_id,
        token,
        records: stamp({ entries: [runStarted({ spec: 10 })] }),
        ended: null,
    })
    await first.board.idle()
    await writeJournal({ runs_dir, run_id, entries })
    return { run_id, token }
}
