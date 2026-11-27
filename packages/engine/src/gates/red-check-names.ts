/**
 * How the red check matches a test name: a mapped name or one found in a
 * file's text against the cases a test run printed.
 */
import type { TestCase, TestRun } from './gate-schemas'

import type { TestRef } from '../agents/role-results'

/** The last part of a full test name, after its last " > ". */
export const lastPart = (name: string): string =>
    (name.split(' > ').at(-1) ?? name).trim()

/** Quote-insensitive text, so a test name found in source matches its printed name. */
export const loose = (text: string): string => text.replace(/[\\'"`]/g, '')

/**
 * Whether `file` is a `.swift` test file in a run whose `junit` command
 * wrote no JUnit file (#668): its tests don't build yet, so its test names
 * are read from its text (see `swiftTestNamesIn`).
 */
export const notBuilt = ({
    run,
    file,
}: {
    run: TestRun
    file: string
}): boolean => run.junit_missing === true && file.endsWith('.swift')

/**
 * Whether a test name written in a file's text (`own`) is the test bun prints
 * as `full_name`: equal to it, at its end after " > " (not split on the last
 * " > ": a test name may hold one itself), or the same last part. One rule
 * for a mapped name and for a name found in the text.
 */
export const namesTest = ({
    full_name,
    own,
}: {
    full_name: string
    own: string
}): boolean => {
    const full = full_name.trim()
    return (
        full === own ||
        full.endsWith(` > ${own}`) ||
        lastPart(full) === lastPart(own)
    )
}

/**
 * The test case a named test is, in its file: the one whose full name
 * matches, else the only one whose last part does. `undefined` if none (or
 * more than one) does.
 *
 * @example
 * findCase({ cases: run.cases, test: { file: 'src/sum.test.ts', name: 'sum > adds' } })
 */
export const findCase = ({
    cases,
    test,
}: {
    cases: TestCase[]
    test: TestRef
}): TestCase | undefined => {
    const inFile = cases.filter(({ file }) => file === test.file)
    const exact = inFile.find(
        ({ full_name }) => full_name.trim() === test.name.trim()
    )
    if (exact) return exact
    const byLast = inFile.filter(
        ({ full_name }) => lastPart(full_name) === lastPart(test.name)
    )
    return byLast.length === 1 ? byLast[0] : undefined
}
