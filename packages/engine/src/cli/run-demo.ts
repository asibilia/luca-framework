/**
 * The practice run, `luca-run --demo` (`runDemo`): a throwaway repo, scripted
 * agents, and a fake MuninnDB, safe to try the board with.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { errorText, driveRun, type RunEnd } from './run-end'

import type { AgentLauncher } from '../agents/agent-launcher'
import { createScriptedLauncher } from '../agents/scripted-launcher'
import type { BoardSync } from '../board/board-sync'
import { loadEngineConfig } from '../config/engine-config'
import { runEngine, startRun } from '../core/execute'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal, runJournalPath } from '../journal/journal'
import {
    DEMO_TURNS,
    demoMuninn,
    demoTracker,
    makePracticeRepo,
    PRACTICE_SPEC_NUMBER,
} from '../testing/practice-run'
import type { InMemoryPullRequest } from '../tracker/in-memory-tracker'

/** How long each scripted agent turn of the demo takes, so the board is watchable. */
export const DEMO_TURN_DELAY_MS = 1500

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
 * A practice run, safe to try the board with: a throwaway repo with a local
 * bare origin in a temp folder, the practice spec with two tickets (#12
 * blocked by #11) in an in-memory tracker, and scripted agents that take
 * `turn_delay_ms` per turn. No GitHub, no models, no network: the decision
 * model is off (its credentials are never read), and memory (#370) is a fake MuninnDB seeded with
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
        log('[luca-run] decision model off: the demo never asks it.')
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
            // A demo's journal is in a temp folder that is removed at its end.
            run_id: null,
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
