/**
 * Line counts matching `groupedStory()` (#776, ticket 4):
 * - each walk-stop file (`s1`–`s23`): +20, −0;
 * - each non-noise loose-ends file (`file-01`–`file-20`): +5, −0;
 * - the 4 noise files: +1,000, +1,500, +3,000 and +653, for 6,153 lines.
 */
export const groupedLineCounts = (): Record<
    string,
    { added: number; removed: number }
> => {
    const counts: Record<string, { added: number; removed: number }> = {}
    for (let n = 1; n <= 23; n += 1) {
        const group = Math.min(4, Math.floor((n - 1) / 6) + 1)
        counts[`src/g${group}/s${n}.ts`] = { added: 20, removed: 0 }
    }
    for (let n = 1; n <= 20; n += 1) {
        counts[`src/loose/file-${String(n).padStart(2, '0')}.ts`] = {
            added: 5,
            removed: 0,
        }
    }
    counts['bun.lock'] = { added: 1000, removed: 0 }
    counts['src/generated/schema.gen.ts'] = { added: 1500, removed: 0 }
    counts['data/sample-players.json'] = { added: 3000, removed: 0 }
    counts['test/fixtures/players.json'] = { added: 653, removed: 0 }
    return counts
}
