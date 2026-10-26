/**
 * Test names in a `.swift` test file's text (#668), the way SwiftPM's JUnit
 * prints them: a Swift Testing `@Test func` as its base name and argument
 * labels (`addsZero(n:)`), and an XCTest `func test…()` with no parameters
 * as its bare name (`testAddsMovie`). It's a text scan, not a parse, so a
 * test inside a comment counts too. The Swift test index (see
 * `swiftTestIndex`) reads function bodies and `@Test` funcs with the same
 * scan (`closeOf`, `testedFuncs`).
 */

/**
 * How the character at `at` changes a parameter list's depth: `(`, `[`, `{`
 * and `<` open, their pairs close (not the `>` of `->`). The `<>` pair keeps
 * a generic type's commas from splitting a parameter.
 */
const depthStep = ({ text, at }: { text: string; at: number }): number => {
    const char = text[at] ?? ''
    if ('([{<'.includes(char)) return 1
    if (char === '>' && text[at - 1] === '-') return 0
    return ')]}>'.includes(char) ? -1 : 0
}

/**
 * The index just past the bracket that closes the one at `open`, counting
 * only `()`, `[]` and `{}` and skipping string literals, so a `0..<3` or a
 * `"a > b"` inside doesn't move it. The text's end if none.
 */
export const closeOf = ({
    text,
    open,
}: {
    text: string
    open: number
}): number => {
    let depth = 0
    for (let at = open; at < text.length; at += 1) {
        const char = text[at] ?? ''
        if (char === '"') {
            at += 1
            while (at < text.length && text[at] !== '"') {
                at += text[at] === '\\' ? 2 : 1
            }
        } else if ('([{'.includes(char)) {
            depth += 1
        } else if (')]}'.includes(char)) {
            depth -= 1
            if (depth === 0) return at + 1
        }
    }
    return text.length
}

/** A parameter list's top-level parts, split on its commas. */
const paramsOf = (list: string): string[] => {
    const params: string[] = []
    let depth = 0
    let from = 0
    for (let at = 0; at < list.length; at += 1) {
        depth += depthStep({ text: list, at })
        if (list[at] === ',' && depth === 0) {
            params.push(list.slice(from, at))
            from = at + 1
        }
    }
    params.push(list.slice(from))
    return params.map((param) => param.trim()).filter((param) => param !== '')
}

/** A parameter's argument label: its first word before the `:`. */
const labelOf = (param: string): string =>
    (param.split(':')[0] ?? '').trim().split(/\s+/)[0] ?? ''

/** Where each `func` an `@Test` attribute applies to starts. */
export const testedFuncs = (text: string): Set<number> => {
    const tested = new Set<number>()
    for (const match of text.matchAll(/@Test\b/g)) {
        let at = match.index + match[0].length
        const skipSpace = () => {
            while (/\s/.test(text[at] ?? '')) at += 1
        }
        skipSpace()
        if (text[at] === '(') at = closeOf({ text, open: at })
        for (;;) {
            skipSpace()
            const word = /^@?[\w.]+/.exec(text.slice(at))?.[0]
            if (word === undefined) break
            if (word === 'func') {
                tested.add(at)
                break
            }
            at += word.length
            if (word.startsWith('@') && text[at] === '(') {
                at = closeOf({ text, open: at })
            }
        }
    }
    return tested
}

/**
 * The test names in a `.swift` file's text: each `@Test func` (other
 * attributes and modifiers may sit between, and `@Test` may carry arguments
 * over several lines) with its argument labels, and each `func` with no
 * parameters whose name starts with `test` and has no `@Test` before it.
 *
 * @example
 * swiftTestNamesIn({ source: '@Test func addsZero(n: Int) {}\nfunc testAddsMovie() {}\nfunc helper() {}' })
 * // ['addsZero(n:)', 'testAddsMovie']
 */
export const swiftTestNamesIn = ({ source }: { source: string }): string[] => {
    const tested = testedFuncs(source)
    const names: string[] = []
    const funcs = /\bfunc\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g
    for (const match of source.matchAll(funcs)) {
        const [whole, base = ''] = match
        const open = match.index + whole.length - 1
        const params = paramsOf(
            source.slice(open + 1, closeOf({ text: source, open }) - 1)
        )
        if (tested.has(match.index)) {
            const labels = params.map((param) => `${labelOf(param)}:`)
            names.push(`${base}(${labels.join('')})`)
        } else if (base.startsWith('test') && params.length === 0) {
            names.push(base)
        }
    }
    return names
}
