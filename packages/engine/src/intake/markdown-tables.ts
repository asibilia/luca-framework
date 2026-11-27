/**
 * Reading the markdown tables a ticket's owner writes in its body, such as
 * the renamed-tests and ported-tests tables: found by their header, outside
 * fenced code blocks, each cell's value its first code span.
 */

const DIVIDER = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/

const FENCE = /^\s*(`{3,}|~{3,})/

/** The first inline code span, by a run of backticks up to the same run. */
const CODE_SPAN = /(?<!`)(`+)(?!`)([\s\S]*?)(?<!`)\1(?!`)/

/** A describe name in a cell, such as `describe('greet')`, in any quote. */
const DESCRIBE = /^describe\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*\)$/

/**
 * A table row's cells, trimmed. A `|` inside a code span or escaped as `\|`
 * stays in its cell. `null` when the line is not a table row.
 */
const cellsOf = (line: string): string[] | null => {
    const text = line.trim()
    if (!text.startsWith('|')) return null
    const cells: string[] = []
    let cell = ''
    let at = 1
    while (at < text.length) {
        const rest = text.slice(at)
        const span = /^`+/.exec(rest)?.[0]
        if (rest.startsWith('\\|')) {
            cell += '|'
            at += 2
        } else if (span !== undefined) {
            const close = rest.indexOf(span, span.length)
            const end = close === -1 ? span.length : close + span.length
            cell += rest.slice(0, end)
            at += end
        } else if (rest.startsWith('|')) {
            cells.push(cell.trim())
            cell = ''
            at += 1
        } else {
            cell += rest[0]
            at += 1
        }
    }
    if (cell.trim() !== '') cells.push(cell.trim())
    return cells
}

/**
 * A cell's value: its first code span's text, trimmed; text after it is a
 * note. `null` with no code span, or an empty one.
 *
 * @example
 * codeValue('`a > x` (a note)') // 'a > x'
 */
export const codeValue = (cell: string | undefined): string | null => {
    const text = CODE_SPAN.exec(cell ?? '')?.[2]
    if (text === undefined || text.trim() === '') return null
    return text.trim()
}

/**
 * The describe name a value like `describe('greet')` names (in any quote),
 * or `undefined` when it is not one.
 *
 * @example
 * describeName("describe('greet')") // 'greet'
 */
export const describeName = (value: string): string | undefined =>
    DESCRIBE.exec(value)?.[2]

/**
 * The rows of every table in `body` whose header cells are `header`
 * (lowercase, matched case-insensitively, in order), outside fenced code
 * blocks, in order, header and divider rows left out. Pure.
 *
 * @example
 * tableRows({ body: '| File | Tests |\n| --- | --- |\n| `a.test.ts` | `*` |', header: ['file', 'tests'] })
 * // [['`a.test.ts`', '`*`']]
 */
export const tableRows = ({
    body,
    header,
}: {
    body: string
    header: string[]
}): string[][] => {
    const rows: string[][] = []
    let fence: string | null = null
    let inTable = false
    const lines = body.split('\n')
    lines.forEach((line, index) => {
        const marker = FENCE.exec(line)?.[1]
        if (marker !== undefined) {
            if (fence === null) fence = marker
            else if (marker.startsWith(fence)) fence = null
            inTable = false
            return
        }
        if (fence !== null) return
        const cells = cellsOf(line)
        if (inTable && cells !== null) {
            if (!DIVIDER.test(line.trim())) rows.push(cells)
            return
        }
        inTable =
            cells !== null &&
            cells.length === header.length &&
            cells.every((cell, at) => cell.toLowerCase() === header[at]) &&
            DIVIDER.test((lines[index + 1] ?? '').trim())
    })
    return rows
}
