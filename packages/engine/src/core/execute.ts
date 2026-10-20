/**
 * `runEngine`: the scheduler that runs the decision step's actions, tickets'
 * steps at the same time. Re-exports the run's first records and
 * `executeAction` from the modules that carry them out.
 */
import { decideNext, type EngineAction } from './decide'
import { repoWaitUnchecked } from './decide-repo-wait'
import { executeAction, type StepTry } from './execute-action'
import type { BuildDeps } from './execute-build'
import { readEarlierRuns, type GoingRunsReader } from './execute-repo-wait'
import { executeWithJev } from './execute-with-jev'
import { createLiveFile } from './live-file'
import {
    agentRoleOf,
    crashesIn,
    followUpSessionOf,
    keyOf,
    redosFirst,
    SLOW_ACTIONS,
    stepOf,
    ticketOf,
    usesRunBranch,
    WAIT_ACTIONS,
} from './schedule-rules'
import {
    closeSessions,
    finishedSessions,
    openSessionsIn,
} from './session-close'

import type { BoardSync } from '../board/board-sync'
import { hearSlotWaits } from '../gates/slot-waits'
import { shadowAsker, type JevShadow } from '../jev/jev-shadow'
import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import {
    resumeEntry,
    stepFirstSeq,
    type CrashCounts,
} from '../journal/step-records'
import type { EngineClock } from '../limits/limit-wait'
import { runReadings, type UsageLineDeps } from '../limits/usage-line'
import type { MemoryDeps } from '../memory/memory-client'
import type { Tracker } from '../tracker/tracker'

export { executeAction, type StepTry } from './execute-action'
export { refusalComment } from './execute-intake'
export { recordConfigReload, recordResume, startRun } from './run-start'
export { keyOf, stepOf } from './schedule-rules'

/** How many actions `runEngine` takes before it gives up, as a safety net. */
export const DEFAULT_MAX_STEPS = 1000

/** Actions that end `runEngine`'s loop: the run is over. */
export const STOP_ACTIONS: ReadonlySet<EngineAction['type']> = new Set([
    'done',
    'invalid_journal',
])

/** One action the engine started and has not seen settle yet. */
type InFlight = { action: EngineAction; done: Promise<void> }

/**
 * Runs the engine: a scheduler over the decision step. Each pass it decides
 * every action that can run now from the journal and starts those it can,
 * so tickets build at the same time; then it waits for any one to settle
 * and decides again, until the run is done: refused, nothing to do, its PR
 * opened, stopped by the owner's `stop`, or every ticket skipped. Building tickets needs `git` and `launcher`. Safe to
 * call on a journal left by a crashed engine; it picks up where the journal
 * ends.
 *
 * A stuck ticket is told to the spec issue while the other tickets keep
 * building; the engine then reads the spec issue every `reply_poll_ms`
 * for the owner's reply, with no time limit, and acts on it (see
 * `decide-stuck.ts`). Reply waits don't count towards `max_steps`.
 *
 * What may run together: one action per ticket; one reply action at a
 * time; a run-level action (the run
 * branch, the PR, removing worktrees, intake, a limit wait, a billing stop)
 * only alone, once everything in flight has settled; and one action on
 * the run branch at a time (a new worktree, a join, its gates, a push, a
 * rebase). A stop action waits for everything in flight, then the journal is
 * read again. If an action throws (such as a launcher stop), the rest are
 * let finish, then the first error is thrown. `max_steps` counts the actions
 * started.
 *
 * With `jev`, the decision model is asked around each step in **shadow
 * mode** and its answers are journaled but never acted on (see
 * `shadowAsker`; a rejected token turns it off for the rest of this call).
 * Without it, nothing changes.
 *
 * With `memory`, a run whose `run_started` turned memory on searches
 * MuninnDB at each recall point and saves the learner's memories at its
 * end (#370). A MuninnDB that errors or hangs is journaled and the run goes
 * on.
 *
 * With `board`, the whole journal is sent to the board once before the
 * first step and again after each step settles.
 *
 * A ticket held on purpose between steps (another ticket's shared
 * baseline, the join queue, the start queue) gets one `ticket_waiting` as
 * its wait starts, from the same decision as the steps (`decideNext`),
 * sent to the board at once.
 *
 * A rejected plan limit is a limit wait: the engine sleeps by `clock` until
 * the window resets, then carries on. Overage or a billing error ends the
 * run for good (`done`, outcome `stopped`).
 *
 * With `usage`, the run keeps below the **usage line**: before each
 * decision it shares its readings with every run, reads the newest shared
 * ones and the lines, and pauses at a line (see `decide-usage-line.ts`).
 *
 * With `going_runs`, a run started while an earlier run on the same repo
 * is going waits for it before intake: a **repo wait** (see
 * `decide-repo-wait.ts`).
 *
 * With `live_file`, the engine keeps the run's live file there while it
 * runs (`live-file.ts`, #628): what each agent in a turn is doing now,
 * never journaled, and each ticket check's wait for a prepare slot or a
 * test slot while it lasts (#632). It is written a last time, with no
 * agents, at the end.
 *
 * Crash recovery: every step it starts (not a wait) is journaled between a
 * `step_started` and a `step_ended` (none when the step throws). On start,
 * a step with no `step_ended` was cut off by a crash: one `run_resumed`
 * names them (`resumeEntry`), and each is taken again, an agent's turn in a
 * fresh session. A redo's `step_started` carries its first try's seq in
 * `first_seq`. The same step cut off `MAX_CRASHES` times in a row is not
 * taken again (see `decide-crashes.ts`).
 *
 * Agents' sessions close as soon as nothing can send them a follow-up
 * (`finishedSessions`): before each decision, the engine closes them with
 * the launcher and journals each as `agent_session_closed`. A run that ends
 * (`done`, or a thrown error) closes every session still open.
 *
 * @returns The action the loop stopped on.
 */
export const runEngine = async ({
    journal,
    tracker,
    max_steps,
    stop_before,
    git,
    launcher,
    jev,
    board,
    clock,
    reply_poll_ms,
    memory,
    usage,
    going_runs,
    live_file,
}: Partial<BuildDeps> & {
    journal: Journal
    tracker: Tracker
    /** Defaults to `DEFAULT_MAX_STEPS`. */
    max_steps?: number
    /** Action types to stop at without carrying them out, such as in tests. */
    stop_before?: EngineAction['type'][]
    /** The decision model in shadow mode. Leave it out to run without one. */
    jev?: JevShadow
    /** Sends the journal to the board after every step. Never throws. */
    board?: BoardSync
    /** Limit and reply waits sleep by it. Defaults to `SYSTEM_CLOCK`; tests fake it. */
    clock?: EngineClock
    /** How long each wait for a reply sleeps. Defaults to `REPLY_POLL_MS`. */
    reply_poll_ms?: number
    /**
     * The memory client (MuninnDB) for a run whose `run_started` turned
     * memory on (#370). Its errors and timeouts are journaled, never thrown.
     */
    memory?: MemoryDeps
    /** The usage lines and the shared readings. Left out, there is no usage line. */
    usage?: UsageLineDeps
    /**
     * Lists the unfinished runs (`goingRuns`), for the repo wait before
     * intake. Left out, there is no repo wait.
     */
    going_runs?: GoingRunsReader
    /**
     * Where to keep the run's live file (#628), such as
     * `runLiveFilePath({ runs_dir, run_id })`. Left out, there is none.
     */
    live_file?: string
}): Promise<EngineAction> => {
    const limit = max_steps ?? DEFAULT_MAX_STEPS
    const stops = new Set([...STOP_ACTIONS, ...(stop_before ?? [])])
    const live =
        live_file === undefined ? null : createLiveFile({ file: live_file })
    const build =
        git === undefined || launcher === undefined
            ? undefined
            : { git, launcher: live?.launcher(launcher) ?? launcher }
    const inFlight = new Map<string, InFlight>()
    let started = 0
    // The run's own asker, so turning the decision model off lasts this run.
    const ask = jev === undefined ? undefined : shadowAsker({ jev, journal })

    const execute = (action: EngineAction, step?: StepTry): Promise<void> =>
        ask === undefined
            ? executeAction({
                  action,
                  journal,
                  tracker,
                  build,
                  clock,
                  reply_poll_ms,
                  memory,
                  step,
                  read_usage_lines: usage?.read_lines,
                  going_runs,
              })
            : executeWithJev({
                  ask,
                  action,
                  journal,
                  tracker,
                  build,
                  clock,
                  reply_poll_ms,
                  memory,
                  step,
                  read_usage_lines: usage?.read_lines,
                  going_runs,
              })

    /**
     * The decision step, with the usage line when the run has one, and the
     * earlier runs on the repo while the run has yet to look for them.
     */
    const decideNow = async (
        records: JournalRecord[]
    ): Promise<ReturnType<typeof decideNext>> => {
        const earlier_runs =
            going_runs !== undefined && repoWaitUnchecked({ records })
                ? (await readEarlierRuns({ going_runs, journal })).runs
                : undefined
        if (usage === undefined) return decideNext({ records, earlier_runs })
        await usage.share(runReadings({ records }))
        return decideNext({
            records,
            usage_lines: await usage.read_lines(),
            shared_readings: await usage.read_shared(),
            earlier_runs,
        })
    }
    const settleAll = () =>
        Promise.allSettled([...inFlight.values()].map(({ done }) => done))
    const canStart = ({ action, key }: { action: EngineAction; key: string }) =>
        !inFlight.has(key) &&
        !inFlight.has('run') &&
        (key !== 'run' || inFlight.size === 0) &&
        !(
            usesRunBranch(action) &&
            [...inFlight.values()].some((running) =>
                usesRunBranch(running.action)
            )
        )

    /**
     * Carries out an action between its step records: `step_started` when
     * it starts, `step_ended` once it settles. Waits get none.
     */
    const runStep = async ({
        action,
        key,
        crashes,
    }: {
        action: EngineAction
        key: string
        crashes: CrashCounts
    }): Promise<void> => {
        if (WAIT_ACTIONS.has(action.type)) return execute(action)
        const step = stepOf(action)
        const who = { ticket: ticketOf(action), role: agentRoleOf(action) }
        const first_seq = stepFirstSeq({ crashes, key, step })
        const started = journal.append({
            kind: 'step_started',
            ...who,
            content: { key, step, first_seq },
        })
        const run = () =>
            execute(action, {
                first_seq: first_seq ?? started.seq,
                redo: first_seq !== null,
            })
        // A ticket's check waiting for a slot shows in the live file (#632).
        await (live === null || who.ticket === null
            ? run()
            : hearSlotWaits({
                  listener: live.slotWaits({ ticket: who.ticket }),
                  run,
              }))
        journal.append({ kind: 'step_ended', ...who, content: { key, step } })
    }

    /**
     * Closes the sessions no follow-up can reach anymore (`all`: every one
     * still open), journaling each close. A follow-up under way keeps its
     * session open.
     */
    const closeFinished = async ({ all }: { all: boolean }): Promise<void> => {
        if (launcher === undefined) return
        const records = journal.read()
        const busy = [...inFlight.values()].flatMap(({ action }) =>
            followUpSessionOf(action)
        )
        await closeSessions({
            journal,
            launcher,
            sessions: all
                ? openSessionsIn({ records })
                : finishedSessions({ records, busy }),
        })
    }

    const loop = async (): Promise<EngineAction> => {
        for (;;) {
            // Before each decision, so no finished agent's session lingers
            // and no fix round goes to a closed one.
            await closeFinished({ all: false })
            const records = journal.read()
            const crashes = crashesIn(records)
            const decided = await decideNow(records)
            const actions = redosFirst({ actions: decided.actions, crashes })
            const stop = actions.find((action) => stops.has(action.type))
            if (stop !== undefined && inFlight.size === 0) {
                if (STOP_ACTIONS.has(stop.type)) {
                    await closeFinished({ all: true })
                }
                return stop
            }
            let slowStarted = false
            let waited = false
            if (stop === undefined) {
                // A wait between steps is journaled once, as it starts, and
                // shows on the board at once: the step it waits on may run
                // for minutes.
                for (const wait of decided.waits) {
                    journal.append({
                        kind: 'ticket_waiting',
                        ticket: wait.ticket,
                        role: null,
                        content: {
                            for: wait.for,
                            on_ticket: wait.on_ticket,
                            since: new Date().toISOString(),
                        },
                    })
                    waited = true
                }
                for (const action of actions) {
                    const key = keyOf(action)
                    if (!canStart({ action, key })) continue
                    // Waiting for a reply has no time limit, so it never counts.
                    const counts = action.type !== 'wait_for_reply'
                    if (counts && started >= limit) {
                        await settleAll()
                        throw new Error(
                            `The engine took ${limit} steps without finishing.`
                        )
                    }
                    if (counts) started += 1
                    const done = runStep({ action, key, crashes }).finally(
                        () => {
                            inFlight.delete(key)
                        }
                    )
                    // Seen by the race below; this keeps a rejection that lands
                    // between races from counting as unhandled.
                    done.catch(() => undefined)
                    inFlight.set(key, { action, done })
                    if (SLOW_ACTIONS.has(action.type)) slowStarted = true
                }
            }
            // A slow step shows on the board while it runs, not only once it
            // ends; so does a wait.
            if (slowStarted || waited) {
                await board?.sync({ records: journal.read() })
            }
            if (inFlight.size === 0) {
                throw new Error(
                    `The engine could start none of: ${actions.map(({ type }) => type).join(', ')}.`
                )
            }
            try {
                // A stop waits for everything in flight; otherwise any one.
                await (stop === undefined
                    ? Promise.race(
                          [...inFlight.values()].map(({ done }) => done)
                      )
                    : Promise.all(
                          [...inFlight.values()].map(({ done }) => done)
                      ))
            } catch (error) {
                await settleAll()
                throw error
            }
            await board?.sync({ records: journal.read() })
        }
    }

    // Steps a crash cut off are named once, before the first step.
    const resumed = resumeEntry({ records: journal.read() })
    if (resumed !== null) journal.append(resumed)
    // A resumed run catches the board up before its first step.
    await board?.sync({ records: journal.read() })
    try {
        return await loop()
    } catch (error) {
        // The run ends here, so no session stays open.
        await closeFinished({ all: true })
        throw error
    } finally {
        live?.close()
    }
}
