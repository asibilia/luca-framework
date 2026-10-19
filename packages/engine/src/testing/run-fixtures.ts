/**
 * Journal entry builders for a run's scaffolding: its config and tickets, its
 * branch and worktrees, the installs and baseline tests, and the end of the
 * run (worktrees removed, the PR opened).
 */
import { SPEC_OWNER } from './intake-fixtures'

import type { EngineConfig } from '../config/engine-config'
import type { TestRun } from '../gates/gate-schemas'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'

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
    labels,
    blockers,
}: {
    number: number
    title?: string
    criteria?: string[]
    /** Defaults to `ready-for-agent` only; add `refactor` for a refactor ticket. */
    labels?: string[]
    /** The tickets it waits on. Defaults to none. */
    blockers?: number[]
}): TicketSnapshot => ({
    number,
    title: title ?? 'Add sum',
    body: '## What to build\n\nA sum function.',
    labels: labels ?? ['ready-for-agent'],
    url: `https://github.com/acme/app/issues/${number}`,
    criteria: (criteria ?? ['sum adds two numbers']).map((text, index) => ({
        id: `AC${index + 1}`,
        text,
    })),
    blockers: blockers ?? [],
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
                author: SPEC_OWNER,
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

/** Where fixtures put each ticket's worktree, and the run branch's. */
export const ticketPath = (ticket: number): string =>
    `/runs/run/tickets/${ticket}`

export const RUN_BRANCH_PATH = '/runs/run/run-branch'

export const runBranchCreated = (): JournalEntry => ({
    kind: 'run_branch_created',
    ticket: null,
    role: null,
    content: {
        branch: RUN_BRANCH,
        path: RUN_BRANCH_PATH,
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
        path: ticketPath(ticket),
        base_sha: 'b0',
    },
})

/**
 * The engine's install in a new worktree: the run branch's checkout
 * (`ticket` unset) or a ticket's worktree. Passing unless `ok` is false.
 */
export const dependenciesInstalled = ({
    ticket,
    ok,
}: {
    ticket?: number
    ok?: boolean
}): JournalEntry => ({
    kind: 'dependencies_installed',
    ticket: ticket ?? null,
    role: null,
    content: {
        target: ticket === undefined ? 'run_branch' : 'ticket',
        check: {
            name: 'install',
            command: 'bun install --frozen-lockfile',
            ok: ok ?? true,
            exit_code: ok === false ? 1 : 0,
            output:
                ok === false
                    ? 'error: lockfile had changes, but lockfile is frozen'
                    : '',
        },
    },
})

/**
 * The entries with a passing install after each new worktree that has none,
 * so tests about later steps need not list the installs.
 */
export const withInstalls = ({
    entries,
}: {
    entries: JournalEntry[]
}): JournalEntry[] =>
    entries.flatMap((entry, index) => {
        const made =
            entry.kind === 'run_branch_created' ||
            entry.kind === 'ticket_worktree_created'
        if (!made || entries[index + 1]?.kind === 'dependencies_installed') {
            return [entry]
        }
        return [
            entry,
            dependenciesInstalled({ ticket: entry.ticket ?? undefined }),
        ]
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

/** The engine removed these worktrees at the end of the run. */
export const worktreesRemoved = ({
    paths,
}: {
    paths: string[]
}): JournalEntry => ({
    kind: 'worktrees_removed',
    ticket: null,
    role: null,
    content: { paths },
})

/** The run's one PR, #99, opened from the run branch. */
export const pullRequestOpened = (): JournalEntry => ({
    kind: 'pull_request_opened',
    ticket: null,
    role: null,
    content: {
        number: 99,
        url: 'https://github.com/acme/app/pull/99',
        head: RUN_BRANCH,
        base: 'main',
        title: 'Practice spec (#10)',
        body: '',
    },
})
