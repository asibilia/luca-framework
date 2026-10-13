import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import {
    ArmSchema,
    RowSchema,
    type Arm,
    type Row,
    type Trigger,
    type TriggerResult,
} from './case-schema'

/** Why a run that was graded again has no wall time we can trust. */
export const WALL_UNKNOWN_REASON = 'wall time unknown: re-run this run'

/** Why a run folder with no `out/row.json` is in the report. */
export const UNFINISHED_REASON = 'unfinished: no row.json'

/** Why a run whose stream has no `result` event is invalid. */
export const NO_RESULT_REASON = 'the run did not finish: no result event'

const ResultEventSchema = z.object({ type: z.literal('result') })

/**
 * Whether a `stream-json` run ended with a `result` event. A run that was
 * killed (by its time limit or by a crash) never writes one, so it did not
 * finish and must not be scored as a real zero.
 *
 * @param text - The run's `stream.jsonl`, one JSON event per line. Lines that aren't JSON are ignored.
 *
 * @example
 * ```typescript
 * hasResultEvent({ text: '{"type":"result","is_error":false}\n' }) // true
 * hasResultEvent({ text: '{"type":"assistant"}\n' }) // false
 * ```
 */
export const hasResultEvent = ({ text }: { text: string }): boolean =>
    text.split('\n').some((line) => {
        try {
            return ResultEventSchema.safeParse(JSON.parse(line)).success
        } catch {
            return false
        }
    })

/**
 * Reads a run folder's name, such as `3B2`: case number 3, setup B, rep 2.
 * Null for any other name (`grader`, `tA1`, `r1-notes`).
 */
export const parseRunFolder = ({
    name,
}: {
    name: string
}): { case_number: string; arm: Arm; rep: number } | null => {
    const match = /^([1-9])([ABC])([1-9][0-9]*)$/.exec(name)
    const arm = ArmSchema.safeParse(match?.[2])
    const case_number = match?.[1]
    if (!arm.success || case_number === undefined) return null
    return { case_number, arm: arm.data, rep: Number(match?.[3]) }
}

/** The case folders in `cases_dir` (such as `3-machine-blamed`), sorted. None when the folder doesn't exist yet. */
export const caseIds = ({ cases_dir }: { cases_dir: string }): string[] =>
    existsSync(cases_dir)
        ? readdirSync(cases_dir)
              .filter((name) => /^[1-9]-/.test(name))
              .sort()
        : []

/**
 * An invalid row for a run folder that has no `out/row.json`, so a run that
 * died part-way shows under "Runs left out" and its case can't drop out of
 * the decision unseen. The case comes from the folder's number, matched
 * against `case_ids`; a number that matches no case becomes `unknown-<n>`.
 * Null when `name` is not a run folder's name.
 *
 * @example
 * ```typescript
 * unfinishedRow({ name: '3B2', case_ids: ['3-machine-blamed'] })
 * // { case_id: '3-machine-blamed', arm: 'B', rep: 2, invalid_reason: 'unfinished: no row.json', ... }
 * ```
 */
export const unfinishedRow = ({
    name,
    case_ids,
}: {
    name: string
    case_ids: string[]
}): Row | null => {
    const parsed = parseRunFolder({ name })
    if (parsed === null) return null
    return RowSchema.parse({
        case_id:
            case_ids.find((id) => id.startsWith(`${parsed.case_number}-`)) ??
            `unknown-${parsed.case_number}`,
        arm: parsed.arm,
        rep: parsed.rep,
        invalid_reason: UNFINISHED_REASON,
        caught: null,
        false_blockers: null,
        leaks: 0,
        cost_units: 0,
        wall_ms: 0,
        claude_code_version: 'unknown',
    })
}

/**
 * The first file `--grade-only` needs that a run folder lacks, as a path
 * under `root`, or null when all are there: the workspace, the baseline
 * hashes, and the saved stream. Checked up front so a half-built run is
 * named in an error instead of crashing deep inside a read.
 */
export const missingGradeOnlyFile = ({
    root,
}: {
    root: string
}): string | null =>
    ['ws', 'out/baseline.json', 'out/stream.jsonl'].find(
        (path) => !existsSync(join(root, path))
    ) ?? null

/**
 * The wall time saved in a run's earlier `row.json`, or null when there is
 * none or it was itself marked unknown: a missing wall time must never turn
 * into a valid 0 that skews the decision's time rule.
 */
export const savedWallMs = ({ row }: { row: Row | null }): number | null =>
    row === null || row.invalid_reason === WALL_UNKNOWN_REASON
        ? null
        : row.wall_ms

/** Whether a finished run counts as a failure for the command's exit code: invalid, or (when grading was asked for) left ungraded. */
export const runFailed = ({
    row,
    grading,
}: {
    row: Row
    grading: boolean
}): boolean => row.invalid_reason !== null || (grading && row.caught === null)

/** The line printed for one finished run. A run that ended with `is_error` says so; it stays valid. */
export const runLine = ({
    row,
    is_error,
}: {
    row: Row
    is_error: boolean
}): string =>
    `${row.case_id} ${row.arm}${row.rep}: ${
        row.invalid_reason ??
        `caught ${row.caught ?? 'ungraded'}, false blockers ${row.false_blockers ?? '?'}, leaks ${row.leaks}, ${row.cost_units} cost units, ${(row.wall_ms / 60_000).toFixed(1)} min`
    }${is_error ? ', is_error true' : ''}`

/**
 * A setup's trigger results, with a placeholder for every prompt it has no
 * result for. The trigger run saves its results after each prompt, so a
 * run that stopped early leaves a short file; the placeholders are invalid
 * runs, so the report fails the trigger test rather than passing on less.
 */
export const completeTriggerResults = ({
    results,
    triggers,
}: {
    results: TriggerResult[]
    triggers: Trigger[]
}): TriggerResult[] =>
    triggers.map(
        (trigger, index): TriggerResult =>
            results[index] ?? {
                prompt: trigger.prompt,
                should_trigger: trigger.should_trigger,
                triggered: false,
                invalid_reason: 'not run: the trigger test stopped early',
            }
    )
