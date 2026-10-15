import type { RedCheckResult, TestCase, TestRun } from './gate-schemas'
import { addedTestNames } from './new-tests'

import type { CriterionTests, TestRef } from '../agents/role-results'
import { MAX_TESTS_PER_CRITERION } from '../core/loop-caps'

/**
 * A test file the ticket changed, as it was at the ticket's base and as it
 * is now (`null`: not there).
 */
export type ChangedTestSource = {
    file: string
    base: string | null
    current: string | null
}

const lastPart = (name: string): string =>
    (name.split(' > ').at(-1) ?? name).trim()

/** Quote-insensitive text, so a test name found in source matches its printed name. */
const loose = (text: string): string => text.replace(/[\\'"`]/g, '')

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

const checkNewTest = ({
    test,
    current,
    test_files,
    sources,
}: {
    test: TestRef
    current: TestRun
    test_files: Set<string>
    sources: Record<string, string | null>
}): { problem: string } | { note: string } => {
    const label = `"${test.name}" in ${test.file}`
    if (!test_files.has(test.file)) {
        return { problem: `${label}: the file is not a test file` }
    }
    const source = sources[test.file]
    if (source === null || source === undefined) {
        return { problem: `${label}: the file does not exist` }
    }
    const found = findCase({ cases: current.cases, test })
    if (found?.status === 'passed') {
        return {
            problem: `${label}: passes already (it must fail before any code is written)`,
        }
    }
    if (found?.status === 'skipped') return { problem: `${label}: is skipped` }
    if (found) return { note: `${label}: fails, as it should` }
    if (current.files_without_results.includes(test.file)) {
        // A test file that imports code not written yet fails to load, so
        // bun reports none of its tests. The test counts as failing if its
        // name is in the file.
        return loose(source).includes(loose(lastPart(test.name)))
            ? { note: `${label}: fails (its file does not load yet)` }
            : {
                  problem: `${label}: not found in the file (use a plain string test name)`,
              }
    }
    return { problem: `${label}: not found in the test results` }
}

/**
 * The red check. Pure: proves every criterion has a test, and at most
 * `MAX_TESTS_PER_CRITERION`, every test the ticket added is mapped, every
 * new test fails, and every old test that passed before still passes.
 *
 * @param baseline - The test run before the test-writer started.
 * @param current - The test run after the test-writer finished.
 * @param test_files - The worktree's test files, per the engine config.
 * @param sources - The text of each mapped test file, `null` if missing.
 * @param changed_test_sources - Each test file the ticket changed, as it was
 *   at the ticket's base and as it is now: a new test is a name in the
 *   second the first doesn't have (#581). Read from the files' text, so a
 *   file that doesn't load yet still counts.
 *
 * @example
 * const result = checkRed({ criteria_ids: ['AC1'], mapping, baseline, current, test_files, sources, changed_test_sources })
 * if (!result.ok) console.error(result.problems)
 */
export const checkRed = ({
    criteria_ids,
    mapping,
    baseline,
    current,
    test_files,
    sources,
    changed_test_sources,
}: {
    criteria_ids: string[]
    mapping: CriterionTests[]
    baseline: TestRun
    current: TestRun
    test_files: string[]
    sources: Record<string, string | null>
    changed_test_sources: ChangedTestSource[]
}): RedCheckResult => {
    const problems: string[] = []
    const notes: string[] = []
    for (const id of criteria_ids) {
        const entry = mapping.find(({ criterion_id }) => criterion_id === id)
        if (entry === undefined || entry.tests.length === 0) {
            problems.push(`${id} has no test`)
        }
    }
    for (const { criterion_id } of mapping) {
        if (!criteria_ids.includes(criterion_id)) {
            notes.push(`unknown criterion id ${criterion_id}`)
        }
    }
    for (const { criterion_id, tests } of mapping) {
        if (tests.length > MAX_TESTS_PER_CRITERION) {
            problems.push(
                `${criterion_id} has ${tests.length} tests; write at most ${MAX_TESTS_PER_CRITERION} per criterion`
            )
        }
    }
    for (const { file, base, current: text } of changed_test_sources) {
        // A mapped name is the full name bun prints, so it ends with the
        // test's own name after " > ". Not split on the last " > ": a test
        // name may hold one itself.
        const mapped = mapping
            .flatMap(({ tests }) => tests)
            .filter((test) => test.file === file)
            .map(({ name }) => name.trim())
        for (const name of addedTestNames({ base, current: text })) {
            const own = name.trim()
            if (
                !mapped.some(
                    (full) => full === own || full.endsWith(` > ${own}`)
                )
            ) {
                problems.push(
                    `"${name}" in ${file}: a new test the map doesn't name (map it to a criterion, or remove it)`
                )
            }
        }
    }
    const testFiles = new Set(test_files)
    for (const test of mapping.flatMap(({ tests }) => tests)) {
        const outcome = checkNewTest({
            test,
            current,
            test_files: testFiles,
            sources,
        })
        if ('problem' in outcome) problems.push(outcome.problem)
        else notes.push(outcome.note)
    }
    for (const old of baseline.cases.filter(
        ({ status }) => status === 'passed'
    )) {
        const now = current.cases.find(
            ({ file, full_name }) =>
                file === old.file && full_name === old.full_name
        )
        const label = `old test "${old.full_name}" in ${old.file}`
        if (now === undefined) problems.push(`${label} is missing`)
        else if (now.status !== 'passed')
            problems.push(`${label} no longer passes`)
    }
    return { ok: problems.length === 0, problems, notes }
}
