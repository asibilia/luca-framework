import type { AgentRole, BadTest } from './role-results'

import type { SpecSnapshot, TicketSnapshot } from '../intake/intake-schemas'

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
