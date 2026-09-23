import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import isEmpty from 'lodash/isEmpty'

import type { AgentLauncher } from '../agents/agent-launcher'
import { createScriptedLauncher } from '../agents/scripted-launcher'
import type { BoardSync } from '../board/board-sync'
import { loadEngineConfig } from '../config/engine-config'
import type { EngineAction } from '../core/decide'
import { runEngine, startRun } from '../core/execute'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal, runJournalPath, type Journal } from '../journal/journal'
import {
    makePracticeRepo,
    PRACTICE_SPEC_NUMBER,
    PRACTICE_TURNS,
    practiceTracker,
    SECOND_TICKET_TURNS,
} from '../testing/practice-run'
import type { InMemoryPullRequest } from '../tracker/in-memory-tracker'
import type { Tracker } from '../tracker/tracker'

/** How a `luca-run` process ended; the board gets it as `ended`. */
export type RunEnd = { ok: boolean; message: string }

/** Why a real run stops once intake passes, until #362 lands. */
export const LAUNCHER_MISSING =
    'Intake passed, but the engine cannot build tickets yet: the Claude agent launcher arrives with #362.'

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
    if (action.type !== 'done') return { ok: false, message: LAUNCHER_MISSING }
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
        case 'stuck':
            return {
                ok: false,
                message: `Ticket #${action.ticket} is stuck (${action.reason}): ${action.detail}`,
            }
    }
}

/**
 * Runs the engine to its end and turns what happened into a `RunEnd`, then
 * tells the board. A crash is caught and reported, never thrown.
 */
const driveRun = async ({
    journal,
    run,
    board,
    log,
}: {
    journal: Journal
    run: () => Promise<EngineAction>
    board: BoardSync | null
    log: (line: string) => void
}): Promise<RunEnd> => {
    let end: RunEnd
    try {
        end = endOf({ action: await run() })
    } catch (error) {
        const message = errorText(error)
        // A resumed journal past intake still needs the launcher.
        end = message.includes('agent launcher')
            ? { ok: false, message: LAUNCHER_MISSING }
            : { ok: false, message: `The engine crashed: ${message}` }
    }
    log(`[luca-run] ${end.ok ? 'finished' : 'stopped'}: ${end.message}`)
    await board?.end({ records: journal.read(), ...end })
    return end
}

/**
 * A real run of `spec_number` on `repo`: loads the repo's engine config,
 * opens (or resumes) the run's journal at `<runs_dir>/<run_id>`, and runs the
 * engine with the board kept in step. Never throws; the board always gets
 * the run's end.
 *
 * With no `launcher` (the real Claude launcher is #362), the run stops once
 * intake passes, with `LAUNCHER_MISSING`.
 *
 * @example
 * const end = await runSpec({
 *     spec_number: 374, repo: '/code/app', run_id, base_branch: null,
 *     runs_dir: defaultRunsDir(), tracker: createGitHubTracker({ repo: 'acme/app' }),
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
    launcher?: AgentLauncher
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
        })
    } else {
        log('[luca-run] resuming the run from its journal')
    }
    return driveRun({
        journal,
        board,
        log,
        run: () =>
            runEngine({
                journal,
                tracker,
                git: createGitAdapter({ repo_root: repo }),
                launcher,
                board: board ?? undefined,
                // Without a launcher, stop before touching git.
                stop_before:
                    launcher === undefined ? ['create_run_branch'] : [],
            }),
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
})

/**
 * A practice run, safe to try the board with: a throwaway repo with a local
 * bare origin in a temp folder, the practice spec with two tickets (#12
 * blocked by #11) in an in-memory tracker, and scripted agents that take
 * `turn_delay_ms` per turn. No GitHub, no models. The temp folder (which
 * also holds the run's journal) is removed at the end.
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
        const tracker = practiceTracker({ second_ticket: true })
        startRun({
            journal,
            spec_number: PRACTICE_SPEC_NUMBER,
            config: loaded.config,
            base_branch: 'main',
        })
        const end = await driveRun({
            journal,
            board,
            log,
            run: () =>
                runEngine({
                    journal,
                    tracker,
                    git: createGitAdapter({ repo_root: repo }),
                    launcher: slowLauncher({
                        launcher: createScriptedLauncher({
                            turns: [...PRACTICE_TURNS, ...SECOND_TICKET_TURNS],
                        }),
                        delay_ms: turn_delay_ms,
                        log,
                    }),
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
