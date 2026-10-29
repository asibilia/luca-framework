import isEmpty from 'lodash/isEmpty'

import { configReloadText } from './config-reload-text'
import {
    openDecisionModel,
    type DecisionModelSetup,
} from './decision-model-setup'
import { readRunStart } from './read-run'
import { driveRun, errorText, type RunEnd, type RunLauncher } from './run-end'

import type { BoardSync } from '../board/board-sync'
import { loadEngineConfig } from '../config/engine-config'
import { lucaVersion } from '../config/luca-version'
import {
    recordConfigReload,
    recordResume,
    runEngine,
    startRun,
} from '../core/execute'
import type { GoingRunsReader } from '../core/execute-repo-wait'
import { runLiveFilePath } from '../core/live-file'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal, runJournalPath } from '../journal/journal'
import type { UsageLineDeps } from '../limits/usage-line'
import type { MemoryDeps } from '../memory/memory-client'
import type { Tracker } from '../tracker/tracker'

export { configReloadText } from './config-reload-text'
export type { DecisionModelSetup } from './decision-model-setup'
export { readRunStart, type RunStart } from './read-run'
export { DEMO_TURN_DELAY_MS, runDemo } from './run-demo'
export { resumeCommand, type RunEnd, type RunLauncher } from './run-end'
export {
    restartableRuns,
    RestartableRunSchema,
    unfinishedRuns,
    UnfinishedOutputSchema,
    type RestartableRun,
} from './unfinished-runs'

/**
 * A real run of `spec_number` on `repo`: loads the repo's engine config,
 * opens (or resumes) the run's journal at `<runs_dir>/<run_id>` (its live
 * file, `live.json`, goes beside it), and runs the
 * engine with the board kept in step, the agents from `launcher`, and the
 * decision model in shadow mode if given (`decision_model`; with no
 * credentials it is off for the run, see `openDecisionModel`). With `memory`, a new run turns memory on (#370),
 * with the engine config's `muninn.vault` as the project vault (none:
 * `default` only); a resumed run keeps what its journal says. A new run
 * stops on a bad config; a resume takes the config's build fields again
 * and keeps its own on a bad one (`recordConfigReload`, #516). Never throws;
 * the launcher's sessions and the memory client are closed and the board
 * always gets the run's end.
 *
 * @example
 * const end = await runSpec({
 *     spec_number: 374, repo: '/code/app', run_id, base_branch: null,
 *     runs_dir: defaultRunsDir(), tracker: createGitHubTracker({ repo: 'acme/app' }),
 *     launcher: createClaudeLauncher({}),
 *     decision_model: { credentials: await loadDecisionModelCredentials({ env: process.env, home: homedir() }) },
 *     board, log: console.log,
 * })
 */
export const runSpec = async ({
    spec_number,
    repo,
    run_id,
    base_branch,
    runs_dir,
    tracker,
    launcher,
    decision_model,
    memory,
    usage,
    going_runs,
    alongside,
    board,
    log,
    luca_version = lucaVersion(),
}: {
    spec_number: number
    repo: string
    run_id: string
    /** `null` for the engine's default, `main`. */
    base_branch: string | null
    runs_dir: string
    tracker: Tracker
    launcher: RunLauncher
    /** The decision model's setup (#534). Leave it out to run without one. */
    decision_model?: DecisionModelSetup
    /** MuninnDB (#370). Leave it out to run without memory. */
    memory?: MemoryDeps
    /** The usage line (#434). Leave it out to run without one. */
    usage?: UsageLineDeps
    /** The going runs, for the repo wait (#615). Leave it out for no wait. */
    going_runs?: GoingRunsReader
    /** A new run skips the repo wait (`--alongside`). */
    alongside?: boolean
    board: BoardSync | null
    log: (line: string) => void
    /** Luca's version, recorded on start and resume. Defaults to the engine's own. */
    luca_version?: string
}): Promise<RunEnd> => {
    const journal = createJournal({
        file: runJournalPath({ runs_dir, run_id }),
    })
    log(`[luca-run] spec #${spec_number} in ${repo}, run ${run_id}`)
    log(`[luca-run] journal: ${journal.file}`)
    const loaded = await loadEngineConfig({ repo_root: repo })
    const fresh = isEmpty(journal.read())
    // A new run needs a good config; a resume keeps its own (#516).
    if (fresh && !loaded.ok) {
        log(`[luca-run] stopped: ${loaded.error}`)
        await launcher.closeAll?.()
        await memory?.client.close().catch(() => undefined)
        const end = { ok: false, message: loaded.error }
        await board?.end({ records: journal.read(), ...end })
        return end
    }
    if (fresh && loaded.ok) {
        startRun({
            journal,
            spec_number,
            config: loaded.config,
            base_branch: base_branch ?? undefined,
            memory:
                memory === undefined
                    ? undefined
                    : { project_vault: loaded.config.muninn?.vault ?? null },
            repo,
            alongside,
            luca_version,
        })
    } else {
        log('[luca-run] resuming the run from its journal')
        recordResume({ journal, luca_version })
        const reload = recordConfigReload({ journal, loaded })
        if (reload !== null) log(`[luca-run] ${configReloadText({ reload })}`)
    }
    const jev = openDecisionModel({ setup: decision_model, journal, log })
    return driveRun({
        journal,
        run_id,
        launcher,
        memory,
        board,
        log,
        run: () =>
            runEngine({
                journal,
                tracker,
                git: createGitAdapter({ repo_root: repo }),
                launcher,
                jev,
                memory,
                usage,
                going_runs,
                board: board ?? undefined,
                live_file: runLiveFilePath({ runs_dir, run_id }),
                log,
            }),
    })
}

/**
 * Goes on with run `run_id` from its journal, as `luca-run --resume` does:
 * the spec and base branch come from its `run_started`, and the repo from
 * `repo`, else the one the run started in, else the current folder. The
 * journal is kept, so the engine picks up where the run stopped (a step a
 * crash cut off is taken again; see `run_resumed`). `tracker` makes the
 * tracker for the repo. Memory stays on or off as the run's `run_started`
 * says, with `memory` as its client. Never throws: a missing or empty
 * journal ends the run with a clear message, the launcher's sessions and
 * the memory client are closed, and the board always gets the run's end.
 *
 * @example
 * const end = await resumeRun({
 *     run_id, runs_dir: defaultRunsDir(), repo: null,
 *     tracker: async ({ repo }) => createGitHubTracker({ repo: await githubRepoOf({ repo }) }),
 *     launcher: createClaudeLauncher({}), board, log: console.log,
 * })
 */
export const resumeRun = async ({
    run_id,
    runs_dir,
    repo,
    tracker,
    launcher,
    decision_model,
    memory,
    usage,
    going_runs,
    board,
    log,
    luca_version,
}: {
    run_id: string
    runs_dir: string
    /** `null` for the repo the run started in (or the current folder). */
    repo: string | null
    tracker: ({ repo }: { repo: string }) => Tracker | Promise<Tracker>
    launcher: RunLauncher
    /** The decision model's setup (#534). Leave it out to go on without one. */
    decision_model?: DecisionModelSetup
    /**
     * MuninnDB (#370), used when the run's `run_started` turned memory on.
     * Leave it out to go on without memory.
     */
    memory?: MemoryDeps
    /** The usage line (#434). Leave it out to go on without one. */
    usage?: UsageLineDeps
    /** The going runs, so a repo wait cut off goes on (#615). */
    going_runs?: GoingRunsReader
    board: BoardSync | null
    log: (line: string) => void
    /** Luca's version, recorded on the resume. Defaults to the engine's own. */
    luca_version?: string
}): Promise<RunEnd> => {
    const stop = async (message: string): Promise<RunEnd> => {
        log(`[luca-run] stopped: ${message}`)
        await launcher.closeAll?.()
        await memory?.client.close().catch(() => undefined)
        const end = { ok: false, message }
        await board?.end(end)
        return end
    }
    const read = readRunStart({ runs_dir, run_id })
    if (!read.ok) return stop(read.error)
    const { spec_number, base_branch } = read.start
    const at = repo ?? read.start.repo ?? process.cwd()
    let made: Tracker
    try {
        made = await tracker({ repo: at })
    } catch (error) {
        return stop(errorText(error))
    }
    return runSpec({
        spec_number,
        repo: at,
        run_id,
        base_branch,
        runs_dir,
        tracker: made,
        launcher,
        decision_model,
        memory,
        usage,
        going_runs,
        board,
        log,
        luca_version,
    })
}
