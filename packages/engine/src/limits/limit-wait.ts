/**
 * The engine's clock: the time now, and a way to wait. The real one is
 * `SYSTEM_CLOCK`; tests hand in a fake, so nothing really waits.
 */
export type EngineClock = {
    /** Milliseconds since the epoch. */
    now: () => number
    sleep: (ms: number) => Promise<void>
}

export const SYSTEM_CLOCK: EngineClock = {
    now: () => Date.now(),
    sleep: (ms) => Bun.sleep(ms),
}

/**
 * A long wait sleeps at most this long at a time and checks the clock again,
 * so a machine that slept through the reset wakes up on time: 5 minutes.
 */
export const LIMIT_WAIT_NAP_MS = 5 * 60_000

/**
 * Waits until `until` (an ISO time) by the clock. A time already past
 * returns at once, as after a restart that came late.
 *
 * @example
 * await waitUntil({ clock: SYSTEM_CLOCK, until: '2026-09-26T11:01:00.000Z' })
 */
export const waitUntil = async ({
    clock,
    until,
}: {
    clock: EngineClock
    until: string
}): Promise<void> => {
    const end = Date.parse(until)
    for (let left = end - clock.now(); left > 0; left = end - clock.now()) {
        await clock.sleep(Math.min(left, LIMIT_WAIT_NAP_MS))
    }
}

/** A plan window's name in words, such as "five-hour" or "weekly Opus". */
export const windowName = ({
    rate_limit_type,
}: {
    rate_limit_type: string | null
}): string => {
    switch (rate_limit_type) {
        case 'five_hour':
            return 'five-hour'
        case 'seven_day':
            return 'weekly'
        case 'seven_day_opus':
            return 'weekly Opus'
        case 'seven_day_sonnet':
            return 'weekly Sonnet'
        case null:
            return 'unnamed'
        default:
            return rate_limit_type
    }
}

/**
 * The comment the spec issue gets when a limit wait starts: which window ran
 * out, when it resets, and that the run carries on by itself.
 */
export const limitWaitComment = ({
    rate_limit_type,
    resets_at,
    until,
}: {
    rate_limit_type: string | null
    resets_at: string | null
    until: string
}): string => {
    const window = windowName({ rate_limit_type })
    const reset =
        resets_at === null
            ? `The limit didn't say when it resets, so the run tries again at ${until}.`
            : `It resets at ${resets_at}; the run carries on at ${until}.`
    return (
        `Luca hit the plan's ${window} usage limit, so the run is in a limit wait. ${reset}\n\n` +
        'Nothing to do: the run carries on by itself. It never switches models or pays per token to go on.'
    )
}
