/**
 * The prompt sections for a ticket sent back onto the run branch: after a
 * clash or failed gates at the join (`rejoinSection`), and after a rebase
 * made its tests wrong (`testUpdateSection`, #489).
 */
import type { AgentRole, BadTest, Finding } from './role-results'

import type { RejoinCause } from '../journal/journal-record'

/**
 * Why and how a ticket was sent back onto the run branch, for the prompts of
 * the agents that fix it there: the cause, the run branch commit it now
 * starts from, the files that clashed (tests and code), and the findings of
 * the review that approved it.
 */
export type RejoinContext = {
    cause: RejoinCause
    base_sha: string
    tests: string[]
    code: string[]
    earlier_findings: Finding[]
}

const fileList = (files: string[]): string =>
    files.map((file) => `- ${file}`).join('\n')

/** One line on what happened to the ticket, for every rejoin section. */
export const rejoinOpening = ({ rejoin }: { rejoin: RejoinContext }): string =>
    rejoin.cause === 'clash'
        ? `Other tickets joined the run branch after this ticket started, and this ticket's change clashed with them. ` +
          `The engine put this ticket's whole change back on top of the run branch (commit ${rejoin.base_sha}), as uncommitted changes in the worktree.`
        : `The gates failed on the run branch after this ticket joined it. ` +
          `The engine undid the join and put this ticket's whole change back on top of the run branch (commit ${rejoin.base_sha}), as uncommitted changes in the worktree.`

/**
 * The section a fresh test-writer or implementer gets while it fixes a
 * ticket on top of the run branch: the clashed test files, or the clashed
 * code (or the failed gates). `null` for a role with nothing to fix there.
 * The reviewer's re-review is the review's own (`reviewSections`).
 *
 * @example
 * const section = rejoinSection({ role: 'test-writer', rejoin })
 */
export const rejoinSection = ({
    role,
    rejoin,
}: {
    role: AgentRole
    rejoin: RejoinContext
}): string | null => {
    if (role === 'test-writer') {
        if (rejoin.tests.length === 0) return null
        return [
            '## This ticket clashed with the run branch',
            rejoinOpening({ rejoin }),
            `These test files have conflict markers:\n\n${fileList(rejoin.tests)}`,
            "Resolve the markers so the tests check both what the run branch already has and this ticket's criteria. " +
                'Change nothing else. Answer with the full criterion mapping again.',
        ].join('\n\n')
    }
    if (role === 'implementer') {
        return [
            '## This ticket is being fixed on top of the run branch',
            rejoinOpening({ rejoin }),
            rejoin.code.length > 0
                ? `These files have conflict markers:\n\n${fileList(rejoin.code)}\n\nResolve them so the code keeps both what the run branch has and what this ticket adds, and make every gate pass.`
                : 'Make every gate pass on top of the run branch.',
        ].join('\n\n')
    }
    return null
}

/** What joined the run branch, as a test update names it (#489). */
export type JoinedSince = {
    /** Where the ticket started from before the rebase. */
    from_sha: string
    /** Where it starts from now. */
    base_sha: string
    joined: { ticket: number; title: string }[]
    files: string[]
}

/** How many changed files a test update lists before it says "and N more". */
const FILES_LISTED = 30

const joinedText = ({ since }: { since: JoinedSince }): string => {
    const tickets =
        since.joined.length === 0
            ? '- (no ticket of this run: other commits on the run branch)'
            : since.joined
                  .map(({ ticket, title }) => `- #${ticket} ${title}`)
                  .join('\n')
    const listed = since.files.slice(0, FILES_LISTED)
    const more = since.files.length - listed.length
    const files =
        since.files.length === 0
            ? '- (none)'
            : fileList(listed) + (more > 0 ? `\n- and ${more} more` : '')
    return [
        `What joined the run branch since this ticket's tests were written (\`git log ${since.from_sha}..${since.base_sha}\`):\n\n${tickets}`,
        `The files it changed (\`git diff ${since.from_sha} ${since.base_sha}\`):\n\n${files}`,
    ].join('\n\n')
}

/**
 * The section a test-writer gets when its ticket's tests go back to it
 * after a rebase (#489): what joined the run branch since the tests were
 * written, the test the implementer sent back and why, and what to do. The
 * implementer's code stays in the worktree.
 *
 * @example
 * testUpdateSection({ since, bad_test })
 * // '## The run branch changed under this ticket\'s tests\n\n...'
 */
export const testUpdateSection = ({
    since,
    bad_test,
}: {
    since: JoinedSince
    bad_test: BadTest
}): string =>
    [
        "## The run branch changed under this ticket's tests",
        `Other tickets joined the run branch after this ticket's tests were written. The engine put this ticket's whole change on top of the run branch (commit ${since.base_sha}), as uncommitted changes in the worktree. The implementer's code is already there.`,
        joinedText({ since }),
        `The implementer says this test is wrong now:\n\n- File: ${bad_test.file}\n- Test: ${bad_test.name}\n- Reason: ${bad_test.reason}`,
        [
            "Update this ticket's tests so they fit what the run branch does now, and still check every criterion of this ticket. " +
                "Read what joined (`git log`, `git show`) before you change a test: the run branch's behavior wins where it and an old test disagree.",
            '- Edit test files only. Keep the code as it is: the implementer finishes it after you.',
            "- Keep the other tests unless the run branch makes them wrong too. Don't weaken a test to make it pass: change what it expects only where the run branch changed.",
            "- The ticket's code is already in the worktree, so your updated tests may pass now. That is fine here.",
            '- Answer with the full criterion mapping again: every criterion, the kept tests included.',
        ].join('\n'),
    ].join('\n\n')
