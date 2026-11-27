/**
 * The red check's old tests: every test that passed at the baseline still
 * passes, in its file, moved to another file (#609), or under the new name
 * the ticket's renamed-tests table gives it.
 */
import type { TestCase, TestRun } from './gate-schemas'
import { testNamesIn } from './new-tests'
import { findCase, loose, namesTest, notBuilt } from './red-check-names'

import type { CriterionTests } from '../agents/role-results'
import type { TestRename } from '../intake/test-renames'

/** Whether a declared rename renames the test `full_name` in `file`. */
const renamesTest = ({
    rename,
    file,
    full_name,
}: {
    rename: TestRename
    file: string
    full_name: string
}): boolean =>
    rename.file === file &&
    (rename.describe
        ? full_name.trim().startsWith(`${rename.old_name} > `)
        : full_name.trim() === rename.old_name)

/**
 * The new full name the ticket's declared renames give the test `full_name`
 * in `file`: a test rename's new name, or for a describe rename (its prefix
 * only, not a describe nested inside another), the test's name with the
 * new describe name in front. A test rename wins over a describe rename.
 * `undefined` when no rename names it.
 *
 * @example
 * renamedName({ renames, file: 'src/greet.test.ts', full_name: 'greet > says hi' }) // 'hello > says hi'
 */
export const renamedName = ({
    renames,
    file,
    full_name,
}: {
    renames: TestRename[]
    file: string
    full_name: string
}): string | undefined => {
    const name = full_name.trim()
    const matching = renames.filter((rename) =>
        renamesTest({ rename, file, full_name: name })
    )
    const plain = matching.find(({ describe }) => !describe)
    if (plain !== undefined) return plain.new_name
    const block = matching.find(({ describe }) => describe)
    return block === undefined
        ? undefined
        : `${block.new_name} > ${name.slice(block.old_name.length + 3)}`
}

/**
 * The new full names the declared renames give the tests that passed in
 * `file` at the baseline: what the red check must not count as unmapped
 * new tests, since each is an old test under its new name.
 */
export const renameTargets = ({
    renames,
    baseline,
    file,
}: {
    renames: TestRename[]
    baseline: TestRun
    file: string
}): string[] =>
    baseline.cases
        .filter((old) => old.file === file && old.status === 'passed')
        .flatMap(({ full_name }) => {
            const renamed = renamedName({ renames, file, full_name })
            return renamed === undefined ? [] : [renamed]
        })

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
 * Why a file has no results for its tests, when its text must say which
 * tests it has: it doesn't load yet, or (a `.swift` file) its tests don't
 * build yet (#668). `null` when it has results.
 */
const noResultsWhy = ({
    current,
    file,
}: {
    current: TestRun
    file: string
}): string | null => {
    if (current.cases.some((found) => found.file === file)) return null
    if (notBuilt({ run: current, file })) return 'the tests do not build yet'
    return current.files_without_results.includes(file)
        ? 'its file does not load yet'
        : null
}

/**
 * Whether the text of a file with no results has a test named `name`: for
 * a `.swift` file one of its test names, else every " > " part of the name.
 */
const textHasTest = ({
    text,
    file,
    name,
}: {
    text: string
    file: string
    name: string
}): boolean =>
    file.endsWith('.swift')
        ? testNamesIn({ source: text, file }).some((own) =>
              namesTest({ full_name: name, own })
          )
        : name
              .split(' > ')
              .every((part) => loose(text).includes(loose(part.trim())))

/**
 * An old test the ticket's table declares renamed to `new_name`: mapped to
 * a criterion, it is a new test (judged, and made to fail first, by the
 * mapped-test check) and only noted here; unmapped, it must still pass.
 * Its new name must be a test in the file: a case that ran, or, in a file
 * with no results, a name in its text.
 */
const checkRenamed = ({
    old,
    new_name,
    current,
    mapping,
    texts,
}: {
    old: TestCase
    new_name: string
    current: TestRun
    mapping: CriterionTests[]
    texts: Record<string, string | null>
}): { problem: string } | { note: string } => {
    const label = `old test "${old.full_name}" in ${old.file}`
    const declared = `renamed to "${new_name}", as the ticket declares`
    const now = current.cases.find(
        (found) =>
            found.file === old.file && found.full_name.trim() === new_name
    )
    const mapped = mapping
        .flatMap(({ tests }) => tests)
        .some(
            (test) =>
                test.file === old.file &&
                (test.name.trim() === new_name ||
                    (now !== undefined &&
                        findCase({ cases: current.cases, test }) === now))
        )
    const mapped_note = {
        note: `${label}: ${declared}; mapped to a criterion, so it must fail first`,
    }
    if (now === undefined) {
        const why = noResultsWhy({ current, file: old.file })
        const text = texts[old.file]
        const found =
            why !== null &&
            text !== null &&
            text !== undefined &&
            textHasTest({ text, file: old.file, name: new_name })
        if (!found) {
            return {
                problem: `${label} was declared renamed to "${new_name}", but no test of that name is in the file`,
            }
        }
        if (mapped) return mapped_note
        // Unmapped, it must still pass. Like any old test, one whose Swift
        // tests don't build yet is left to the gates (#668); one whose file
        // doesn't load does not pass.
        return notBuilt({ run: current, file: old.file })
            ? {
                  note: `${label}: ${declared}; not run (${why}); the gates run it`,
              }
            : {
                  problem: `${label}, renamed to "${new_name}" as the ticket declares, no longer passes (${why})`,
              }
    }
    if (mapped) return mapped_note
    return now.status === 'passed'
        ? { note: `${label}: ${declared}; still passes` }
        : {
              problem: `${label}, renamed to "${new_name}" as the ticket declares, no longer passes`,
          }
}

/** Said after a missing old test: the only way to rename one. */
const MISSING_HINT =
    " (rename a test only when the ticket's renamed-tests table names it)"

/**
 * Every old test (passed at the baseline) still passes, in its file or
 * moved (#609): one missing from its file but now in another test file
 * under the same full name, a case the baseline didn't have there. Each
 * such case stands for one old test only, so a name several old tests had
 * counts as moved once.
 *
 * One neither there nor moved that the ticket's renamed-tests table
 * declares renamed (`renames`) is judged under its new name, in the same
 * file: mapped to a criterion, it is a new test that must fail first;
 * unmapped, an old test that must still pass; and its new name must be a
 * test in the file. Any other one is missing, with a hint that only the
 * table may rename a test. A declared rename of a test that didn't pass at
 * the baseline is a note.
 *
 * One in a `.swift` file whose tests don't build yet (#668), with no results
 * for that file, is not run: noted, not missing, while its name is still in
 * the file's text (`texts`).
 */
export const checkOldTests = ({
    baseline,
    current,
    texts,
    mapping,
    renames,
}: {
    baseline: TestRun
    current: TestRun
    texts: Record<string, string | null>
    mapping: CriterionTests[]
    renames: TestRename[]
}): { problems: string[]; notes: string[] } => {
    const problems: string[] = []
    const notes: string[] = []
    const same = (a: TestCase, b: TestCase) =>
        a.file === b.file && a.full_name === b.full_name
    const movable = current.cases.filter(
        (now) => !baseline.cases.some((old) => same(old, now))
    )
    const claimed = new Set<TestCase>()
    const passed = baseline.cases.filter(({ status }) => status === 'passed')
    for (const old of passed) {
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
            const new_name = renamedName({
                renames,
                file: old.file,
                full_name: old.full_name,
            })
            if (new_name !== undefined) {
                const outcome = checkRenamed({
                    old,
                    new_name,
                    current,
                    mapping,
                    texts,
                })
                if ('problem' in outcome) problems.push(outcome.problem)
                else notes.push(outcome.note)
            } else if (notRun({ old, current, texts })) {
                notes.push(
                    `${label}: not run (the tests do not build yet); the gates run it`
                )
            } else problems.push(`${label} is missing${MISSING_HINT}`)
            continue
        }
        claimed.add(moved)
        const where = `old test "${old.full_name}" in ${moved.file} (moved from ${old.file})`
        if (moved.status === 'passed')
            notes.push(`${where}: still passes, as it should`)
        else problems.push(`${where} no longer passes`)
    }
    for (const rename of renames) {
        if (
            !passed.some(({ file, full_name }) =>
                renamesTest({ rename, file, full_name })
            )
        ) {
            const old = rename.describe
                ? `describe('${rename.old_name}')`
                : rename.old_name
            notes.push(
                `the ticket declares "${old}" in ${rename.file} renamed, but no such test passed at the baseline`
            )
        }
    }
    return { problems, notes }
}
