/**
 * Test names in a test file's text (#581): the plain string names of `test`
 * and `it` calls (with `.only`, `.skip`, `.todo`, `.failing`), in any quote.
 * A template name with `${}` and a `test.each` table are left out: their
 * names aren't known until they run. The test-writer must use plain names.
 *
 * @example
 * testNamesIn({ source: "test('adds', () => {})" }) // ['adds']
 */
export const testNamesIn = ({ source }: { source: string }): string[] => {
    const names: string[] = []
    const call =
        /\b(?:test|it)(?:\.(?:only|skip|todo|failing))?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
    for (const match of source.matchAll(call)) {
        const [, quote, raw = ''] = match
        if (quote === '`' && raw.includes('${')) continue
        names.push(raw.replace(/\\(.)/g, '$1'))
    }
    return names
}

/**
 * The test names a change added to one test file (#581): names in `current`
 * that `base` doesn't have. A new file (`base` null) adds all of its names;
 * a deleted one (`current` null) adds none.
 *
 * @example
 * addedTestNames({ base: "test('a', () => {})", current: "test('a', () => {}); test('b', () => {})" }) // ['b']
 */
export const addedTestNames = ({
    base,
    current,
}: {
    base: string | null
    current: string | null
}): string[] => {
    if (current === null) return []
    const before = new Set(base === null ? [] : testNamesIn({ source: base }))
    return testNamesIn({ source: current }).filter((name) => !before.has(name))
}
