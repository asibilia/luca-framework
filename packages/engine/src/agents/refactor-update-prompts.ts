/**
 * The texts of a refactor test update (#686): the section a fresh
 * test-writer gets in place of the rejoin's test update section, and the
 * follow-up the implementer gets once it answered.
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
