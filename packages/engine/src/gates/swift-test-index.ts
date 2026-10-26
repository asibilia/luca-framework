/**
 * The Swift test index (#668): SwiftPM's JUnit files name each case by its
 * `classname` and `name` only, so the engine ties each one to the `.swift`
 * test file that declares its type and function, and counts its assertions
 * from that function's body.
 */
import { join } from 'node:path'

import { pathText } from '../git/path-text'

/** A `.swift` test file and its text. */
type SwiftSource = { file: string; text: string }

/** A Swift case as the JUnit reader takes it. */
export type SwiftCase = { file: string; full_name: string; assertions?: number }

const escape = (text: string): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const declares = (name: string): RegExp =>
    new RegExp(`\\b(?:struct|class|enum|actor|extension)\\s+${escape(name)}\\b`)

const funcOf = (base: string): RegExp =>
    new RegExp(`\\bfunc\\s+${escape(base)}(?![\\w])`)

/** Where a free `@Test` function's `func` starts, after an `@Test`. */
const freeFuncAt = ({ text, base }: { text: string; base: string }) => {
    const match = new RegExp(
        `@Test\\b[\\s\\S]*?(\\bfunc\\s+${escape(base)}(?![\\w]))`
    ).exec(text)
    return match === null ? -1 : match.index + match[0].length
}

/** Where the type's function `func` ends, after the type's declaration. */
const typeFuncAt = ({
    text,
    type,
    base,
}: {
    text: string
    type: string
    base: string
}) => {
    const declared = declares(type).exec(text)
    if (declared === null) return -1
    const rest = text.slice(declared.index)
    const func = funcOf(base).exec(rest)
    return func === null ? -1 : declared.index + func.index + func[0].length
}

/** The body of the function whose `func` ends at `from`: its first `{` to its matching `}`. */
const bodyFrom = ({ text, from }: { text: string; from: number }) => {
    const open = text.indexOf('{', from)
    if (open < 0) return ''
    let depth = 0
    for (let at = open; at < text.length; at += 1) {
        if (text[at] === '{') depth += 1
        else if (text[at] === '}') {
            depth -= 1
            if (depth === 0) return text.slice(open + 1, at)
        }
    }
    return text.slice(open + 1)
}

const ASSERTION_CALLS =
    /#expect\(|#require\(|\bXCTUnwrap\(|\bXCTFail\(|\bIssue\.record\(|\bXCTAssert\w*\(/g

/**
 * Reads the `.swift` entries of `test_files` from `cwd`, and returns how to
 * read a SwiftPM case from its `classname` and `name`:
 *
 * - `full_name` is its type path (the classname after its module) and its
 *   name, joined by " > ".
 * - `file` is the one file that declares its innermost type and has a `func`
 *   of its base name (for a free function, a `func` after an `@Test`), or,
 *   of several, the one under a folder named exactly after its module.
 *   Failing that, its classname, with no `assertions`.
 * - `assertions` counts the `#expect`, `#require`, `XCTAssert…`, `XCTUnwrap`,
 *   `XCTFail` and `Issue.record` calls in that function's body.
 *
 * @example
 * const read = await swiftTestIndex({ cwd, test_files })
 * read({ classname: 'CalcTests.AddingTests', name: 'addsZero(n:)' })
 * // { file: 'Tests/CalcTests/AddingTests.swift', full_name: 'AddingTests > addsZero(n:)', assertions: 1 }
 */
export const swiftTestIndex = async ({
    cwd,
    test_files,
}: {
    cwd: string
    test_files: string[]
}): Promise<(testcase: { classname: string; name: string }) => SwiftCase> => {
    const sources: SwiftSource[] = []
    for (const file of test_files.filter((path) => path.endsWith('.swift'))) {
        const text = await pathText({ path: join(cwd, file) })
        if (text !== null) sources.push({ file, text })
    }
    return ({ classname, name }) => {
        const [module = '', ...types] = classname.split('.')
        const full_name = [...types, name].join(' > ')
        const base = name.split('(')[0] ?? name
        const type = types.at(-1)
        const funcAt = ({ text }: SwiftSource) =>
            type === undefined
                ? freeFuncAt({ text, base })
                : typeFuncAt({ text, type, base })
        const candidates = sources.filter((source) => funcAt(source) >= 0)
        const inModule = candidates.filter(({ file }) =>
            file.split('/').slice(0, -1).includes(module)
        )
        const chosen =
            candidates.length === 1
                ? candidates[0]
                : inModule.length === 1
                  ? inModule[0]
                  : undefined
        if (chosen === undefined) return { file: classname, full_name }
        const body = bodyFrom({ text: chosen.text, from: funcAt(chosen) })
        return {
            file: chosen.file,
            full_name,
            assertions: body.match(ASSERTION_CALLS)?.length ?? 0,
        }
    }
}
