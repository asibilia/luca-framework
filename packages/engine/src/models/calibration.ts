import { plural } from './model-score-sides'

import type { JournalRecord } from '../journal/journal-record'

/**
 * The calibration section of `luca models` (#723): how often Clef's answer
 * matches a reference from the journal, per decision model, job and
 * confidence band, with a suggested bar per job. The bar is only printed,
 * never acted on. Pure: it reads records and never writes.
 */

/** The jobs whose answers the journal holds a sound reference for. */
export const CALIBRATED_JOBS = [
    'ticket_order',
    'failure_kind',
    'finding_severity',
] as const

export type CalibratedJob = (typeof CALIBRATED_JOBS)[number]

/** Clef's confidence bands, lowest first; an edge goes to the higher band. */
export const CALIBRATION_BANDS = [
    { band: 'below 0.3', from: 0, below: 0.3 },
    { band: '0.3 to 0.5', from: 0.3, below: 0.5 },
    { band: '0.5 to 0.7', from: 0.5, below: 0.7 },
    { band: '0.7 to 0.9', from: 0.7, below: 0.9 },
    { band: '0.9 and up', from: 0.9, below: Infinity },
] as const

export type CalibrationBandName = (typeof CALIBRATION_BANDS)[number]['band']

/** A band is rated from this many answers. */
export const MIN_ANSWERS = 20

/** One band's answers and how many of them match the reference. */
export type CalibrationBand = {
    band: CalibrationBandName
    answers: number
    right: number
}

export type JobCalibration = {
    job: CalibratedJob
    /** In `CALIBRATION_BANDS`' order. */
    bands: CalibrationBand[]
    /** The lower edge of the last band that held; `null` with none. */
    suggested_bar: number | null
}

/** One decision model's jobs, by its name cut to its last part after `/`. */
export type ModelCalibration = {
    model: string
    jobs: JobCalibration[]
}

/** The index of the band `confidence` falls in. */
const bandAt = (confidence: number): number =>
    Math.max(
        0,
        CALIBRATION_BANDS.findIndex(
            ({ from, below }) => confidence >= from && confidence < below
        )
    )

/**
 * The suggested bar from `bands`, lowest first: walk from the top band
 * down, passing over unrated bands until one holds; stop at a rated band
 * that doesn't hold, or, once one has held, at any band that is unrated or
 * doesn't hold. The bar is the lower edge of the last band that held, else
 * `null`. Pure.
 */
export const suggestedBar = (
    bands: { from: number; rated: boolean; holds: boolean }[]
): number | null => {
    let bar: number | null = null
    for (const { from, rated, holds } of bands.toReversed()) {
        if (bar === null && !rated) continue
        if (!rated || !holds) break
        bar = from
    }
    return bar
}

/** A severity score on Clef's legend (nit 0, should_fix 1, blocker 2). */
const severityLevel = (value: number): string => {
    if (value < 0.5) return 'nit'
    return value < 1.5 ? 'should_fix' : 'blocker'
}

type Ask = Extract<JournalRecord, { kind: 'jev_asked' }>
type Answered = Extract<JournalRecord, { kind: 'jev_answered' }>

const isCalibrated = (job: string): job is CalibratedJob =>
    CALIBRATED_JOBS.some((each) => each === job)

/**
 * The `failure_kind` reference for an answer at `at` in `records`: the
 * engine's routing, corrected by the first `agent_finished` on the answer's
 * ticket after it. `null` leaves the answer out.
 */
const failureReference = ({
    records,
    at,
    ask,
    fixed,
}: {
    records: JournalRecord[]
    at: number
    ask: Ask
    fixed: string | number | boolean
}): string | number | boolean | null => {
    const ticket = records[at]?.ticket ?? null
    const step = ask.content.request.state.step
    if (ticket === null) return fixed
    if (step !== 'red_check' && !(step === 'gates_run' && fixed === 'code')) {
        return fixed
    }
    const next = records
        .slice(at + 1)
        .find(
            (record) =>
                record.kind === 'agent_finished' && record.ticket === ticket
        )
    if (next?.kind !== 'agent_finished') return fixed
    const { content } = next
    if (step === 'red_check') {
        return content.role === 'test-writer' &&
            content.result.outcome !== 'tests_written'
            ? null
            : fixed
    }
    if (content.role !== 'implementer') return fixed
    if (content.result.outcome === 'bad_test') return 'test'
    return content.result.outcome === 'environment' ||
        content.result.outcome === 'needs_setup_change'
        ? null
        : fixed
}

/** Whether one answer is right; `null` leaves it out. */
const rightOf = ({
    records,
    at,
    ask,
    value,
    fixed,
}: {
    records: JournalRecord[]
    at: number
    ask: Ask
    value: string | number
    fixed: string | number | boolean
}): boolean | null => {
    switch (ask.content.job) {
        case 'finding_severity':
            if (typeof value !== 'number' || value < 0 || value > 2) {
                return null
            }
            return severityLevel(value) === fixed
        case 'failure_kind': {
            const reference = failureReference({ records, at, ask, fixed })
            return reference === null ? null : value === reference
        }
        default:
            return value === fixed
    }
}

type Tally = Map<string, Map<CalibratedJob, CalibrationBand[]>>

const emptyBands = (): CalibrationBand[] =>
    CALIBRATION_BANDS.map(({ band }) => ({ band, answers: 0, right: 0 }))

/**
 * Adds each counted answer of `answer`, the first answer to `ask`, to
 * `tally`, under its decision model cut to its last part after `/`.
 */
const countAnswers = ({
    records,
    at,
    ask,
    answer,
    tally,
}: {
    records: JournalRecord[]
    at: number
    ask: Ask
    answer: Answered
    tally: Tally
}): void => {
    const { job } = ask.content
    const named = answer.content.model
    if (named === undefined || !isCalibrated(job)) return
    const model = named.split('/').at(-1) ?? named
    for (const [id, { value, confidence }] of Object.entries(
        answer.content.answers
    )) {
        const fixed = ask.content.fixed[id]
        if (value === null || confidence === null || fixed === undefined) {
            continue
        }
        const right = rightOf({ records, at, ask, value, fixed })
        if (right === null) continue
        const jobs =
            tally.get(model) ?? new Map<CalibratedJob, CalibrationBand[]>()
        tally.set(model, jobs)
        const bands = jobs.get(job) ?? emptyBands()
        jobs.set(job, bands)
        const band = bands[bandAt(confidence)]
        if (band === undefined) continue
        band.answers += 1
        if (right) band.right += 1
    }
}

/** Adds one run's counted answers to `tally`, each ask's first answer only. */
const tallyRun = (records: JournalRecord[], tally: Tally): void => {
    const asks = new Map<number, Ask>()
    const answered = new Set<number>()
    records.forEach((record, at) => {
        if (record.kind === 'jev_asked' && isCalibrated(record.content.job)) {
            asks.set(record.seq, record)
        }
        if (record.kind !== 'jev_answered') return
        const ask = asks.get(record.content.asked_seq)
        if (ask === undefined || answered.has(record.content.asked_seq)) return
        answered.add(record.content.asked_seq)
        countAnswers({ records, at, ask, answer: record, tally })
    })
}

/** Whether `right` of `answers` is at least 90%, on the exact share. */
const holds = ({ answers, right }: CalibrationBand): boolean =>
    right * 10 >= answers * 9

/**
 * The calibration section from run journals, each run's records oldest
 * first, one pass per run. Pure.
 */
export const calibrationOf = ({
    runs,
}: {
    runs: JournalRecord[][]
}): ModelCalibration[] => {
    const tally: Tally = new Map()
    for (const records of runs) tallyRun(records, tally)
    return [...tally.keys()].toSorted().map((model) => ({
        model,
        jobs: CALIBRATED_JOBS.map((job) => {
            const bands = tally.get(model)?.get(job) ?? emptyBands()
            return {
                job,
                bands,
                suggested_bar: suggestedBar(
                    bands.map((band, at) => ({
                        from: CALIBRATION_BANDS[at]?.from ?? 0,
                        rated: band.answers >= MIN_ANSWERS,
                        holds: holds(band),
                    }))
                ),
            }
        }),
    }))
}

const LABELS: Record<CalibratedJob, string> = {
    ticket_order: 'ticket_order, against the ticket the engine started',
    failure_kind:
        "failure_kind, against the engine's routing and the fix that followed",
    finding_severity: "finding_severity, against the reviewer's severity",
}

/** `right` of `answers` as a whole percentage, a half going up. */
const percent = (right: number, answers: number): number =>
    Math.floor((right * 200 + answers) / (answers * 2))

const rateText = (answers: number, right: number): string =>
    `${plural(answers, 'answer')}, ${right} right (${percent(right, answers)}%)`

const jobText = ({ job, bands, suggested_bar }: JobCalibration): string[] => {
    const answers = bands.reduce((total, band) => total + band.answers, 0)
    const right = bands.reduce((total, band) => total + band.right, 0)
    if (answers === 0) return [`  ${LABELS[job]}: no answers yet`]
    return [
        `  ${LABELS[job]}: ${rateText(answers, right)}`,
        ...bands.map((band) =>
            band.answers < MIN_ANSWERS
                ? `    ${band.band}: ${plural(band.answers, 'answer')}, too few to rate`
                : `    ${band.band}: ${rateText(band.answers, band.right)}`
        ),
        `    suggested bar: ${suggested_bar ?? 'none'}`,
    ]
}

/**
 * The calibration section's lines as `luca models` prints them at the end
 * of its report, starting with a blank line. Pure.
 */
export const calibrationText = (calibration: ModelCalibration[]): string[] => {
    if (calibration.length === 0) {
        return [
            '',
            'Calibration: no ticket_order, failure_kind or finding_severity answers from Clef yet.',
        ]
    }
    return [
        '',
        "Calibration: how often Clef's answer matches a reference from the journal, by Clef's confidence.",
        `A band is rated from ${MIN_ANSWERS} answers. The suggested bar is the lower edge of the lowest band in an unbroken run, from the top, of rated bands at least 90% right. It is only a suggestion: luca models changes no config.`,
        ...calibration.flatMap(({ model, jobs }) => [
            '',
            `decision model: ${model}`,
            ...jobs.flatMap(jobText),
        ]),
    ]
}
