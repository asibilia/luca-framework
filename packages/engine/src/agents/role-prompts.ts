import type { AgentRole } from './role-results'

import type { SpecSnapshot, TicketSnapshot } from '../intake/intake-schemas'

const ROLE_TASKS: Record<AgentRole, string> = {
    'test-writer':
        'Write failing tests for every acceptance criterion below. Edit test files only. ' +
        'Map each criterion id to the tests that check it.',
    implementer:
        'Make every gate pass. Never edit a test file. ' +
        'If a test is wrong, answer "bad_test" with your reason.',
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
 * @example
 * const prompt = rolePrompt({ role: 'test-writer', spec, ticket })
 */
export const rolePrompt = ({
    role,
    spec,
    ticket,
}: {
    role: AgentRole
    spec: SpecSnapshot
    ticket: TicketSnapshot
}): string =>
    [
        `# Your role: ${role}`,
        ROLE_TASKS[role],
        `## Spec #${spec.number}: ${spec.title}`,
        spec.body,
        `## Ticket #${ticket.number}: ${ticket.title}`,
        ticket.body,
        '## Acceptance criteria',
        ticket.criteria.map(({ id, text }) => `- ${id}: ${text}`).join('\n'),
    ].join('\n\n')
