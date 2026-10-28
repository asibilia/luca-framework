import type { RedCheckResult, TestCase, TestRun } from './gate-schemas'
import { addedTestNames, testNamesIn } from './new-tests'

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

/**
 * One slow command's `run_files` run in the red check (#683): the files it
 * got (those of the ticket's own slow files that hold a mapped test), and
 * how it ended. A `pass_fail` run gives no per-test results, so its exit
 * code judges every mapped test in its files.
 */
export type SlowRedRun = {
    files: string[]
    ended: 'failed' | 'passed' | 'timed_out'
}

const lastPart = (name: string): string =>
    (name.split(' > ').at(-1) ?? name).trim()

/** Quote-insensitive text, so a test name found in source matches its printed name. */
const loose = (text: string): string => text.replace(/[\\'"`]/g, '')

/**
 * Said after a new unmapped test found in the text of a test file that does
 * not load yet: with no results to check against, a `test(` inside a string
 * or a comment counts as a test too (#581).
 */
const NOT_LOADED_HINT =
    '. The file does not load yet, so every test( in its text counts, even one inside a string or a comment'

/** `NOT_LOADED_HINT` for a `.swift` file whose tests don't build yet (#668). */
const NOT_BUILT_HINT =
    '. The tests do not build yet, so every @Test func and XCTest test func in its text counts, even one inside a comment'

/**
 * Whether `file` is a `.swift` test file in a run whose `junit` command
 * wrote no JUnit file (#668): its tests don't build yet, so its test names
 * are read from its text (see `swiftTestNamesIn`).
 */
const notBuilt = ({ run, file }: { run: TestRun; file: string }): boolean =>
    run.junit_missing === true && file.endsWith('.swift')

/**
 * Whether a test name written in a file's text (`own`) is the test bun prints
 * as `full_name`: equal to it, at its end after " > " (not split on the last
 * " > ": a test name may hold one itself), or the same last part. One rule
 * for a mapped name and for a name found in the text.
 */
const namesTest = ({
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

const checkNewTest = ({
    test,
    current,
    test_files,
    sources,
    slow_runs,
}: {
    test: TestRef
    current: TestRun
    test_files: Set<string>
    sources: Record<string, string | null>
    slow_runs: SlowRedRun[]
}): { problem: string } | { note: string } => {
    const label = `"${test.name}" in ${test.file}`
    if (!test_files.has(test.file)) {
        return { problem: `${label}: the file is not a test file` }
    }
    const source = sources[test.file]
    if (source === null || source === undefined) {
        return { problem: `${label}: the file does not exist` }
    }
    const slow = slow_runs.filter(({ files }) => files.includes(test.file))
    if (slow.length > 0) {
        // A slow file's run gives no per-test results (#683): the test
        // counts if its name is in the file, and its run's exit code judges
        // it. A run that didn't fail is one problem for its files, below.
        if (!loose(source).includes(loose(lastPart(test.name)))) {
            return {
                problem: `${label}: not found in the file (use a plain string test name)`,
            }
        }
        return slow.every(({ ended }) => ended === 'failed')
            ? { note: `${label}: fails (its slow command exited non-zero)` }
            : { note: `${label}: its slow command did not fail` }
    }
    const found = findCase({ cases: current.cases, test })
    if (found?.status === 'passed') {
        return {
            problem: `${label}: passes already (it must fail before any code is written)`,
        }
    }
    if (found?.status === 'skipped') return { problem: `${label}: is skipped` }
    if (found) return { note: `${label}: fails, as it should` }
    if (notBuilt({ run: current, file: test.file })) {
        // A Swift test that uses code not written yet doesn't build, so its
        // command wrote no results (#668). It counts as failing if one of
        // the file's test names is its name.
        const own = testNamesIn({ source, file: test.file })
        return own.some((name) =>
            namesTest({ full_name: test.name, own: name })
        )
            ? { note: `${label}: fails (the tests do not build yet)` }
            : {
                  problem: `${label}: not found in the file (map a @Test func, or an XCTest func whose name starts with test, by its type names and function, such as "RankingTests > addsMovie()")`,
              }
    }
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
 * Whether an old test is in a `.swift` file whose tests don't build yet
 * (#668), that the run has no results for, and whose text still names it.
 */
const notRun = ({
    old,
    current,
    texts,
}: {
    old: TestCase
    current: TestRun
    texts: Record<string, string | null>
}): boolean => {
    const text = texts[old.file]
    if (
        !notBuilt({ run: current, file: old.file }) ||
        current.cases.some(({ file }) => file === old.file) ||
        text === null ||
        text === undefined
    ) {
        return false
    }
    return testNamesIn({ source: text, file: old.file }).some((own) =>
        namesTest({ full_name: old.full_name, own })
    )
}

/**
 * Every old test (passed at the baseline) still passes, in its file or
 * moved (#609): one missing from its file but now in another test file
 * under the same full name, a case the baseline didn't have there. Each
 * such case stands for one old test only, so a name several old tests had
 * counts as moved once.
 *
 * One in a `.swift` file whose tests don't build yet (#668), with no results
 * for that file, is not run: noted, not missing, while its name is still in
 * the file's text (`texts`).
 */
const checkOldTests = ({
    baseline,
    current,
    texts,
}: {
    baseline: TestRun
    current: TestRun
    texts: Record<string, string | null>
}): { problems: string[]; notes: string[] } => {
    const problems: string[] = []
    const notes: string[] = []
    const same = (a: TestCase, b: TestCase) =>
        a.file === b.file && a.full_name === b.full_name
    const movable = current.cases.filter(
        (now) => !baseline.cases.some((old) => same(old, now))
    )
    const claimed = new Set<TestCase>()
    for (const old of baseline.cases.filter(
        ({ status }) => status === 'passed'
    )) {
        const label = `old test "${old.full_name}" in ${old.file}`
        const now = current.cases.find((found) => same(found, old))
        if (now !== undefined) {
            if (now.status !== 'passed')
                problems.push(`${label} no longer passes`)
            continue
        }
        const moved = movable.find(
            (found) => !claimed.has(found) && found.full_name === old.full_name
        )
        if (moved === undefined) {
            if (notRun({ old, current, texts })) {
                notes.push(
                    `${label}: not run (the tests do not build yet); the gates run it`
                )
            } else problems.push(`${label} is missing`)
            continue
        }
        claimed.add(moved)
        const where = `old test "${old.full_name}" in ${moved.file} (moved from ${old.file})`
        if (moved.status === 'passed')
            notes.push(`${where}: still passes, as it should`)
        else problems.push(`${where} no longer passes`)
    }
    return { problems, notes }
}

/**
 * The red check. Pure: proves every criterion has a test, and at most
 * `MAX_TESTS_PER_CRITERION`, every test the ticket added is mapped, every
 * test file it created is in the feature map (when the repo has one), every
 * new test fails, and every old test that passed before still passes. A
 * test the ticket only moved to another test file, under the same full
 * name, is an old test (#609): noted, not missing and not new.
 *
 * @param baseline - The test run before the test-writer started.
 * @param current - The test run after the test-writer finished.
 * @param test_files - The worktree's test files, per the engine config.
 * @param sources - The text of each mapped test file, `null` if missing,
 *   and of each `.swift` file with an old test, whose name in it keeps it
 *   from counting as missing when its tests don't build yet (#668).
 * @param changed_test_sources - Each test file the ticket changed, as it was
 *   at the ticket's base and as it is now: a new test is a name in the
 *   second the first doesn't have (#581), and no changed or deleted test
 *   file had at its base (a moved test, #609). For a file that has results in
 *   `current`, only a name of a case that ran counts, so a `test(` inside a
 *   string (a fixture) or a comment does not. A file that doesn't load yet
 *   has none, so its text alone decides, and every `test(` in it counts.
 * @param feature_map - The repo's feature map, when the config names one
 *   (#583): its `path`, and `files`, the test files it lists (from
 *   `featureMapFiles`), `null` when the map file is missing. A test file the
 *   ticket created must be among them. Left out or `null`, nothing is checked.
 * @param slow_runs - The ticket's own slow files run through `run_files`
 *   (#683): a mapped test in one is judged by its run's exit code, and a run
 *   that passed or timed out is one problem naming its files.
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
    feature_map,
    slow_runs = [],
}: {
    criteria_ids: string[]
    mapping: CriterionTests[]
    baseline: TestRun
    current: TestRun
    test_files: string[]
    sources: Record<string, string | null>
    changed_test_sources: ChangedTestSource[]
    feature_map?: { path: string; files: string[] | null } | null
    slow_runs?: SlowRedRun[]
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
    // A name some changed (or deleted) test file had at the base is a moved
    // test, not a new one, whichever file it is in now (#609).
    const old_names = new Set(
        changed_test_sources.flatMap(({ file, base }) =>
            base === null ? [] : testNamesIn({ source: base, file })
        )
    )
    for (const { file, base, current: text } of changed_test_sources) {
        const mapped = mapping
            .flatMap(({ tests }) => tests)
            .filter((test) => test.file === file)
            .map(({ name }) => name.trim())
        // A file that loaded has results: a name in its text is a new test
        // only if a case of that name ran, so a `test('x'` inside a string
        // (a fixture) or a comment is not one. A file with none (it doesn't
        // load yet) is read from its text alone.
        const loaded = !current.files_without_results.includes(file)
        const ran = current.cases.filter((found) => found.file === file)
        const hint = notBuilt({ run: current, file })
            ? NOT_BUILT_HINT
            : NOT_LOADED_HINT
        for (const name of addedTestNames({ base, current: text, file })) {
            if (old_names.has(name)) continue
            const own = name.trim()
            if (
                loaded &&
                !ran.some(({ full_name }) => namesTest({ full_name, own }))
            ) {
                continue
            }
            if (!mapped.some((full) => namesTest({ full_name: full, own }))) {
                problems.push(
                    `"${name}" in ${file}: a new test the map doesn't name (map it to a criterion, or remove it)${loaded ? '' : hint}`
                )
            }
        }
    }
    if (feature_map !== undefined && feature_map !== null) {
        // A test file the ticket created (not one it edited) must be listed
        // under a feature, so tests grow inside their feature's files (#583).
        const created = changed_test_sources.filter(
            ({ base, current: text }) => base === null && text !== null
        )
        if (created.length > 0 && feature_map.files === null) {
            problems.push(
                `The feature map ${feature_map.path} is missing: restore it, or add it with the new test file listed`
            )
        } else {
            for (const { file } of created) {
                if (!(feature_map.files ?? []).includes(file)) {
                    problems.push(
                        `${file}: a new test file the feature map doesn't list (add it under a feature in ${feature_map.path})`
                    )
                }
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
            slow_runs,
        })
        if ('problem' in outcome) problems.push(outcome.problem)
        else notes.push(outcome.note)
    }
    for (const { files, ended } of slow_runs) {
        if (ended === 'passed') {
            problems.push(
                `These slow tests passed before any code was written: ${files.join(', ')}`
            )
        } else if (ended === 'timed_out') {
            problems.push(
                `These slow tests timed out in the red check: ${files.join(', ')}`
            )
        }
    }
    const old = checkOldTests({
        baseline,
        current,
        texts: {
            ...Object.fromEntries(
                changed_test_sources.map(({ file, current: text }) => [
                    file,
                    text,
                ])
            ),
            ...sources,
        },
    })
    problems.push(...old.problems)
    notes.push(...old.notes)
    return { ok: problems.length === 0, problems, notes }
}
