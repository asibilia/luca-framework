/**
 * The runs in the runs folder that are not over, and whether Paseo may
 * restart each one (#375): `unfinishedRuns`, `restartableRuns`, and the shape
 * `luca-run --unfinished` prints.
 */
import { existsSync, readdirSync } from 'node:fs'

import { z } from 'zod'

import { readRun } from './read-run'

import { decide } from '../core/decide'
import { STOP_ACTIONS } from '../core/execute'
import type { JournalRecord } from '../journal/journal-record'

/**
 * The ids of the runs in `runs_dir` that are not over: runs whose journal's
 * next action (by the decision step) is not a stop (`done` or
 * `invalid_journal`), such as a run that crashed, was killed, or waits for a
 * reply. Folders with no journal, an empty one, or one that cannot be read
 * are left out. Sorted, so oldest first for made-up run ids. Paseo can
 * `resumeRun` each one when it starts (#375).
 *
 * @example
 * for (const run_id of unfinishedRuns({ runs_dir: defaultRunsDir() })) console.log(run_id)
 */
export const unfinishedRuns = ({
    runs_dir,
}: {
    runs_dir: string
}): string[] => {
    if (!existsSync(runs_dir)) return []
    return readdirSync(runs_dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map(({ name }) => name)
        .filter((run_id) => {
            const read = readRun({ runs_dir, run_id })
            return (
                read.ok &&
                !STOP_ACTIONS.has(decide({ records: read.records }).type)
            )
        })
        .toSorted()
}

/**
 * One unfinished run, as `luca-run --unfinished` prints it for the board
 * plugin (#375): whether Paseo may restart it with `--resume`, and why.
 *
 * - `resumable`: the engine was cut off (a crash, a kill); `restart` is true.
 * - `launcher_stopped`: its last record is a launcher stop (the wrong login,
 *   plan, or model). A restart would stop the same way, so `restart` is
 *   false; `message` is the stop's reason.
 * - `billing_stopped`: it stopped for billing, which sticks; `restart` is
 *   false and `message` is the stop's reason.
 */
export const RestartableRunSchema = z.object({
    run_id: z.string(),
    restart: z.boolean(),
    reason: z.enum(['resumable', 'launcher_stopped', 'billing_stopped']),
    message: z.string().nullable(),
})

export type RestartableRun = z.infer<typeof RestartableRunSchema>

/** What `luca-run --unfinished` prints: one JSON object, snake_case keys. */
export const UnfinishedOutputSchema = z.object({
    runs: z.array(RestartableRunSchema),
})

/** Whether Paseo may restart one unfinished run, from its records. */
const restartOf = ({
    run_id,
    records,
}: {
    run_id: string
    records: JournalRecord[]
}): RestartableRun => {
    // A billing stop sticks, wherever it is in the journal.
    const billing = records.find(
        (record) => record.kind === 'run_stopped' && record.content.billing
    )
    if (billing?.kind === 'run_stopped') {
        return {
            run_id,
            restart: false,
            reason: 'billing_stopped',
            message: billing.content.reason,
        }
    }
    const last = records.at(-1)
    if (last?.kind === 'run_stopped' && !last.content.crashed) {
        return {
            run_id,
            restart: false,
            reason: 'launcher_stopped',
            message: last.content.reason,
        }
    }
    return { run_id, restart: true, reason: 'resumable', message: null }
}

/**
 * The unfinished runs in `runs_dir` (`unfinishedRuns`), each with whether
 * Paseo may restart it with `--resume` (#375). A run whose last record is a
 * launcher stop is not restarted, since it would stop the same way; a run
 * with a billing stop anywhere in its journal never is. Everything else was
 * cut off and can go on from its journal.
 *
 * @example
 * const runs = restartableRuns({ runs_dir: defaultRunsDir() })
 * // [{ run_id: 'luca-20260923-141500-ab12', restart: true, reason: 'resumable', message: null }]
 */
export const restartableRuns = ({
    runs_dir,
}: {
    runs_dir: string
}): RestartableRun[] =>
    unfinishedRuns({ runs_dir }).flatMap((run_id) => {
        const read = readRun({ runs_dir, run_id })
        return read.ok ? [restartOf({ run_id, records: read.records })] : []
    })
