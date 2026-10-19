/** Runs work once a slot is free, and frees the slot when it settles. */
export type Slots = {
    /**
     * Waits for a slot (at most `limit` pieces of work at once), then runs
     * `work`. The slot is freed when `work` settles, even when it throws.
     * An `exclusive` take waits until no work holds a slot, then holds them
     * all: nothing else starts until it settles.
     */
    run: <T>(args: {
        limit: number
        work: () => Promise<T>
        exclusive?: boolean
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
    }: {
        limit: number
        exclusive: boolean
    }): Promise<void> =>
        new Promise((start) => {
            waiting.push({ limit, exclusive, start })
            startWaiting()
        })

    return {
        run: async ({ limit, work, exclusive = false }) => {
            await take({ limit, exclusive })
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

/**
 * The engine's test slots (#544): one set for the whole engine process, so
 * `test_concurrency` caps every test run at once, whichever step runs it.
 */
export const TEST_SLOTS: Slots = createSlots()

/**
 * Runs `work` in a test slot when `test_concurrency` is set, and adds how
 * long it waited for one as `wait_ms`; the work's own time limit and
 * timing start inside, after the wait. Left out, it runs `work` at once,
 * and the result is as `work` gave it.
 *
 * @example
 * const check = await inTestSlot({ test_concurrency: 1, work: () => shellCheck({ ... }) })
 * check.wait_ms // 0, or how long another test run held the slot
 */
export const inTestSlot = async <T extends object>({
    test_concurrency,
    work,
}: {
    test_concurrency: number | undefined
    work: () => Promise<T>
}): Promise<T & { wait_ms?: number }> => {
    if (test_concurrency === undefined) return work()
    const asked = performance.now()
    return TEST_SLOTS.run({
        limit: test_concurrency,
        work: async () => {
            const wait_ms = Math.round(performance.now() - asked)
            return { ...(await work()), wait_ms }
        },
    })
}
