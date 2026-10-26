import { swiftTestNamesIn } from './swift-test-names'

/**
 * Test names in a test file's text (#581): the plain string names of `test`
 * and `it` calls (with `.only`, `.skip`, `.todo`, `.failing`), in any quote.
 * A template name with `${}` and a `test.each` table are left out: their
 * names aren't known until they run. The test-writer must use plain names.
 * A call on something else, like `pattern.test('abc')`, is not a test. This
 * is a text scan, not a parse, so a `test('...')` inside a string or comment
 * of a changed file counts as a test name. The red check trusts the scan
 * alone only for a file that doesn't load yet; for a file that ran, it keeps
 * just the names of cases that ran.
 *
 * A `file` ending in `.swift` (#668) is read by `swiftTestNamesIn` instead.
 *
 * @example
 * testNamesIn({ source: "test('adds', () => {})" }) // ['adds']
 */
export const testNamesIn = ({
    source,
    file,
}: {
    source: string
    /** The file the text is from; left out, it's read like a bun test file. */
    file?: string
}): string[] => {
    if (file?.endsWith('.swift') === true) return swiftTestNamesIn({ source })
    const names: string[] = []
    const call =
        /(?<![\w$.])(?:test|it)(?:\.(?:only|skip|todo|failing|concurrent|serial))?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
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
    file,
}: {
    base: string | null
    current: string | null
    /** See `testNamesIn`. */
    file?: string
}): string[] => {
    if (current === null) return []
    const before = new Set(
        base === null ? [] : testNamesIn({ source: base, file })
    )
    return testNamesIn({ source: current, file }).filter(
        (name) => !before.has(name)
    )
}
