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
            // `noUncheckedIndexedAccess` types `item` as `T | undefined`, but a
            // valid index into the dense input is never actually `undefined`.
            // Fail fast rather than skip: skipping would leave a hole in
            // `results` while the return is still typed `R[]`, silently handing
            // callers a partially-computed array. A genuine `undefined` here
            // means a sparse/short input — a bug — so surface it.
            if (item === undefined) {
                throw new Error(
                    `pMap: unexpected undefined at index ${i} — dense input expected`
                )
            }
            results[i] = await fn(item, i)
        }
    }

    const workers = Math.max(1, Math.min(concurrency, items.length))
    await Promise.all(Array.from({ length: workers }, () => worker()))
    return results
}
