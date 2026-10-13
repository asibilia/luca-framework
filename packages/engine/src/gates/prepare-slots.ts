/** Runs work once a slot is free, and frees the slot when it settles. */
export type Slots = {
    /**
     * Waits for a slot (at most `limit` pieces of work at once), then runs
     * `work`. The slot is freed when `work` settles, even when it throws.
     */
    run: <T>(args: { limit: number; work: () => Promise<T> }) => Promise<T>
    /** How many pieces of work hold a slot now. */
    busy: () => number
}

/**
 * A counting semaphore: at most `limit` pieces of work at once, the rest
 * wait their turn in call order. Each call names its own `limit`, so a
 * later call can raise or lower it; a lower limit lets nothing new start
 * until enough work has finished.
 *
 * @example
 * const slots = createSlots()
 * await Promise.all([
 *     slots.run({ limit: 1, work: () => build('a') }),
 *     slots.run({ limit: 1, work: () => build('b') }), // starts once 'a' ends
 * ])
 */
export const createSlots = (): Slots => {
    let taken = 0
    const waiting: { limit: number; start: () => void }[] = []

    const startWaiting = () => {
        while (waiting.length > 0 && taken < (waiting[0]?.limit ?? 0)) {
            const next = waiting.shift()
            taken += 1
            next?.start()
        }
    }

    const take = (limit: number): Promise<void> =>
        new Promise((start) => {
            waiting.push({ limit, start })
            startWaiting()
        })

    return {
        run: async ({ limit, work }) => {
            await take(limit)
            try {
                return await work()
            } finally {
                taken -= 1
                startWaiting()
            }
        },
        busy: () => taken,
    }
}

/**
 * The engine's prepare slots: one set for the whole engine process, so the
 * cap spans every ticket that builds at the same time. A `luca` process runs
 * one run, so in practice the cap is the run's.
 */
export const PREPARE_SLOTS: Slots = createSlots()
