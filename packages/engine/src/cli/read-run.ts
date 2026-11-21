/**
 * Reading a run's journal to go on from it: the records of a run in the runs
 * folder (`readRun`), and its `run_started` (`readRunStart`, `runStartOf`,
 * `RunStart`).
 */
import { existsSync } from 'node:fs'

import { errorText } from './run-end'

import { providerOfConfig, type ProviderId } from '../config/engine-config'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'

/** What a run's `run_started` says: its spec, base branch, repo, provider, and time. */
export type RunStart = {
    spec_number: number
    base_branch: string
    /** `null` in journals from before the repo was kept. */
    repo: string | null
    /** Agent provider from `run_started.content.config` (defaults to `'claude'`). */
    provider: ProviderId
    /** When `run_started` was journaled. */
    started_at: string
}

/**
 * The records of run `run_id`, or why there are none to go on from: no
 * journal, an empty one, or one that cannot be read. Never makes the run's
 * folder.
 */
export const readRun = ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}): { ok: true; records: JournalRecord[] } | { ok: false; error: string } => {
    const file = runJournalPath({ runs_dir, run_id })
    if (!existsSync(file)) {
        return { ok: false, error: `No run ${run_id}: there is no ${file}.` }
    }
    try {
        const records = createJournal({ file }).read()
        return records.length === 0
            ? {
                  ok: false,
                  error: `Run ${run_id} has an empty journal (${file}), so there is nothing to go on from; start a new run with --spec.`,
              }
            : { ok: true, records }
    } catch (error) {
        return { ok: false, error: errorText(error) }
    }
}

/**
 * What run `run_id`'s records say it started with: its first record's
 * `run_started` (spec, base branch, repo, provider, time). The one place a
 * run's start is read, by `readRunStart` and by a resume (`runSpec`). An
 * error when the records do not start with `run_started`.
 *
 * @example
 * const start = runStartOf({ run_id, records: journal.read() })
 * const provider = start.ok ? start.start.provider : DEFAULT_PROVIDER
 */
export const runStartOf = ({
    run_id,
    records,
}: {
    run_id: string
    records: JournalRecord[]
}): { ok: true; start: RunStart } | { ok: false; error: string } => {
    const [first] = records
    if (first?.kind !== 'run_started') {
        return {
            ok: false,
            error: `Run ${run_id}'s journal does not start with run_started, so it is not a run.`,
        }
    }
    const { spec_number, base_branch, repo, config } = first.content
    return {
        ok: true,
        start: {
            spec_number,
            base_branch,
            repo,
            provider: providerOfConfig({ config }),
            started_at: first.time,
        },
    }
}

/**
 * Reads run `run_id`'s `run_started`: the spec, base branch, and repo a
 * resume goes on with. An error when the run has no journal, an empty one,
 * or one that does not start with `run_started`.
 *
 * @example
 * const start = readRunStart({ runs_dir: defaultRunsDir(), run_id })
 * if (start.ok) console.log(start.start.spec_number)
 */
export const readRunStart = ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}): { ok: true; start: RunStart } | { ok: false; error: string } => {
    const read = readRun({ runs_dir, run_id })
    if (!read.ok) return read
    return runStartOf({ run_id, records: read.records })
}
