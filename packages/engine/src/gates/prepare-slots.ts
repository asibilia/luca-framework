/** Runs work once a slot is free, and frees the slot when it settles. */
export type Slots = {
    /**
     * Waits for a slot (at most `limit` pieces of work at once), then runs
     * `work`. The slot is freed when `work` settles, even when it throws.
     * An `exclusive` take waits until no work holds a slot, then holds them
     * all: nothing else starts until it settles. A take that must wait
     * calls `on_wait` with the slots in use, and what that gives back once
     * the slot is taken.
     */
    run: <T>(args: {
        limit: number
        work: () => Promise<T>
        exclusive?: boolean
        on_wait?: (in_use: number) => () => void
    }) => Promise<T>
    /** How many pieces of work hold a slot now. */
    busy: () => number
}

/**
 * A counting semaphore: at most `limit` pieces of work at once, the rest
 * wait their turn in call order. Each call names its own `limit`, so a
 * later call can raise or lower it; a lower limit lets nothing new start
 * until enough work has finished. An `exclusive` call (#544) waits for
 * every running piece to end, and the work queued behind it waits for it.
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
    let alone = false
    const waiting: { limit: number; exclusive: boolean; start: () => void }[] =
        []

    const startWaiting = () => {
        while (waiting.length > 0 && !alone) {
            const [next] = waiting
            if (next === undefined) return
            if (next.exclusive ? taken > 0 : taken >= next.limit) return
            waiting.shift()
            taken += 1
            alone = next.exclusive
            next.start()
        }
    }

    const take = ({
        limit,
        exclusive,
        on_wait,
    }: {
        limit: number
        exclusive: boolean
        on_wait: ((in_use: number) => () => void) | undefined
    }): Promise<void> => {
        let started = false
        const taken_now = new Promise<void>((start) => {
            waiting.push({
                limit,
                exclusive,
                start: () => {
                    started = true
                    start()
                },
            })
            startWaiting()
        })
        if (started || on_wait === undefined) return taken_now
        const slot_taken = on_wait(taken)
        return taken_now.then(() => slot_taken())
    }

    return {
        run: async ({ limit, work, exclusive = false, on_wait }) => {
            await take({ limit, exclusive, on_wait })
            try {
                return await work()
            } finally {
                taken -= 1
                if (exclusive) alone = false
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
