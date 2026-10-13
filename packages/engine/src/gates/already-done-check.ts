import uniqBy from 'lodash/uniqBy'

import { endedText, type GateCheck, type TestRun } from './gate-schemas'
import { findCase } from './red-check'

import type { CriterionTests, TestRef } from '../agents/role-results'
import type { CommitPlace } from '../git/git-adapter'

/** What the engine's check of `already_done` evidence found (#495). */
export type AlreadyDoneCheckResult = { ok: boolean; problems: string[] }

/** What is wrong with one named test, or `null` if it passes on the base. */
const testProblem = ({
    test,
    missing,
    test_files,
    changed,
    run,
}: {
    test: TestRef
    missing: Set<string>
    test_files: Set<string>
    changed: Set<string>
    run: TestRun | null
}): string | null => {
    const label = `"${test.name}" in ${test.file}`
    if (missing.has(test.file)) return `${label}: the file does not exist`
    if (!test_files.has(test.file)) {
        return `${label}: the file is not a test file`
    }
    if (changed.has(test.file)) {
        return `${label}: the file has changes that are not on the base`
    }
    // No run: the prepare command failed, and says so itself.
    if (run === null) return null
    const found = findCase({ cases: run.cases, test })
    if (found?.status === 'passed') return null
    if (found?.status === 'skipped') return `${label}: is skipped`
    if (found !== undefined) return `${label}: fails on the base`
    return run.files_without_results.includes(test.file)
        ? `${label}: its file did not load, so none of its tests ran`
        : `${label}: not found in the test results`
}

/**
 * The engine's check of a test-writer's `already_done` evidence (#495).
 * Pure: every named commit is on the base (the commit the ticket's
 * worktree started from), every criterion names a test, and every named
 * test is in a test file that exists, is as it is on the base, and passes
 * there.
 *
 * @param commits - Each named commit, and where git found it.
 * @param missing - The named test files that do not exist in the worktree.
 * @param test_files - The worktree's test files, per the engine config.
 * @param changed - The worktree's uncommitted changes.
 * @param prepare - The prepare command's run before the tests, if any.
 * @param run - The run of the named test files; `null` if none ran.
 *
 * @example
 * const result = checkAlreadyDone({ base_sha, criteria_ids: ['AC1'], criteria, commits, missing: [], test_files, changed: [], prepare: null, run })
 * if (!result.ok) console.error(result.problems)
 */
export const checkAlreadyDone = ({
    base_sha,
    criteria_ids,
    criteria,
    commits,
    missing,
    test_files,
    changed,
    prepare,
    run,
}: {
    base_sha: string
    criteria_ids: string[]
    criteria: CriterionTests[]
    commits: { sha: string; place: CommitPlace }[]
    missing: string[]
    test_files: string[]
    changed: string[]
    prepare: GateCheck | null
    run: TestRun | null
}): AlreadyDoneCheckResult => {
    const problems: string[] = []
    for (const { sha, place } of commits) {
        if (place === 'unknown') {
            problems.push(`commit ${sha}: not found in the repo`)
        } else if (place === 'not_on_base') {
            problems.push(
                `commit ${sha}: not on the base (${base_sha}, where this ticket started)`
            )
        }
    }
    for (const id of criteria_ids) {
        const entry = criteria.find(({ criterion_id }) => criterion_id === id)
        if (entry === undefined || entry.tests.length === 0) {
            problems.push(`${id} names no test`)
        }
    }
    if (prepare !== null && !prepare.ok) {
        problems.push(
            `The prepare command \`${prepare.command}\` failed (${endedText(prepare)}), so no test ran:\n${prepare.output}`
        )
    }
    const tests = uniqBy(
        criteria.flatMap(({ tests }) => tests),
        ({ file, name }) => `${file}\0${name}`
    )
    for (const test of tests) {
        const problem = testProblem({
            test,
            missing: new Set(missing),
            test_files: new Set(test_files),
            changed: new Set(changed),
            run,
        })
        if (problem !== null) problems.push(problem)
    }
    return { ok: problems.length === 0, problems }
}
