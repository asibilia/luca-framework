import { type Harness } from './testing/board-harness'
import { intakeOfThree, stamp, type Entry } from './testing/journal-fixtures'

import type { EngineRecord } from '../shared/board-rpc'

/**
 * Helpers shared by the current step tests (`current-step-panel.test.ts` and
 * the `current-step-panel-*.test.ts` files beside it).
 *
 * The pure helpers that build and read journal records and the run header
 * row. Each test file keeps its own `harness`, `extra`, `dirs`, and
 * `runWith`, because the tests start boards of their own.
 */

/**
 * `step_started` as the engine journals it: `key` is the ticket's number,
 * or `run` for the run's own steps; `step` is the action type, plus
 * `:<role>` for an agent's turn.
 */
export const stepStarted = ({
    ticket,
    step,
    role = null,
    first_seq = null,
}: {
    ticket: number | null
    step: string
    role?: string | null
    first_seq?: number | null
}): Entry => ({
    kind: 'step_started',
    ticket,
    role,
    content: {
        key: ticket === null ? 'run' : String(ticket),
        step,
        first_seq,
    },
})

/** `step_ended` as the engine journals it once the step settles. */
export const stepEnded = ({
    ticket,
    step,
    role = null,
}: {
    ticket: number | null
    step: string
    role?: string | null
}): Entry => ({
    kind: 'step_ended',
    ticket,
    role,
    content: { key: ticket === null ? 'run' : String(ticket), step },
})

/** The journal: three tickets through intake, then `entries`. */
export const journalWith = ({
    entries,
}: {
    entries: Entry[]
}): EngineRecord[] => stamp({ entries: [...intakeOfThree(), ...entries] })

/** The stamped time of the record at `seq`. */
export const timeOf = ({
    records,
    seq,
}: {
    records: EngineRecord[]
    seq: number
}): string => {
    const found = records.find((record) => record.seq === seq)
    if (!found) throw new Error(`no record ${seq}`)
    return found.time
}

/** The seq of the last record of `kind` whose content has `step`. */
export const lastStepSeq = ({
    records,
    kind,
    step,
    ticket,
}: {
    records: EngineRecord[]
    kind: string
    step: string
    ticket: number | null
}): number => {
    const found = records.findLast(
        (record) =>
            record.kind === kind &&
            record.ticket === ticket &&
            (record.content as { step: string }).step === step
    )
    if (!found) throw new Error(`no ${kind} for ${step}`)
    return found.seq
}

/** The run's header row as the chat shows it now. */
export const headerOf = ({ board }: { board: Harness }) => {
    const found = board
        .latestRows()
        .find(({ row }) => row.kind === 'luca-board-run')
    if (!found || found.row.kind !== 'luca-board-run') {
        throw new Error('no header row')
    }
    return found.row.data
}
