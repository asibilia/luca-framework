import type { EngineConfig } from '../config/engine-config'
import type { TestRun } from '../gates/gate-schemas'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'

/**
 * Journal entry builders for the build steps, so decision-step tests can
 * write a journal that stops anywhere along a ticket's spine.
 */

export const BUILD_CONFIG: EngineConfig = {
    checks: { test: 'bun test', types: 'bun run types', lint: 'bun run lint' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

/** A ticket as intake snapshots it. */
export const practiceTicket = ({
    number,
    title,
    criteria,
}: {
    number: number
    title?: string
    criteria?: string[]
}): TicketSnapshot => ({
    number,
    title: title ?? 'Add sum',
    body: '## What to build\n\nA sum function.',
    labels: ['ready-for-agent'],
    url: `https://github.com/acme/app/issues/${number}`,
    criteria: (criteria ?? ['sum adds two numbers']).map((text, index) => ({
        id: `AC${index + 1}`,
        text,
    })),
    blockers: [],
})

/** A run whose intake passed with these tickets, in this order. */
export const intakePassed = ({
    tickets,
}: {
    tickets: TicketSnapshot[]
}): JournalEntry[] => [
    {
        kind: 'run_started',
        ticket: null,
        role: null,
        content: { spec_number: 10, config: BUILD_CONFIG, base_branch: 'main' },
    },
    {
        kind: 'spec_snapshot',
        ticket: 10,
        role: null,
        content: {
            spec: {
                number: 10,
                title: 'Practice spec',
                body: '## Testing Decisions\n\n- Test the sum.',
                labels: ['ready-for-agent'],
                url: 'https://github.com/acme/app/issues/10',
            },
            ticket_order: tickets.map((ticket) => ticket.number),
            closed_tickets: [],
        },
    },
    ...tickets.map(
        (ticket): JournalEntry => ({
            kind: 'ticket_snapshot',
            ticket: ticket.number,
            role: null,
            content: ticket,
        })
    ),
]

export const RUN_BRANCH = 'luca/spec-10-run'

export const runBranchCreated = (): JournalEntry => ({
    kind: 'run_branch_created',
    ticket: null,
    role: null,
    content: {
        branch: RUN_BRANCH,
        path: '/runs/run/run-branch',
        base_sha: 'b0',
    },
})

export const ticketWorktreeCreated = ({
    ticket,
}: {
    ticket: number
}): JournalEntry => ({
    kind: 'ticket_worktree_created',
    ticket,
    role: null,
    content: {
        branch: `${RUN_BRANCH}--ticket-${ticket}`,
        path: `/runs/run/tickets/${ticket}`,
        base_sha: 'b0',
    },
})

/** A test run with no test files, as a fresh repo has. */
export const emptyTestRun = (): TestRun => ({
    command: 'bun test',
    ok: true,
    exit_code: 1,
    no_test_files: true,
    cases: [],
    files_without_results: [],
    output: '0 test files matching',
})

export const baselineTests = ({
    ticket,
}: {
    ticket: number
}): JournalEntry => ({
    kind: 'baseline_tests',
    ticket,
    role: null,
    content: emptyTestRun(),
})

export const testsWritten = ({ ticket }: { ticket: number }): JournalEntry => ({
    kind: 'agent_finished',
    ticket,
    role: 'test-writer',
    content: {
        role: 'test-writer',
        result: {
            outcome: 'tests_written',
            criteria: [
                {
                    criterion_id: 'AC1',
                    tests: [
                        {
                            file: 'src/sum.test.ts',
                            name: 'sum adds two numbers',
                        },
                    ],
                },
            ],
            summary: 'One test for AC1.',
            assumptions: ['Numbers are integers.'],
            run_notes: [],
        },
    },
})

export const redCheck = ({
    ticket,
    ok,
}: {
    ticket: number
    ok: boolean
}): JournalEntry => ({
    kind: 'red_check',
    ticket,
    role: null,
    content: {
        ok,
        problems: ok ? [] : ['"sum adds two numbers" passes already'],
        notes: [],
        tests: emptyTestRun(),
    },
})

export const leftoverScan = ({
    ticket,
    stage,
    hits,
}: {
    ticket: number
    stage: 'red' | 'green'
    hits?: { path: string; reason: string }[]
}): JournalEntry => ({
    kind: 'leftover_scan',
    ticket,
    role: null,
    content: { stage, hits: hits ?? [] },
})

export const commitMade = ({
    ticket,
    stage,
}: {
    ticket: number
    stage: 'red' | 'green'
}): JournalEntry => ({
    kind: 'commit_made',
    ticket,
    role: null,
    content: { stage, sha: `${stage}-sha`, message: stage, files: [] },
})

export const implemented = ({
    ticket,
    outcome,
}: {
    ticket: number
    outcome?: 'done' | 'bad_test'
}): JournalEntry => ({
    kind: 'agent_finished',
    ticket,
    role: 'implementer',
    content: {
        role: 'implementer',
        result: {
            outcome: outcome ?? 'done',
            bad_test:
                outcome === 'bad_test'
                    ? {
                          file: 'src/sum.test.ts',
                          name: 'sum adds two numbers',
                          reason: 'Wrong sum.',
                      }
                    : null,
            summary: 'Added sum.',
            assumptions: [],
            run_notes: [],
        },
    },
})

export const gatesRun = ({
    ticket,
    target,
    ok,
}: {
    ticket: number
    target: 'ticket' | 'run_branch'
    ok: boolean
}): JournalEntry => ({
    kind: 'gates_run',
    ticket,
    role: null,
    content: {
        target,
        ok,
        checks: [
            {
                name: 'test',
                command: 'bun test',
                ok,
                exit_code: ok ? 0 : 1,
                output: ok ? '' : '1 fail',
            },
        ],
    },
})

export const reviewed = ({
    ticket,
    verdict,
}: {
    ticket: number
    verdict?: 'approve' | 'changes_requested'
}): JournalEntry => ({
    kind: 'agent_finished',
    ticket,
    role: 'ticket-reviewer',
    content: {
        role: 'ticket-reviewer',
        result: {
            verdict: verdict ?? 'approve',
            findings: [],
            summary: 'Looks right.',
            assumptions: [],
        },
    },
})

export const joined = ({ ticket }: { ticket: number }): JournalEntry => ({
    kind: 'ticket_joined',
    ticket,
    role: null,
    content: { ok: true, shas: ['r1', 'g1'] },
})

export const pushed = ({ ticket }: { ticket: number }): JournalEntry => ({
    kind: 'run_branch_pushed',
    ticket,
    role: null,
    content: { branch: RUN_BRANCH, sha: 'g1' },
})

/** Every step of one ticket, from its worktree to the push, all passing. */
export const ticketBuilt = ({ ticket }: { ticket: number }): JournalEntry[] => [
    ticketWorktreeCreated({ ticket }),
    baselineTests({ ticket }),
    testsWritten({ ticket }),
    redCheck({ ticket, ok: true }),
    leftoverScan({ ticket, stage: 'red' }),
    commitMade({ ticket, stage: 'red' }),
    implemented({ ticket }),
    gatesRun({ ticket, target: 'ticket', ok: true }),
    leftoverScan({ ticket, stage: 'green' }),
    commitMade({ ticket, stage: 'green' }),
    reviewed({ ticket }),
    joined({ ticket }),
    gatesRun({ ticket, target: 'run_branch', ok: true }),
    pushed({ ticket }),
]
