/**
 * Plan usage in the board's state: the color level of a percent, plan
 * windows in words and in their shown order, how much of a window something
 * used, and the plan's latest reading.
 */
import { z } from 'zod'

/** Plan usage is yellow from this percent. */
export const USAGE_WARN_FROM = 60

/** Plan usage is red above this percent. */
export const USAGE_HIGH_ABOVE = 85

export const UsageLevelSchema = z.enum(['ok', 'warn', 'high'])

export type UsageLevel = z.infer<typeof UsageLevelSchema>

/**
 * The color level of a plan usage percent: `ok` (green) below 60, `warn`
 * (yellow) from 60 to 85, `high` (red) above 85.
 *
 * @example
 * usageLevel({ percent: 59 }) // 'ok'
 * usageLevel({ percent: 85 }) // 'warn'
 * usageLevel({ percent: 86 }) // 'high'
 */
export const usageLevel = ({ percent }: { percent: number }): UsageLevel => {
    if (percent > USAGE_HIGH_ABOVE) return 'high'
    if (percent >= USAGE_WARN_FROM) return 'warn'
    return 'ok'
}

/** Plan windows in words; any other window keeps its raw name. */
const WINDOW_WORDS: Record<string, string> = {
    five_hour: 'five-hour',
    seven_day: 'weekly',
    seven_day_opus: 'weekly Opus',
    seven_day_sonnet: 'weekly Sonnet',
}

/**
 * A plan window's name in words.
 *
 * @example
 * windowWords({ window: 'seven_day_opus' }) // 'weekly Opus'
 * windowWords({ window: 'overage' }) // 'overage'
 */
export const windowWords = ({ window }: { window: string }): string =>
    WINDOW_WORDS[window] ?? window

/**
 * The order windows are shown in: five-hour, weekly, the other weekly ones
 * (Opus, Sonnet, ...), then the rest.
 */
export const windowRank = ({ window }: { window: string }): number => {
    if (window === 'five_hour') return 0
    if (window === 'seven_day') return 1
    if (window.startsWith('seven_day')) return 2
    return 3
}

/** How much of one plan window something used, as a whole percent. */
export const PlanUsedSchema = z.object({
    /** The window in words, such as "five-hour" or "weekly". */
    window: z.string(),
    percent: z.number(),
})

export type PlanUsed = z.infer<typeof PlanUsedSchema>

/**
 * The plan used, in words, windows in their shown order.
 *
 * @example
 * planUsedText({ used, sign: '+' }) // 'five-hour +1%, weekly +1%'
 * planUsedText({ used, sign: '' }) // 'five-hour 3%, weekly 1%'
 */
export const planUsedText = ({
    used,
    sign,
}: {
    used: PlanUsed[]
    sign: '+' | ''
}): string =>
    used.map(({ window, percent }) => `${window} ${sign}${percent}%`).join(', ')

/**
 * The plan's usage, from the rate-limit readings in agents' sessions. Each
 * window keeps its latest reading; `null` until one arrives.
 */
export const UsageSchema = z.object({
    five_hour_percent: z.number().nullable(),
    weekly_percent: z.number().nullable(),
    five_hour_level: UsageLevelSchema.nullable(),
    weekly_level: UsageLevelSchema.nullable(),
    /** When the five-hour window resets. */
    resets_at: z.string().nullable(),
    read_at: z.string(),
})

export type Usage = z.infer<typeof UsageSchema>

/**
 * The words on the plan usage: its windows are the whole account's, every
 * run's and chat's, never one run's.
 */
export const USAGE_LABEL = 'plan usage (account-wide)'
