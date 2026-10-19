/**
 * How a run ends for the person watching it: what a run's last action means
 * (`RunEnd`), how to go on from its journal (`resumeCommand`), and driving the
 * engine to its end without ever throwing (`driveRun`).
 */
import type { AgentLauncher } from '../agents/agent-launcher'
import type { BoardSync } from '../board/board-sync'
import type { EngineAction } from '../core/decide'
import { nothingToDoText } from '../core/left-out'
import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import type { MemoryDeps } from '../memory/memory-client'

/** How a `luca-run` process ended; the board gets it as `ended`. */
export type RunEnd = { ok: boolean; message: string }

/**
 * An agent launcher a run may close at its end, such as the Claude launcher,
 * which keeps sessions open for follow-ups.
 */
export type RunLauncher = AgentLauncher & { closeAll?: () => Promise<void> }

/** An error's message, or any other thrown value as text. */
export const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/**
 * What a run's last action means for the person watching it. A run with
 * nothing to do says why, from its `nothing_to_do` record in `records`.
 */
const endOf = ({
    action,
    records,
}: {
    action: EngineAction
    records: JournalRecord[]
}): RunEnd => {
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
        case 'nothing_to_do': {
            const end = records.findLast(
                (record) => record.kind === 'nothing_to_do'
            )
            return {
                ok: true,
                message: nothingToDoText({
                    content:
                        end?.kind === 'nothing_to_do'
                            ? end.content
                            : {
                                  closed_tickets: [],
                                  already_done: [],
                                  left_out: [],
                              },
                }),
            }
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
 * How to go on with run `run_id` from its journal: `/luca-run resume <id>`
 * in Paseo when the board plugin started it (so the board shows it live),
 * else `luca-run --resume <id>`. Pure.
 *
 * @example
 * resumeCommand({ run_id: 'r1', board: true }) // 'type /luca-run resume r1 in a Paseo chat'
 * resumeCommand({ run_id: 'r1', board: false }) // 'run luca-run --resume r1'
 */
export const resumeCommand = ({
    run_id,
    board,
}: {
    run_id: string
    board: boolean
}): string =>
    board
        ? `type /luca-run resume ${run_id} in a Paseo chat`
        : `run luca-run --resume ${run_id}`

/** `text` as a sentence, then `more`. Pure. */
const thenSay = ({ text, more }: { text: string; more: string }): string =>
    `${text}${/[.!?]$/.test(text) ? '' : '.'} ${more}`

/**
 * Runs the engine to its end and turns what happened into a `RunEnd`, then
 * closes the launcher's open sessions and tells the board. A crash is caught
 * and reported, never thrown. With `run_id`, a crash or a launcher stop says
 * how to go on from the journal (see `resumeCommand`).
 */
export const driveRun = async ({
    journal,
    run,
    run_id,
    launcher,
    memory,
    board,
    log,
}: {
    journal: Journal
    run: () => Promise<EngineAction>
    /** The run's id, or `null` for one that can't go on again (the demo). */
    run_id: string | null
    launcher: RunLauncher
    /** Closed at the end too. */
    memory?: MemoryDeps
    board: BoardSync | null
    log: (line: string) => void
}): Promise<RunEnd> => {
    let end: RunEnd
    try {
        const action = await run()
        end = endOf({ action, records: journal.read() })
    } catch (error) {
        const message = errorText(error)
        // A launcher stop is journaled as run_stopped, then thrown.
        const stopped = message.startsWith('Run stopped:')
        const text = stopped ? message : `The engine crashed: ${message}`
        if (run_id === null) {
            end = { ok: false, message: text }
        } else {
            const how = resumeCommand({ run_id, board: board !== null })
            end = {
                ok: false,
                message: thenSay({
                    text,
                    more: stopped
                        ? `Fix that, then, to go on from its journal, ${how}.`
                        : `To go on from its journal, ${how}.`,
                }),
            }
        }
    } finally {
        await launcher.closeAll?.()
        await memory?.client.close().catch(() => undefined)
    }
    log(`[luca-run] ${end.ok ? 'finished' : 'stopped'}: ${end.message}`)
    await board?.end({ records: journal.read(), ...end })
    return end
}
