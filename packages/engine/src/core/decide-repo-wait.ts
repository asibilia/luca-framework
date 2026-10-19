import { decideRunBudget, type RunBudgetAction } from './decide-run-budget'
import type { StuckAction } from './decide-stuck'

import type { GoingRun } from '../cli/going-runs'
import type { JournalRecord } from '../journal/journal-record'
import type { RunState } from '../journal/replay'

/** How long a repo wait lasts before the run is stuck (`repo_busy`). */
export const REPO_WAIT_MAX_MS = 24 * 60 * 60 * 1000

/** How long each nap of a repo wait is, between looks at the going runs. */
export const REPO_WAIT_NAP_MS = 60_000

/** An earlier run on the repo that a repo wait waits for. */
export type RepoWaitRun = { run_id: string; spec: number | null }

/** The run's steps for the repo wait (#615), before intake. */
export type RepoWaitAction =
    /** Tell the spec issue which runs the run waits for, and journal it. */
    | { type: 'start_repo_wait'; spec_number: number; runs: RepoWaitRun[] }
    /**
     * Nap and look again until no earlier run is going, then journal the
     * wait's end; at `until`, the run is stuck as `repo_busy`.
     */
    | { type: 'wait_for_repo'; spec_number: number; until: string }

/**
 * The going runs a repo wait waits for: those on the same repo as this
 * run, started earlier by `run_started` time, then by run id, so two runs
 * started together never wait for each other. A run with no repo (an older
 * journal) or no start time never counts, and neither does this run. Pure.
 *
 * @example
 * earlierRuns({ runs: going.runs, run_id: 'run-b', records })
 * // [{ run_id: 'run-a', spec: 7 }]
 */
export const earlierRuns = ({
    runs,
    run_id,
    records,
}: {
    runs: Pick<GoingRun, 'run_id' | 'spec' | 'repo' | 'started_at'>[]
    /** This run's id. */
    run_id: string
    /** This run's journal. */
    records: JournalRecord[]
}): RepoWaitRun[] => {
    const start = records.find((record) => record.kind === 'run_started')
    if (start?.kind !== 'run_started' || start.content.repo === null) return []
    const { repo } = start.content
    const own = Date.parse(start.time)
    return runs
        .filter((run) => {
            if (run.repo !== repo || run.run_id === run_id) return false
            if (run.started_at === null) return false
            const at = Date.parse(run.started_at)
            return at < own || (at === own && run.run_id < run_id)
        })
        .map(({ run_id: id, spec }) => ({ run_id: id, spec }))
}

/**
 * Whether the run has yet to look for earlier runs on its repo: intake
 * hasn't read the tickets, and no repo wait began or was skipped. Pure, and
 * cheap: it reads only the record kinds.
 */
export const repoWaitUnchecked = ({
    records,
}: {
    records: JournalRecord[]
}): boolean =>
    records.length > 0 &&
    !records.some(
        ({ kind }) =>
            kind === 'intake_read' ||
            kind === 'repo_wait_started' ||
            kind === 'repo_wait_skipped'
    )

/**
 * The repo wait half of the decision step, before intake (#615). Pure. A
 * run with `earlier_runs` going on its repo waits for them: it tells the
 * spec issue once, then naps until none is going. A run that waited 24
 * hours is stuck (`repo_busy`) until the owner's `retry` (another 24
 * hours) or `stop`. A skipped or ended wait, and a run with no earlier
 * runs (or none given), go on to intake: `null`.
 */
export const decideRepoWait = ({
    state,
    records,
    spec_number,
    earlier_runs,
}: {
    state: RunState
    records: JournalRecord[]
    spec_number: number
    /** The earlier runs going on the repo; left out, there is no wait. */
    earlier_runs: RepoWaitRun[] | undefined
}):
    | (
          | RepoWaitAction
          | RunBudgetAction
          | StuckAction
          | { type: 'done'; outcome: 'stopped_by_user' }
      )[]
    | null => {
    if (state.phase !== 'started') return null
    if (state.stop !== null) {
        return [{ type: 'done', outcome: 'stopped_by_user' }]
    }
    if (state.run_budget.stuck !== null) {
        return decideRunBudget({ state, records, spec_number })
    }
    const { status, since } = state.repo_wait
    if (status === 'waiting' && since !== null) {
        return [
            {
                type: 'wait_for_repo',
                spec_number,
                until: new Date(
                    Date.parse(since) + REPO_WAIT_MAX_MS
                ).toISOString(),
            },
        ]
    }
    if (status !== 'none' || earlier_runs === undefined) return null
    if (earlier_runs.length === 0) return null
    return [{ type: 'start_repo_wait', spec_number, runs: earlier_runs }]
}
