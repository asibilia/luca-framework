import omit from 'lodash/omit'

import type {
    InterruptedStep,
    JournalEntry,
    JournalRecord,
} from './journal-record'

/**
 * Crashes in a row on one scheduler key: the step they cut off, how many
 * times, and the seq of that step's first try (its first `step_started`).
 */
export type StepCrashes = { step: string; count: number; first_seq: number }

/** Crashes in a row, per scheduler key. */
export type CrashCounts = Record<string, StepCrashes>

/**
 * The crash counts after one record. A `run_resumed` adds 1 for each step
 * it names when the key's count is for the same step (keeping its first
 * try's seq), else starts the count at 1. A `step_ended` clears its key.
 * Other records change nothing.
 *
 * @example
 * const crashes = records.reduce((crashes, record) => crashesAfter({ crashes, record }), {})
 */
export const crashesAfter = ({
    crashes,
    record,
}: {
    crashes: CrashCounts
    record: JournalRecord
}): CrashCounts => {
    if (record.kind === 'step_ended') return omit(crashes, record.content.key)
    if (record.kind !== 'run_resumed') return crashes
    return record.content.interrupted.reduce(
        (counts, { key, step, started_seq, first_seq }): CrashCounts => {
            const known = counts[key]
            return {
                ...counts,
                [key]:
                    known?.step === step
                        ? { ...known, count: known.count + 1 }
                        : {
                              step,
                              count: 1,
                              first_seq: first_seq ?? started_seq,
                          },
            }
        },
        crashes
    )
}

/**
 * The `first_seq` for a new `step_started`: the seq of the step's first try
 * when a crash cut off an earlier try of this same step on this key, else
 * `null` (this is the first try).
 *
 * @example
 * stepFirstSeq({ crashes: state.crashes, key: '11', step: 'report_stuck' }) // 42 on a redo
 */
export const stepFirstSeq = ({
    crashes,
    key,
    step,
}: {
    crashes: CrashCounts
    key: string
    step: string
}): number | null => {
    const known = crashes[key]
    return known?.step === step ? known.first_seq : null
}

/**
 * The steps a crash cut off: each `step_started` with no later
 * `step_ended` for its key. A `run_resumed` already names the steps it
 * lists, so a crash before their redo starts is not counted twice.
 */
const interruptedSteps = ({
    records,
}: {
    records: JournalRecord[]
}): InterruptedStep[] => {
    const open = new Map<string, InterruptedStep>()
    for (const record of records) {
        switch (record.kind) {
            case 'step_started':
                open.set(record.content.key, {
                    key: record.content.key,
                    step: record.content.step,
                    ticket: record.ticket,
                    role: record.role,
                    started_seq: record.seq,
                    first_seq: record.content.first_seq,
                })
                break
            case 'step_ended':
                open.delete(record.content.key)
                break
            case 'run_resumed':
                for (const { key, started_seq } of record.content.interrupted) {
                    if (open.get(key)?.started_seq === started_seq) {
                        open.delete(key)
                    }
                }
                break
        }
    }
    return [...open.values()]
}

/**
 * The `run_resumed` entry a starting engine appends before its first step,
 * or `null` when no step was cut off by a crash. Pure, so a decision-step
 * test can cut a journal anywhere, append this, and decide.
 *
 * @example
 * const resumed = resumeEntry({ records: journal.read() })
 * if (resumed !== null) journal.append(resumed)
 */
export const resumeEntry = ({
    records,
}: {
    records: JournalRecord[]
}): JournalEntry | null => {
    const interrupted = interruptedSteps({ records })
    if (interrupted.length === 0) return null
    return {
        kind: 'run_resumed',
        ticket: null,
        role: null,
        content: { interrupted },
    }
}
