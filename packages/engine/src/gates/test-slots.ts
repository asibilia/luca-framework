import { createSlots, type Slots } from './prepare-slots'

/**
 * The engine's test slots (#544): one set for the whole engine process, so
 * `test_concurrency` caps every test run at once, whichever step runs it.
 */
export const TEST_SLOTS: Slots = createSlots()

/**
 * Runs `work` in a test slot, at most `test_concurrency` at once, and adds
 * how long it waited for one as `wait_ms`; the work's own time limit and
 * timing start inside, after the wait. An `exclusive` take waits for every
 * test run to end, and holds off new ones until it settles.
 *
 * With `test_concurrency` left out there is no cap, but the work still holds
 * a slot, so an exclusive take waits for it too. Nothing waits then unless an
 * exclusive take is going, and the result is as `work` gave it (no
 * `wait_ms`). Work that already holds a slot must not take another: an
 * exclusive take queued between the two would wait forever.
 *
 * @example
 * const check = await inTestSlot({ test_concurrency: 1, work: () => shellCheck({ ... }) })
 * check.wait_ms // 0, or how long another test run held the slot
 */
export const inTestSlot = async <T extends object>({
    test_concurrency,
    work,
    exclusive = false,
}: {
    test_concurrency: number | undefined
    work: () => Promise<T>
    exclusive?: boolean
}): Promise<T & { wait_ms?: number }> => {
    const asked = performance.now()
    return TEST_SLOTS.run({
        limit: test_concurrency ?? Infinity,
        exclusive,
        work: async () => {
            if (test_concurrency === undefined && !exclusive) return work()
            const wait_ms = Math.round(performance.now() - asked)
            return { ...(await work()), wait_ms }
        },
    })
}
