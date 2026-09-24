import type { AgentRole, BadTest, Finding } from './role-results'

import type { SpecSnapshot, TicketSnapshot } from '../intake/intake-schemas'
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

/** A refactor ticket's implementer's task, in place of the usual one. */
const REFACTOR_TASK =
    'This is a refactor ticket: change how the code is shaped, not what it does. Add no new behavior. ' +
    'Make every gate pass. You may follow renames and moves into test files, but you must not change what a test checks. ' +
    'If a test is wrong, answer "bad_test" with your reason.'

/** What a fresh test-writer is told when it replaces a bad test. */
const badTestSection = ({ bad_test }: { bad_test: BadTest }): string =>
    [
        '## A test was sent back as a bad test',
        `The implementer says this test is wrong:\n\n- File: ${bad_test.file}\n- Test: ${bad_test.name}\n- Reason: ${bad_test.reason}`,
        'Fix or replace it so it checks what its criterion asks. Keep the other tests unless they are wrong too. ' +
            'Answer with the full criterion mapping again: every criterion, the kept tests included.',
    ].join('\n\n')

/** What a refactor ticket's reviewer also checks. */
const REFACTOR_REVIEW_TASK =
    'This is a refactor ticket: also check that behavior did NOT change. ' +
    "No test's meaning changed, no test was weakened or dropped, and no new behavior was added. " +
    'A behavior change is a blocker.'

const ROLE_TASKS: Record<AgentRole, string> = {
    'test-writer':
        'Write failing tests for every acceptance criterion below. Edit test files only. ' +
        'Map each criterion id to the tests that check it.',
    implementer:
        'Make every gate pass. Never edit a test file. ' +
        'If a test is wrong, answer "bad_test" with your reason. ' +
        'Never run the package install: when you change a package manifest, ' +
        'the engine runs the install and commits the lockfile.',
    'ticket-reviewer':
        "Review this ticket's committed diff. Check that it meets every acceptance criterion with honest tests. " +
        'Write nothing.',
}

/**
 * The prompt an agent starts with: its task, the spec, and its ticket with
 * each criterion's id. The engine journals it word for word.
 *
 * The real per-role instructions come with the Claude launcher (#362); this
 * is the part every launcher gets.
 *
 * @param refactor - The ticket is a refactor ticket: the implementer gets
 *   the refactor task (no new behavior; it may follow renames into tests).
 * @param bad_test - For a fresh test-writer after a bad-test bounce: the
 *   test the implementer sent back, and why.
 * @param sections - More sections for the end, such as a reviewer's diff
 *   and gate results, or a review fixer's findings.
 *
 * @example
 * const prompt = rolePrompt({ role: 'test-writer', spec, ticket })
 */
export const rolePrompt = ({
    role,
    spec,
    ticket,
    refactor,
    bad_test,
    sections,
}: {
    role: AgentRole
    spec: SpecSnapshot
    ticket: TicketSnapshot
    refactor?: boolean
    bad_test?: BadTest | null
    sections?: string[]
}): string =>
    [
        `# Your role: ${role}`,
        role === 'implementer' && refactor ? REFACTOR_TASK : ROLE_TASKS[role],
        ...(role === 'ticket-reviewer' && refactor
            ? [REFACTOR_REVIEW_TASK]
            : []),
        `## Spec #${spec.number}: ${spec.title}`,
        spec.body,
        `## Ticket #${ticket.number}: ${ticket.title}`,
        ticket.body,
        '## Acceptance criteria',
        ticket.criteria.map(({ id, text }) => `- ${id}: ${text}`).join('\n'),
        ...(role === 'test-writer' && bad_test
            ? [badTestSection({ bad_test })]
            : []),
        ...(sections ?? []),
    ].join('\n\n')
