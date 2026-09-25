import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import isEmpty from 'lodash/isEmpty'
import { z } from 'zod'

import type { AgentLauncher } from '../agents/agent-launcher'
import { createScriptedLauncher } from '../agents/scripted-launcher'
import type { BoardSync } from '../board/board-sync'
import { loadEngineConfig } from '../config/engine-config'
import { decide, type EngineAction } from '../core/decide'
import { runEngine, startRun, STOP_ACTIONS } from '../core/execute'
import { createGitAdapter } from '../git/git-adapter'
import { createTypeSafeJev } from '../jev/jev-client'
import type { JevShadow } from '../jev/jev-shadow'
import { createJournal, runJournalPath, type Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import type { MemoryDeps } from '../memory/memory-client'
import {
    DEMO_TURNS,
    demoMuninn,
    demoTracker,
    makePracticeRepo,
    PRACTICE_SPEC_NUMBER,
} from '../testing/practice-run'
import type { InMemoryPullRequest } from '../tracker/in-memory-tracker'
import type { Tracker } from '../tracker/tracker'

/** How a `luca-run` process ended; the board gets it as `ended`. */
export type RunEnd = { ok: boolean; message: string }

/**
 * An agent launcher a run may close at its end, such as the Claude launcher,
 * which keeps sessions open for follow-ups.
 */
export type RunLauncher = AgentLauncher & { closeAll?: () => Promise<void> }

/** How long each scripted agent turn of the demo takes, so the board is watchable. */
export const DEMO_TURN_DELAY_MS = 1500

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/** What a run's last action means for the person watching it. */
const endOf = ({ action }: { action: EngineAction }): RunEnd => {
    if (action.type === 'invalid_journal') {
        return {
            ok: false,
            message: `The journal is not a run: ${action.reason}`,
        }
    }
    if (action.type !== 'done') {
        return {
            ok: false,
            message: `The engine stopped before ${action.type}.`,
        }
    }
    switch (action.outcome) {
        case 'pr_opened':
            return {
                ok: true,
                message: `PR opened: ${action.pull_request.url}`,
            }
        case 'nothing_to_do':
            return {
                ok: true,
                message: 'Nothing to do: every ticket of the spec is closed.',
            }
        case 'refused':
            return {
                ok: false,
                message:
                    'Intake refused the run; the spec and tickets have comments saying what is missing.',
            }
        case 'stopped_by_user':
            return {
                ok: false,
                message:
                    "Stopped by your `stop` reply: no PR. The run branch and the unfinished tickets' worktrees are kept.",
            }
        case 'all_skipped':
            return {
                ok: true,
                message:
                    'Every ticket was skipped, so there is no PR. The skipped tickets stay open.',
            }
        case 'stopped':
            return {
                ok: false,
                message: `Run stopped for billing: ${action.reason}. It will not go on; start a new run once per-token billing is off.`,
            }
        case 'crashed':
            return {
                ok: false,
                message: `Run stopped for good after crashes: ${action.reason} It will not go on; read the engine's log for why it crashed, then start a new run.`,
            }
    }
}

/**
 * Runs the engine to its end and turns what happened into a `RunEnd`, then
 * closes the launcher's open sessions and tells the board. A crash is caught
 * and reported, never thrown.
 */
const driveRun = async ({
    journal,
    run,
    launcher,
    memory,
    board,
    log,
}: {
    journal: Journal
    run: () => Promise<EngineAction>
    launcher: RunLauncher
    /** Closed at the end too. */
    memory?: MemoryDeps
    board: BoardSync | null
    log: (line: string) => void
}): Promise<RunEnd> => {
    let end: RunEnd
    try {
        end = endOf({ action: await run() })
    } catch (error) {
        const message = errorText(error)
        // A launcher stop is journaled as run_stopped, then thrown.
        end = message.startsWith('Run stopped:')
            ? { ok: false, message }
            : { ok: false, message: `The engine crashed: ${message}` }
    } finally {
        await launcher.closeAll?.()
        await memory?.client.close().catch(() => undefined)
    }
    log(`[luca-run] ${end.ok ? 'finished' : 'stopped'}: ${end.message}`)
    await board?.end({ records: journal.read(), ...end })
    return end
}

/**
 * A real run of `spec_number` on `repo`: loads the repo's engine config,
 * opens (or resumes) the run's journal at `<runs_dir>/<run_id>`, and runs the
 * engine with the board kept in step, the agents from `launcher`, and Jev
 * in shadow mode if given. With `memory`, a new run turns memory on (#370),
 * with the engine config's `muninn.vault` as the project vault (none:
 * `default` only); a resumed run keeps what its journal says. Never throws;
 * the launcher's sessions and the memory client are closed and the board
 * always gets the run's end.
 *
 * @example
 * const end = await runSpec({
 *     spec_number: 374, repo: '/code/app', run_id, base_branch: null,
 *     runs_dir: defaultRunsDir(), tracker: createGitHubTracker({ repo: 'acme/app' }),
 *     launcher: createClaudeLauncher({}), jev: { client: createTypeSafeJev() },
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
    jev,
    memory,
    board,
    log,
}: {
    spec_number: number
    repo: string
    run_id: string
    /** `null` for the engine's default, `main`. */
    base_branch: string | null
    runs_dir: string
    tracker: Tracker
    launcher: RunLauncher
    /** Jev in shadow mode. Leave it out to run without Jev. */
    jev?: JevShadow
    /** MuninnDB (#370). Leave it out to run without memory. */
    memory?: MemoryDeps
    board: BoardSync | null
    log: (line: string) => void
}): Promise<RunEnd> => {
    const journal = createJournal({
        file: runJournalPath({ runs_dir, run_id }),
    })
    log(`[luca-run] spec #${spec_number} in ${repo}, run ${run_id}`)
    log(`[luca-run] journal: ${journal.file}`)
    const loaded = await loadEngineConfig({ repo_root: repo })
    if (!loaded.ok) {
        log(`[luca-run] stopped: ${loaded.error}`)
        await launcher.closeAll?.()
        await memory?.client.close().catch(() => undefined)
        const end = { ok: false, message: loaded.error }
        await board?.end({ records: journal.read(), ...end })
        return end
    }
    if (isEmpty(journal.read())) {
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
        })
    } else {
        log('[luca-run] resuming the run from its journal')
    }
    return driveRun({
        journal,
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
                board: board ?? undefined,
            }),
    })
}

/** What a run's `run_started` says: its spec, base branch, and repo. */
export type RunStart = {
    spec_number: number
    base_branch: string
    /** `null` in journals from before the repo was kept. */
    repo: string | null
}

/**
 * The records of run `run_id`, or why there are none to go on from: no
 * journal, an empty one, or one that cannot be read. Never makes the run's
 * folder.
 */
const readRun = ({
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
    const [first] = read.records
    if (first?.kind !== 'run_started') {
        return {
            ok: false,
            error: `Run ${run_id}'s journal does not start with run_started, so it is not a run.`,
        }
    }
    const { spec_number, base_branch, repo } = first.content
    return { ok: true, start: { spec_number, base_branch, repo } }
}

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
    jev,
    memory,
    board,
    log,
}: {
    run_id: string
    runs_dir: string
    /** `null` for the repo the run started in (or the current folder). */
    repo: string | null
    tracker: ({ repo }: { repo: string }) => Tracker | Promise<Tracker>
    launcher: RunLauncher
    /** Jev in shadow mode. Leave it out to run without Jev. */
    jev?: JevShadow
    /**
     * MuninnDB (#370), used when the run's `run_started` turned memory on.
     * Leave it out to go on without memory.
     */
    memory?: MemoryDeps
    board: BoardSync | null
    log: (line: string) => void
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
        jev,
        memory,
        board,
        log,
    })
}

/** Wraps a launcher so each agent turn takes at least `delay_ms`. */
const slowLauncher = ({
    launcher,
    delay_ms,
    log,
}: {
    launcher: AgentLauncher
    delay_ms: number
    log: (line: string) => void
}): AgentLauncher => ({
    launch: async (args) => {
        log(`[luca-run] ${args.role} on #${args.ticket}`)
        await Bun.sleep(delay_ms)
        return launcher.launch(args)
    },
    followUp: async (args) => {
        log(`[luca-run] ${args.role} on #${args.ticket} (follow-up)`)
        await Bun.sleep(delay_ms)
        return launcher.followUp(args)
    },
    closeSession: (args) => launcher.closeSession(args),
})

/**
 * The demo's Jev: the real client with no key, so every ask is journaled as
 * `jev_failed` (`missing_key`) and nothing is sent, as in a real run without
 * `TYPESAFE_API_KEY`.
 */
const OFFLINE_JEV: JevShadow = { client: createTypeSafeJev({ api_key: '' }) }

/**
 * A practice run, safe to try the board with: a throwaway repo with a local
 * bare origin in a temp folder, the practice spec with two tickets (#12
 * blocked by #11) in an in-memory tracker, and scripted agents that take
 * `turn_delay_ms` per turn. No GitHub, no models, no network: Jev is asked in
 * shadow mode with no key, and memory (#370) is a fake MuninnDB seeded with
 * a few memories, so the board shows searches, the learner, and a save
 * with nothing leaving the machine. The temp folder (which also holds the run's
 * journal) is removed at the end.
 *
 * @returns The run's end, the PRs the in-memory tracker opened, and the
 * (removed) temp folder.
 *
 * @example
 * const { ok, pull_requests } = await runDemo({ run_id, board: null, log: console.log, turn_delay_ms: DEMO_TURN_DELAY_MS })
 */
export const runDemo = async ({
    run_id,
    board,
    log,
    turn_delay_ms,
}: {
    run_id: string
    board: BoardSync | null
    log: (line: string) => void
    turn_delay_ms: number
}): Promise<
    RunEnd & { pull_requests: InMemoryPullRequest[]; root: string }
> => {
    const root = await mkdtemp(join(tmpdir(), 'luca-demo-'))
    try {
        const { repo, origin } = await makePracticeRepo({ root })
        const journal = createJournal({
            file: runJournalPath({ runs_dir: join(root, 'runs'), run_id }),
        })
        log(`[luca-run] demo run ${run_id} in ${root}`)
        log(`[luca-run] repo: ${repo}`)
        log(`[luca-run] origin: ${origin}`)
        log(`[luca-run] journal: ${journal.file}`)
        const loaded = await loadEngineConfig({ repo_root: repo })
        if (!loaded.ok) throw new Error(loaded.error)
        const tracker = demoTracker()
        startRun({
            journal,
            spec_number: PRACTICE_SPEC_NUMBER,
            config: loaded.config,
            base_branch: 'main',
            memory: { project_vault: null },
            repo,
        })
        const memory = { client: demoMuninn() }
        const launcher = slowLauncher({
            launcher: createScriptedLauncher({
                turns: DEMO_TURNS,
            }),
            delay_ms: turn_delay_ms,
            log,
        })
        const end = await driveRun({
            journal,
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
                    jev: OFFLINE_JEV,
                    memory,
                    board: board ?? undefined,
                }),
        })
        return { ...end, pull_requests: tracker.pullRequests(), root }
    } catch (error) {
        const end = {
            ok: false,
            message: `The demo crashed: ${errorText(error)}`,
        }
        log(`[luca-run] stopped: ${end.message}`)
        await board?.end(end)
        return { ...end, pull_requests: [], root }
    } finally {
        await rm(root, { recursive: true, force: true })
        log(`[luca-run] removed ${root}`)
    }
}
