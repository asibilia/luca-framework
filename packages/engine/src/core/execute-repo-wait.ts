/**
 * Carries out the repo wait (#615): a run started while an earlier run on
 * the same repo is going waits for it, before intake.
 */
import { basename, dirname } from 'node:path'

import {
    earlierRuns,
    REPO_WAIT_NAP_MS,
    type RepoWaitAction,
    type RepoWaitRun,
} from './decide-repo-wait'
import { repoBusyDetail, repoWaitComment } from './repo-wait-text'

import type { goingRuns } from '../cli/going-runs'
import type { Journal } from '../journal/journal'
import type { EngineClock } from '../limits/limit-wait'
import { postCommentOnce, type CommentStep } from '../tracker/post-comment-once'
import type { Tracker } from '../tracker/tracker'

/** Lists the unfinished runs on this computer, as `goingRuns` does. */
export type GoingRunsReader = () => ReturnType<typeof goingRuns>

/**
 * The earlier runs going on this run's repo (see `earlierRuns`), by
 * `going_runs`. None when the board's registry can't be read: the wait
 * never holds a run up on a list it can't trust.
 */
export const readEarlierRuns = async ({
    going_runs,
    journal,
}: {
    going_runs: GoingRunsReader
    journal: Journal
}): Promise<RepoWaitRun[]> => {
    const listing = await going_runs()
    if (!listing.ok) return []
    return earlierRuns({
        runs: listing.runs,
        run_id: basename(dirname(journal.file)),
        records: journal.read(),
    })
}

/**
 * Carries out a repo wait. Its start tells the spec issue once which runs
 * it waits for, then is journaled. The wait reads the going runs, then
 * naps by `clock` and reads them again, until no earlier run on the repo is
 * going (`repo_wait_ended`) or `until` comes (the run is stuck as
 * `repo_busy`). Without `going_runs`, none is going.
 */
export const executeRepoWaitAction = async ({
    action,
    journal,
    tracker,
    clock,
    going_runs,
    step,
}: {
    action: RepoWaitAction
    journal: Journal
    tracker: Tracker
    clock: EngineClock
    going_runs: GoingRunsReader | undefined
    step: CommentStep
}): Promise<void> => {
    if (action.type === 'start_repo_wait') {
        await postCommentOnce({
            tracker,
            number: action.spec_number,
            body: repoWaitComment({ runs: action.runs }),
            step,
            n: 0,
        })
        journal.append({
            kind: 'repo_wait_started',
            ticket: null,
            role: null,
            content: { runs: action.runs },
        })
        return
    }
    const end = Date.parse(action.until)
    for (;;) {
        const runs =
            going_runs === undefined
                ? []
                : await readEarlierRuns({ going_runs, journal })
        if (runs.length === 0) {
            journal.append({
                kind: 'repo_wait_ended',
                ticket: null,
                role: null,
                content: {},
            })
            return
        }
        const left = end - clock.now()
        if (left <= 0) {
            journal.append({
                kind: 'run_stuck',
                ticket: null,
                role: null,
                content: {
                    reason: 'repo_busy',
                    detail: repoBusyDetail({ runs }),
                },
            })
            return
        }
        await clock.sleep(Math.min(left, REPO_WAIT_NAP_MS))
    }
}
