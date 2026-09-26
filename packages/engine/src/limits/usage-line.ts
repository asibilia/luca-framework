import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import { windowName } from './limit-wait'
import { RateLimitReadingSchema } from './plan-signals'
import { windowSamples } from './plan-usage'

import { boardStateDir } from '../board/board-state-dir'
import { defaultRunsDir } from '../journal/journal'
import {
    UsageLineWindowSchema,
    type JournalRecord,
    type UsageLineWindow,
} from '../journal/journal-record'

/**
 * The **usage lines**: how full, in percent, the account's weekly
 * (`seven_day`) and 5-hour windows may get before every run pauses. They are
 * host-scoped `luca-board` settings. A value that is missing or not a
 * number reads as its default.
 */
export const UsageLinesSchema = z.object({
    weekly_line: z.number().catch(80),
    five_hour_line: z.number().catch(85),
})

export type UsageLines = z.infer<typeof UsageLinesSchema>

/** The default lines: 80% of the weekly window, 85% of the 5-hour one. */
export const DEFAULT_USAGE_LINES: UsageLines = UsageLinesSchema.parse({})

/** Each guarded window's line setting, weekly first. */
export const LINE_OF: Record<UsageLineWindow, keyof UsageLines> = {
    seven_day: 'weekly_line',
    five_hour: 'five_hour_line',
}

const isGuarded = (name: string): name is UsageLineWindow =>
    UsageLineWindowSchema.safeParse(name).success

/** One guarded window's fill level in one reading, and when it arrived. */
export type WindowReading = {
    window: UsageLineWindow
    percent: number
    /** When the window resets, in seconds since the epoch. */
    resets_at: number
    /** When the reading arrived, in ms since the epoch. */
    arrival: number
}

/**
 * The guarded windows in raw `rate_limit_event` readings, each with its
 * arrival time (`arrived_at`, else `fallback_arrival`). A window with no
 * reset time is left out: no one could say when its wait would end.
 */
const windowReadingsOf = ({
    readings,
    fallback_arrival,
}: {
    readings: unknown[]
    fallback_arrival: number
}): WindowReading[] =>
    readings.flatMap((info) => {
        const parsed = RateLimitReadingSchema.safeParse(info)
        if (!parsed.success) return []
        const at = Date.parse(parsed.data.arrived_at ?? '')
        const arrival = Number.isFinite(at) ? at : fallback_arrival
        return windowSamples(parsed.data).flatMap(
            ({ name, percent, resets_at }): WindowReading[] =>
                isGuarded(name) && resets_at !== null
                    ? [{ window: name, percent, resets_at, arrival }]
                    : []
        )
    })

/**
 * Every guarded-window reading in a run's agent sessions. A reading from an
 * older journal, with no `arrived_at`, arrived when its session was
 * journaled.
 */
export const runReadings = ({
    records,
}: {
    records: JournalRecord[]
}): WindowReading[] =>
    records.flatMap((record) =>
        record.kind === 'agent_session'
            ? windowReadingsOf({
                  readings: record.content.session.rate_limit_events,
                  fallback_arrival: Date.parse(record.time),
              })
            : []
    )

/**
 * The raw readings other runs shared, as guarded-window readings. One
 * with no `arrived_at` can't be ordered, so it is left out.
 */
export const sharedReadings = ({
    readings,
}: {
    readings: unknown[]
}): WindowReading[] =>
    windowReadingsOf({ readings, fallback_arrival: -Infinity }).filter(
        ({ arrival }) => Number.isFinite(arrival)
    )

/**
 * The newest reading of each guarded window, by arrival time. Of two that
 * arrived at once, the later one in the list wins.
 *
 * @example
 * newestReadings({ readings: [...runReadings({ records }), ...sharedReadings({ readings })] })
 * // { seven_day: { window: 'seven_day', percent: 82, resets_at: 1767524400, arrival: ... } }
 */
export const newestReadings = ({
    readings,
}: {
    readings: WindowReading[]
}): Partial<Record<UsageLineWindow, WindowReading>> => {
    const newest: Partial<Record<UsageLineWindow, WindowReading>> = {}
    for (const reading of readings) {
        const seen = newest[reading.window]
        if (seen === undefined || reading.arrival >= seen.arrival) {
            newest[reading.window] = reading
        }
    }
    return newest
}

/** A window's name in words: "weekly" or "five-hour". */
const windowWords = (window: UsageLineWindow): string =>
    windowName({ rate_limit_type: window })

/**
 * The comment the spec issue gets when a run pauses at a usage line: which
 * window, how full, the line, and when the run carries on.
 */
export const usageLineWaitComment = ({
    window,
    line,
    percent,
    resets_at,
}: {
    window: UsageLineWindow
    line: number
    percent: number
    resets_at: string
}): string =>
    `Luca paused the run at the ${windowWords(window)} usage line: the plan's ${windowWords(window)} window is at ${percent}%, and the line is ${line}%. ` +
    `Every run pauses there, to keep the rest of the plan for you.\n\n` +
    `Nothing to do: the run carries on by itself when the window resets at ${resets_at}, ` +
    `or sooner if you raise \`${LINE_OF[window]}\` in the luca-board settings above ${percent}%.`

/** The comment the spec issue gets when a usage-line wait is over. */
export const usageLineEndedComment = ({
    window,
    percent,
    reason,
}: {
    window: UsageLineWindow
    percent: number
    reason: 'reset' | 'line_raised'
}): string =>
    reason === 'reset'
        ? `The plan's ${windowWords(window)} window reset, so the run carries on from the usage line.`
        : `The ${windowWords(window)} usage line was raised above ${percent}%, so the run carries on.`

/**
 * The file every run shares its newest readings in, in Luca's state folder
 * (the runs folder's parent, `~/.local/state/luca`).
 */
export const defaultSharedReadingsPath = (): string =>
    join(dirname(defaultRunsDir()), 'plan-readings.json')

/**
 * The file the `luca-board` plugin keeps its usage lines in:
 * `usage-lines.json` in the board's state folder (see `boardStateDir`).
 */
export const defaultUsageLinesPath = ({
    env,
    home_dir,
}: {
    env: Record<string, string | undefined>
    home_dir: string
}): string => join(boardStateDir({ env, home_dir }), 'usage-lines.json')

/** Reads a JSON file, or `null` when it is missing or not JSON. */
const readJson = async (file: string): Promise<unknown> => {
    try {
        return JSON.parse(await Bun.file(file).text())
    } catch {
        return null
    }
}

/**
 * The usage lines in `file`. A missing or broken file reads as the defaults.
 */
export const readUsageLines = async ({
    file,
}: {
    file: string
}): Promise<UsageLines> => {
    const parsed = UsageLinesSchema.safeParse(await readJson(file))
    return parsed.success ? parsed.data : DEFAULT_USAGE_LINES
}

/** The shared file: the newest raw reading per window. */
const SharedFileSchema = z.object({
    windows: z.record(z.string(), z.unknown()).catch({}),
})

/**
 * The newest raw readings every run shared, one per window. A window that
 * already reset by `now` (ms) is left out. A missing or broken file reads as
 * none.
 */
export const readSharedReadings = async ({
    file,
    now,
}: {
    file: string
    now: number
}): Promise<unknown[]> => {
    const parsed = SharedFileSchema.safeParse(await readJson(file))
    if (!parsed.success) return []
    return Object.values(parsed.data.windows).filter((info) =>
        sharedReadings({ readings: [info] }).every(
            ({ resets_at }) => resets_at * 1000 > now
        )
    )
}

/** One window's reading, alone, as the shared file keeps it. */
const rawReading = (reading: WindowReading): Record<string, unknown> => ({
    arrived_at: new Date(reading.arrival).toISOString(),
    rateLimitType: reading.window,
    unifiedWindows: {
        [reading.window]: {
            utilization: reading.percent / 100,
            resetsAt: reading.resets_at,
        },
    },
})

/**
 * Shares a run's readings: each window in `file` keeps the newest reading
 * of the file's and `readings`, by arrival time. Written atomically (a temp
 * file, then a rename), so another run never reads half a file.
 */
export const shareReadings = async ({
    file,
    readings,
}: {
    file: string
    readings: WindowReading[]
}): Promise<void> => {
    const parsed = SharedFileSchema.safeParse(await readJson(file))
    const current = parsed.success ? parsed.data.windows : {}
    const newest = newestReadings({
        readings: [
            ...sharedReadings({ readings: Object.values(current) }),
            ...readings,
        ],
    })
    const windows: Record<string, unknown> = { ...current }
    let changed = false
    for (const reading of Object.values(newest)) {
        const before = sharedReadings({
            readings: [current[reading.window]],
        })[0]
        if (before !== undefined && before.arrival >= reading.arrival) continue
        windows[reading.window] = rawReading(reading)
        changed = true
    }
    if (!changed) return
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
    await writeFile(temp, `${JSON.stringify({ windows }, null, 2)}\n`)
    await rename(temp, file)
}

/** What `runEngine` needs for the usage line. */
export type UsageLineDeps = {
    /** The `luca-board` usage lines, read again each time. */
    read_lines: () => Promise<UsageLines>
    /** The newest raw readings every run shared. */
    read_shared: () => Promise<unknown[]>
    /** Shares the run's readings. Never throws. */
    share: (readings: WindowReading[]) => Promise<void>
}

/**
 * The usage line from files: the plugin's lines in `lines_file`, and the
 * readings every run shares in `shared_file`. A share that fails is logged
 * and the run goes on.
 *
 * @example
 * runEngine({ ..., usage: fileUsageLine({ lines_file: defaultUsageLinesPath({ env: process.env, home_dir: homedir() }), shared_file: defaultSharedReadingsPath(), now: Date.now, log }) })
 */
export const fileUsageLine = ({
    lines_file,
    shared_file,
    now,
    log,
}: {
    lines_file: string
    shared_file: string
    now: () => number
    log: (line: string) => void
}): UsageLineDeps => ({
    read_lines: () => readUsageLines({ file: lines_file }),
    read_shared: () => readSharedReadings({ file: shared_file, now: now() }),
    share: async (readings) => {
        try {
            await shareReadings({ file: shared_file, readings })
        } catch (error) {
            log(`[luca-run] couldn't share plan readings: ${String(error)}`)
        }
    },
})
