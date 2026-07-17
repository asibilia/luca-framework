/**
 * Bounded-concurrency async map. Runs at most `concurrency` jobs at once,
 * preserving input order in the result. Used to parallelize the many
 * independent `claude -p` calls a scoring pass makes.
 */
export async function pMap<T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
    concurrency: number
): Promise<R[]> {
    const results = new Array<R>(items.length)
    let next = 0

    async function worker(): Promise<void> {
        while (true) {
            const i = next++
            if (i >= items.length) return
            const item = items[i]
            if (item === undefined) return
            results[i] = await fn(item, i)
        }
    }

    const workers = Math.max(1, Math.min(concurrency, items.length))
    await Promise.all(Array.from({ length: workers }, () => worker()))
    return results
}
