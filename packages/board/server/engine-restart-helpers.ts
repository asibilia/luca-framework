import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    createHarness,
    type Harness,
    type UnfinishedRun,
} from './testing/board-harness'
import { runStarted } from './testing/journal-fixtures'

import { ROW_KIND } from '../shared/board-rows'

/**
 * Helpers shared by the engine restart tests (`engine-restart.test.ts` and
 * the `engine-restart-*.test.ts` files beside it).
 *
 * The boards and folders a test makes are in `harnesses` and `dirs`; each
 * test file cleans them up after every test.
 */

export const harnesses: Harness[] = []
export const dirs: string[] = []

/** A plugin on a registry kept in `registry_dir`, so it can be restarted. */
export const plugin = async ({
    registry_dir,
    ...options
}: {
    registry_dir: string
} & Omit<Parameters<typeof createHarness>[0] & object, 'registry_dir'>) => {
    const harness = await createHarness({ registry_dir, ...options })
    harnesses.push(harness)
    return harness
}

export const registryDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luca-board-restart-'))
    dirs.push(dir)
    return dir
}

/** Runs started by a first plugin, whose engines sent `run_started`. */
export const startRuns = async ({
    registry_dir,
    runs,
}: {
    registry_dir: string
    runs: { args: string; cwd?: string }[]
}) => {
    const first = await plugin({ registry_dir })
    const started = []
    for (const { args, cwd } of runs) {
        const run = await first.start({ args, cwd })
        await first.send({
            run_id: run.run_id,
            token: run.token,
            entries: [runStarted({ spec: 10 })],
        })
        started.push(run)
    }
    return started
}

export const listed = ({
    run_id,
    restart = true,
    reason = 'resumable',
    message = null,
}: Partial<UnfinishedRun> & { run_id: string }): UnfinishedRun => ({
    run_id,
    restart,
    reason,
    message,
})

export const registryEntry = async ({
    registry_dir,
    run_id,
}: {
    registry_dir: string
    run_id: string
}) => {
    const file = JSON.parse(
        await Bun.file(join(registry_dir, 'runs.json')).text()
    ) as { runs: { run_id: string; restarts: number; ended: unknown }[] }
    return file.runs.find((entry) => entry.run_id === run_id)
}

export const runOf = async ({
    harness,
    run_id,
}: {
    harness: Harness
    run_id: string
}) => {
    const { selected } = await harness.read({ run_id })
    if (!selected) throw new Error(`no run ${run_id}`)
    return selected.run
}

export const eventTexts = ({ harness }: { harness: Harness }) =>
    harness.rows.flatMap(({ row }) =>
        row.kind === ROW_KIND.event ? [row.data.text] : []
    )
