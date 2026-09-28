import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import {
    BOARD_MAX_AUTO_RESTARTS,
    liveRunIds,
    type ListProcesses,
} from './live-runs'
import { readRunStart, restartableRuns, type RestartableRun } from './run-modes'

import { boardStateDir } from '../board/board-state-dir'
import { decide } from '../core/decide'
import { STOP_ACTIONS } from '../core/execute'
import { createJournal, runJournalPath } from '../journal/journal'

/**
 * The runs that are going, for the commands that must not change Luca under
 * them (`luca upgrade`), and the unfinished runs whose engine is gone, which
 * can go on later on any version.
 */

/**
 * The board's run registry: `runs.json` in the board's state folder (see
 * `boardStateDir`), as the board plugin keeps it.
 */
export const defaultRegistryPath = ({
    env,
    home_dir,
}: {
    env: Record<string, string | undefined>
    home_dir: string
}): string => join(boardStateDir({ env, home_dir }), 'runs.json')

/**
 * Why a run counts as going, or `engine_gone` for an unfinished run nothing
 * runs now:
 *
 * - `engine_running`: `ps` shows its engine.
 * - `board_will_restart`: its engine is gone, but the board plugin will
 *   restart it (its registry entry hasn't ended and has restarts left).
 * - `not_checked`: `ps` failed, so it counts as going to be safe.
 * - `engine_gone`: not running, and the board won't restart it.
 */
export type RunState =
    | 'engine_running'
    | 'board_will_restart'
    | 'not_checked'
    | 'engine_gone'

/** An unfinished run, by spec and repo. */
export type GoingRun = {
    run_id: string
    /** `null` for a demo run. */
    spec: number | null
    /** `null` in journals from before the repo was kept. */
    repo: string | null
    /** Whether the board plugin started it (it is in the board's registry). */
    board: boolean
    state: RunState
}

const RegistrySchema = z.object({
    runs: z.array(
        z.object({
            run_id: z.string(),
            repo: z.string(),
            spec: z.number().nullable(),
            demo: z.boolean().default(false),
            ended: z.unknown().nullable().default(null),
            restarts: z.number().default(0),
        })
    ),
})

type RegistryEntry = z.infer<typeof RegistrySchema>['runs'][number]

/** Whether run `run_id` has a journal in `runs_dir` whose run is over. */
const journalIsOver = ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}): boolean => {
    const file = runJournalPath({ runs_dir, run_id })
    if (!existsSync(file)) return false
    try {
        const records = createJournal({ file }).read()
        return records.length > 0 && STOP_ACTIONS.has(decide({ records }).type)
    } catch {
        return false
    }
}

/** The board registry's runs; none when it has no file yet. */
const readRegistry = async ({
    registry_path,
}: {
    registry_path: string
}): Promise<
    { ok: true; entries: RegistryEntry[] } | { ok: false; error: string }
> => {
    const file = Bun.file(registry_path)
    if (!(await file.exists())) return { ok: true, entries: [] }
    let parsed
    try {
        parsed = RegistrySchema.safeParse(JSON.parse(await file.text()))
    } catch (error) {
        return {
            ok: false,
            error: `The board's run registry ${registry_path} is not JSON: ${String(error)}`,
        }
    }
    if (!parsed.success) {
        return {
            ok: false,
            error: `The board's run registry ${registry_path} is not valid: ${z.prettifyError(parsed.error)}`,
        }
    }
    return { ok: true, entries: parsed.data.runs }
}

/** An unfinished run before its engine is checked. */
type Candidate = {
    run_id: string
    spec: number | null
    repo: string | null
    /** What its journal says (`null` with no journal to go on from). */
    reason: RestartableRun['reason'] | null
    entry: RegistryEntry | null
}

/**
 * Whether the board plugin will restart a run whose engine is gone: the
 * plugin started it, its entry hasn't ended, it isn't a demo, it has
 * restarts left, and its journal can go on. Pure.
 */
const boardWillRestart = ({ candidate }: { candidate: Candidate }) =>
    candidate.entry !== null &&
    candidate.entry.ended === null &&
    !candidate.entry.demo &&
    candidate.entry.restarts < BOARD_MAX_AUTO_RESTARTS &&
    candidate.reason === 'resumable'

/**
 * The unfinished runs: every journal in `runs_dir` whose run is not over
 * (limit waits and stuck runs waiting for a reply included), and every run
 * in the board registry at `registry_path` that has not ended and whose
 * journal, if any, is not over. Each is then checked with `ps` (see
 * `liveRunIds`):
 *
 * - `runs`: the going ones. A run is going when its engine is running, or
 *   when its engine is gone but the board will restart it. When `ps` fails,
 *   every unfinished run is going, and `ps_error` says why.
 * - `stopped`: the rest that can go on from their journal (a crash or a
 *   launcher stop). Nothing runs them now, so they can wait for a resume on
 *   any version. A billing stop never goes on, so it is in neither list.
 *
 * An error when the registry can't be read.
 *
 * @example
 * const going = await goingRuns({ runs_dir: defaultRunsDir(), registry_path, list_processes: listProcesses })
 * if (going.ok) console.log(going.runs.map(({ spec }) => spec))
 */
export const goingRuns = async ({
    runs_dir,
    registry_path,
    list_processes,
}: {
    runs_dir: string
    registry_path: string
    list_processes: ListProcesses
}): Promise<
    | {
          ok: true
          runs: GoingRun[]
          stopped: GoingRun[]
          /** Why `ps` failed, or `null` when it worked. */
          ps_error: string | null
      }
    | { ok: false; error: string }
> => {
    const registry = await readRegistry({ registry_path })
    if (!registry.ok) return registry
    const entries = new Map(
        registry.entries.map((entry) => [entry.run_id, entry])
    )

    const candidates: Candidate[] = restartableRuns({ runs_dir }).map(
        ({ run_id, reason }) => {
            const start = readRunStart({ runs_dir, run_id })
            const entry = entries.get(run_id) ?? null
            return {
                run_id,
                spec: start.ok
                    ? start.start.spec_number
                    : (entry?.spec ?? null),
                repo: start.ok ? start.start.repo : (entry?.repo ?? null),
                reason,
                entry,
            }
        }
    )
    const known = new Set(candidates.map(({ run_id }) => run_id))
    for (const entry of registry.entries) {
        if (entry.ended !== null || known.has(entry.run_id)) continue
        if (journalIsOver({ runs_dir, run_id: entry.run_id })) continue
        known.add(entry.run_id)
        candidates.push({
            run_id: entry.run_id,
            spec: entry.spec,
            repo: entry.repo,
            reason: null,
            entry,
        })
    }

    const runOf = ({
        candidate,
        state,
    }: {
        candidate: Candidate
        state: RunState
    }): GoingRun => ({
        run_id: candidate.run_id,
        spec: candidate.spec,
        repo: candidate.repo,
        board: candidate.entry !== null,
        state,
    })

    let live: Set<string>
    try {
        live = liveRunIds({ command_lines: await list_processes() })
    } catch (error) {
        // Never guess: an upgrade under a live engine is far worse than a
        // refused one.
        return {
            ok: true,
            runs: candidates.map((candidate) =>
                runOf({ candidate, state: 'not_checked' })
            ),
            stopped: [],
            ps_error: error instanceof Error ? error.message : String(error),
        }
    }

    const runs: GoingRun[] = []
    const stopped: GoingRun[] = []
    for (const candidate of candidates) {
        if (live.has(candidate.run_id)) {
            runs.push(runOf({ candidate, state: 'engine_running' }))
        } else if (boardWillRestart({ candidate })) {
            runs.push(runOf({ candidate, state: 'board_will_restart' }))
        } else if (
            candidate.reason === 'resumable' ||
            candidate.reason === 'launcher_stopped'
        ) {
            stopped.push(runOf({ candidate, state: 'engine_gone' }))
        }
    }
    return { ok: true, runs, stopped, ps_error: null }
}

/**
 * One unfinished run as a list line, with why it is going when its engine
 * isn't running. Pure.
 *
 * @example
 * describeRun({ run_id: 'r1', spec: 5, repo: '/code/app', board: false, state: 'engine_running' })
 * // '- spec #5 in /code/app (run r1)'
 */
export const describeRun = ({ run_id, spec, repo, state }: GoingRun): string =>
    `- ${spec === null ? 'a demo' : `spec #${spec}`} in ${repo ?? 'an unknown repo'} (run ${run_id})${state === 'board_will_restart' ? ': its engine is gone, and the board will restart it' : ''}`
