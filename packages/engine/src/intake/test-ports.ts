/**
 * The ported-tests table in a ticket's body: the old tests its owner lets
 * the test-writer port to code the ticket adds (same file, same names), so
 * they may fail until that code exists. Intake refuses a malformed row; the
 * red check lets a declared port fail.
 */
import { z } from 'zod'

import { codeValue, describeName, tableRows } from './markdown-tables'

/**
 * One row of a ported-tests table: in `file`, the test whose full name is
 * `name` (`kind` `test`, describe and test joined by " > "), every test
 * whose full name starts with `name > ` (`describe`), or every test in the
 * file (`all`, `name` `*`). `row` counts the table's rows from 1.
 */
export const TestPortSchema = z.object({
    row: z.number().int().positive(),
    file: z.string().min(1),
    kind: z.enum(['test', 'describe', 'all']),
    name: z.string().min(1),
})

export type TestPort = z.infer<typeof TestPortSchema>

/** The header a ported-tests table has, matched case-insensitively. */
const HEADER = ['file', 'tests']

/**
 * How a port names its tests, as the owner would write it in the table.
 *
 * @example
 * portLabel({ port: { row: 1, file: 'a.test.ts', kind: 'describe', name: 'a' } }) // "describe('a')"
 */
export const portLabel = ({ port }: { port: TestPort }): string =>
    port.kind === 'describe' ? `describe('${port.name}')` : port.name

/**
 * Whether a declared port names the test `full_name` in `file`.
 *
 * @example
 * portsTest({ ports, file: 'src/app.test.tsx', full_name: 'app > opens' }) // true with a `*` row for the file
 */
export const portsTest = ({
    ports,
    file,
    full_name,
}: {
    ports: TestPort[]
    file: string
    full_name: string
}): boolean => {
    const name = full_name.trim()
    return ports.some(
        (port) =>
            port.file === file &&
            (port.kind === 'all' ||
                (port.kind === 'describe'
                    ? name.startsWith(`${port.name} > `)
                    : name === port.name))
    )
}

/**
 * The ports a ticket's ported-tests tables declare, and a problem for each
 * malformed row, which is left out. A ported-tests table is any markdown
 * table whose header is `File`, `Tests` (in any case), outside fenced code
 * blocks; `## Ported tests` is the heading new tickets use, but only the
 * header counts. The Tests cell's first code span is a full test name,
 * `describe('...')` (in any quote), or `*`; text after it is a note. Rows
 * are counted from 1 across every such table. Pure.
 *
 * A row is malformed when a cell has no code span, it repeats an earlier
 * row's file and tests, or it and an earlier row name the same file and
 * one of them is `*` (which already ports every test in the file).
 *
 * @example
 * parseTestPorts({ body: '| File | Tests |\n| --- | --- |\n| `a.test.ts` | `*` |' })
 * // { ports: [{ row: 1, file: 'a.test.ts', kind: 'all', name: '*' }], problems: [] }
 */
export const parseTestPorts = ({
    body,
}: {
    body: string
}): { ports: TestPort[]; problems: string[] } => {
    const ports: TestPort[] = []
    const problems: string[] = []
    tableRows({ body, header: HEADER }).forEach(
        ([file_cell, tests_cell], index) => {
            const row = index + 1
            const named = `The ported-tests table's row ${row}`
            const file = codeValue(file_cell)
            const tests = codeValue(tests_cell)
            if (file === null) {
                problems.push(`${named} has no file in backticks.`)
                return
            }
            if (tests === null) {
                problems.push(
                    `${named} has no tests in backticks: give a full test name, describe('...'), or *.`
                )
                return
            }
            const in_describe = describeName(tests)
            const port: TestPort = {
                row,
                file,
                kind:
                    tests === '*'
                        ? 'all'
                        : in_describe === undefined
                          ? 'test'
                          : 'describe',
                name: in_describe ?? tests,
            }
            const same_file = ports.filter((other) => other.file === file)
            const again = same_file.find(
                (other) => other.kind === port.kind && other.name === port.name
            )
            const whole = same_file.find(
                (other) => other.kind === 'all' || port.kind === 'all'
            )
            if (again !== undefined) {
                problems.push(
                    `${named} ports \`${tests}\` in \`${file}\` again, as row ${again.row} does: keep one row for it.`
                )
            } else if (whole !== undefined) {
                problems.push(
                    `${named} and row ${whole.row} both port tests in \`${file}\`, and a \`*\` row ports every test in it: keep only one of them.`
                )
            } else ports.push(port)
        }
    )
    return { ports, problems }
}
