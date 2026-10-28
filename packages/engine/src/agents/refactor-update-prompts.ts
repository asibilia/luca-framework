/**
 * The texts of a refactor test update (#686): the section a fresh
 * test-writer gets in place of the rejoin's test update section, the
 * follow-up the implementer gets once it answered, and what the
 * ticket-reviewer is told once it closed.
 */

/**
 * The section a test-writer gets when a refactor ticket's implementer sent
 * a test back as bad: why, and that it may change only that file.
 *
 * @example
 * refactorUpdateSection({ file: 'src/rows.test.ts', reason: 'It pins the old order.' })
 */
export const refactorUpdateSection = ({
    file,
    reason,
}: {
    file: string
    reason: string
}): string =>
    [
        "## A refactor ticket's test was sent back as bad",
        `The implementer says this test is wrong:\n\n- File: ${file}\n- Reason: ${reason || 'no reason given'}`,
        `This is a refactor ticket. Change only ${file}, and only so it checks what the ticket's criteria say.`,
        "The implementer's work is already in the worktree, so the test may pass now. That is fine here.",
    ].join('\n\n')

/**
 * The follow-up a refactor ticket's implementer gets once the test-writer
 * fixed the test it sent back.
 *
 * @example
 * refactorTestFixedMessage({ file: 'src/rows.test.ts' })
 */
export const refactorTestFixedMessage = ({ file }: { file: string }): string =>
    `The test-writer changed ${file} so it checks what the ticket's criteria say. Carry on with the refactor. You may follow renames into test files, but don't change what a test checks.`

/**
 * The section a refactor ticket's reviewer gets once a refactor test update
 * fixed a test: which file, why, and that only that change to what a test
 * checks is expected.
 *
 * @example
 * refactorFixedReviewSection({ fixed: [{ file: 'src/rows.test.ts', reason: 'It pins the old order.' }] })
 */
export const refactorFixedReviewSection = ({
    fixed,
}: {
    fixed: { file: string; reason: string }[]
}): string =>
    [
        '## Tests a test-writer changed on purpose',
        "The implementer sent these tests back as bad, and a test-writer changed them so they check what the ticket's criteria say. The engine checked it changed no other test file.",
        fixed
            .map(
                ({ file, reason }) =>
                    `- File: ${file}\n  Reason: ${reason || 'no reason given'}`
            )
            .join('\n'),
        "This change to what these tests check is expected: judge it against the ticket's criteria, not as a behavior change. Any other change to what a test checks is still a blocker.",
    ].join('\n\n')
