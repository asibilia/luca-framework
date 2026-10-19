import { createHarness, type Harness } from './testing/board-harness'
import {
    agentFinished,
    agentStarted,
    gatesRun,
    intakeOfThree,
    redCheck,
    sessionOf,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

/**
 * Helpers shared by the panel state tests (`board-panel-state.test.ts` and
 * the `board-panel-state-*.test.ts` files beside it).
 *
 * The harness is the one the running test started; `runWith` sets it, and
 * each test file cleans it up after every test.
 */

export let harness: Harness

/** Starts a run and sends intake plus `entries` in one go. */
export const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    const reply = await harness.send({
        run_id,
        token,
        entries: [...intakeOfThree(), ...entries],
    })
    return { run_id, token, reply, next: reply.next_seq }
}

export const rowsOfKind = ({ kind }: { kind: string }) =>
    harness.latestRows().filter(({ row }) => row.kind === kind)

/** The chat's event rows, as text and tone, oldest first. */
export const eventRows = () =>
    harness
        .latestRows()
        .flatMap(({ row }) =>
            row.kind === 'luca-board-event'
                ? [{ text: row.data.text, tone: row.data.tone }]
                : []
        )

/** Gates that failed, then the implementer's follow-up in its session. */
export const failedGatesRound = ({ ticket }: { ticket: number }): Entry[] => [
    gatesRun({ ticket, ok: false }),
    agentStarted({
        ticket,
        role: 'implementer',
        follow_up_of: sessionOf({ ticket, role: 'implementer' }),
    }),
    agentFinished({ ticket, role: 'implementer' }),
]

/** Ticket 13 up to its first implementer result. */
export const codedTicket13 = (): Entry[] => [
    ticketWorktreeCreated({ ticket: 13 }),
    agentStarted({ ticket: 13, role: 'test-writer' }),
    agentFinished({ ticket: 13, role: 'test-writer' }),
    redCheck({ ticket: 13, ok: true, failing: 1, passing: 3 }),
    agentStarted({ ticket: 13, role: 'implementer' }),
    agentFinished({ ticket: 13, role: 'implementer' }),
]
