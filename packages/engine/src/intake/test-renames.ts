/**
 * The renamed-tests table in a ticket's body: the old tests its owner lets
 * the test-writer rename. Intake refuses a malformed row; the red check
 * judges a declared rename under its new name.
 */
import { z } from 'zod'

import { codeValue, describeName, tableRows } from './markdown-tables'

/**
 * One row of a renamed-tests table. `old_name` and `new_name` are full test
 * names (describe and test joined by " > ", as bun prints them), or, with
 * `describe`, the old and new name of a describe: every test whose full
 * name starts with `old_name > ` is renamed to start with `new_name > `.
 * `row` counts the table's rows from 1, header and divider left out.
 */
export const TestRenameSchema = z.object({
    row: z.number().int().positive(),
    file: z.string().min(1),
    old_name: z.string().min(1),
    new_name: z.string().min(1),
    describe: z.boolean(),
})

export type TestRename = z.infer<typeof TestRenameSchema>

/** The header a renamed-tests table has, matched case-insensitively. */
const HEADER = ['file', 'old name', 'new name']

/**
 * The renames a ticket's renamed-tests tables declare, and a problem for
 * each malformed row, which is left out. A renamed-tests table is any
 * markdown table whose header is `File`, `Old name`, `New name` (in any
 * case), outside fenced code blocks; `## Renamed tests` is the heading new
 * tickets use, but only the header counts. Each cell's value is its first
 * code span; text after it is a note. Rows are counted from 1 across every
 * such table. Pure.
 *
 * A row is malformed when a cell has no code span, its old and new name are
 * the same, it renames a test (or describe) an earlier row renames in the
 * same file, it gives a new name an earlier row gives in the same file, or
 * it mixes a describe name and a full test name.
 *
 * @example
 * parseTestRenames({ body: '| File | Old name | New name |\n| --- | --- | --- |\n| `a.test.ts` | `a > x` | `a > y` |' })
 * // { renames: [{ row: 1, file: 'a.test.ts', old_name: 'a > x', new_name: 'a > y', describe: false }], problems: [] }
 */
export const parseTestRenames = ({
    body,
}: {
    body: string
}): { renames: TestRename[]; problems: string[] } => {
    const renames: TestRename[] = []
    const problems: string[] = []
    tableRows({ body, header: HEADER }).forEach(
        ([file_cell, old_cell, new_cell], index) => {
            const row = index + 1
            const named = `The renamed-tests table's row ${row}`
            const file = codeValue(file_cell)
            const old_value = codeValue(old_cell)
            const new_value = codeValue(new_cell)
            if (file === null || old_value === null || new_value === null) {
                const missing =
                    file === null
                        ? 'file'
                        : old_value === null
                          ? 'old name'
                          : 'new name'
                problems.push(`${named} has no ${missing} in backticks.`)
                return
            }
            const old_describe = describeName(old_value)
            const new_describe = describeName(new_value)
            if ((old_describe === undefined) !== (new_describe === undefined)) {
                problems.push(
                    `${named} mixes a describe and a full test name: write both as describe('...') to rename a describe, or both as full test names (describe and test joined by " > ").`
                )
                return
            }
            const rename = {
                row,
                file,
                old_name: old_describe ?? old_value,
                new_name: new_describe ?? new_value,
                describe: old_describe !== undefined,
            }
            const same = renames.filter(
                (other) =>
                    other.file === file && other.describe === rename.describe
            )
            const again = same.find(
                ({ old_name }) => old_name === rename.old_name
            )
            const taken = same.find(
                ({ new_name }) => new_name === rename.new_name
            )
            if (rename.old_name === rename.new_name) {
                problems.push(
                    `${named} gives the same old and new name: give the test's new name, or drop the row.`
                )
            } else if (again !== undefined) {
                problems.push(
                    `${named} renames \`${old_value}\` in \`${file}\` again, as row ${again.row} does: keep one row for it.`
                )
            } else if (taken !== undefined) {
                problems.push(
                    `${named} gives \`${new_value}\` in \`${file}\` as a new name, as row ${taken.row} does: give each test its own new name.`
                )
            } else renames.push(rename)
        }
    )
    return { renames, problems }
}
