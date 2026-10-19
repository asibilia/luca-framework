/**
 * Journal records about the run itself: its start and intake, the run
 * branch, each ticket's worktree and baseline, a stop, the push, and the PR.
 */
import { entry, testRun, type Entry } from './journal-fixture-base'

export const runStarted = ({ spec }: { spec: number }): Entry =>
    entry({
        kind: 'run_started',
        content: {
            spec_number: spec,
            base_branch: 'main',
            config: { checks: { test: 'bun test' } },
        },
    })

export const intakeRead = ({ spec }: { spec: number }): Entry =>
    entry({
        kind: 'intake_read',
        ticket: spec,
        content: { spec: { number: spec, title: 'Spec' }, sub_tickets: [] },
    })

export const intakeRefused = ({
    problems,
}: {
    problems: { ticket: number | null; missing: string[] }[]
}): Entry => entry({ kind: 'intake_refused', content: { problems } })

export const nothingToDo = (): Entry =>
    entry({ kind: 'nothing_to_do', content: { closed_tickets: [3, 4] } })

export const specSnapshot = ({
    spec,
    title,
    order,
    author = 'owner',
}: {
    spec: number
    title: string
    order: number[]
    /** The spec's owner; `null` leaves it out, as older journals do. */
    author?: string | null
}): Entry =>
    entry({
        kind: 'spec_snapshot',
        ticket: spec,
        content: {
            spec: {
                number: spec,
                title,
                body: '## Testing Decisions\n...',
                labels: [],
                url: `https://github.com/o/r/issues/${spec}`,
                ...(author === null ? {} : { author }),
            },
            ticket_order: order,
            closed_tickets: [],
        },
    })

export const ticketSnapshot = ({
    number,
    title,
    blockers = [],
    labels = ['ready-for-agent'],
}: {
    number: number
    title: string
    blockers?: number[]
    labels?: string[]
}): Entry =>
    entry({
        kind: 'ticket_snapshot',
        ticket: number,
        content: {
            number,
            title,
            body: '## What to build\n...',
            labels,
            url: `https://github.com/o/r/issues/${number}`,
            criteria: [{ id: 'AC1', text: 'It works' }],
            blockers,
        },
    })

export const runBranchCreated = ({ branch }: { branch: string }): Entry =>
    entry({
        kind: 'run_branch_created',
        content: { branch, path: '/tmp/run', base_sha: 'abc123' },
    })

export const ticketWorktreeCreated = ({ ticket }: { ticket: number }): Entry =>
    entry({
        kind: 'ticket_worktree_created',
        ticket,
        content: {
            branch: `luca/${ticket}`,
            path: `/tmp/t${ticket}`,
            base_sha: 'abc123',
        },
    })

/**
 * The engine's install in a new worktree: a ticket's, or with no `ticket`,
 * the run branch's checkout.
 */
export const dependenciesInstalled = ({
    ticket,
    ok,
}: {
    ticket?: number
    ok: boolean
}): Entry =>
    entry({
        kind: 'dependencies_installed',
        ticket: ticket ?? null,
        content: {
            target: ticket === undefined ? 'run_branch' : 'ticket',
            check: {
                name: 'install',
                command: 'bun install --frozen-lockfile',
                ok,
                exit_code: ok ? 0 : 1,
                output: ok ? '' : 'error: lockfile had changes',
            },
        },
    })

export const baselineTests = ({
    ticket,
    passed,
}: {
    ticket: number
    passed: number
}): Entry =>
    entry({
        kind: 'baseline_tests',
        ticket,
        content: testRun({ passed, failed: 0 }),
    })

export const runStopped = ({
    ticket,
    role,
    reason,
    billing = false,
}: {
    ticket: number | null
    role: string | null
    reason: string
    billing?: boolean
}): Entry =>
    entry({
        kind: 'run_stopped',
        ticket,
        role,
        content: { reason, role, billing },
    })

export const worktreeReset = ({ ticket }: { ticket: number }): Entry =>
    entry({ kind: 'worktree_reset', ticket, content: { sha: `red-${ticket}` } })

export const worktreesRemoved = ({ paths }: { paths: string[] }): Entry =>
    entry({ kind: 'worktrees_removed', content: { paths } })

export const runBranchPushed = ({ ticket }: { ticket: number }): Entry =>
    entry({
        kind: 'run_branch_pushed',
        ticket,
        content: { branch: 'luca/run-10', sha: 'g1' },
    })

export const pullRequestOpened = ({
    number,
    url,
}: {
    number: number
    url: string
}): Entry =>
    entry({
        kind: 'pull_request_opened',
        content: {
            number,
            url,
            head: 'luca/run-10',
            base: 'main',
            title: 'Spec',
            body: '',
        },
    })

/** Intake that passes on spec 10 with tickets 11, 12 (waits on 11), 13. */
export const intakeOfThree = (): Entry[] => [
    runStarted({ spec: 10 }),
    intakeRead({ spec: 10 }),
    specSnapshot({ spec: 10, title: 'Add CSV export', order: [11, 12, 13] }),
    ticketSnapshot({
        number: 11,
        title: 'Rename the report module',
        labels: ['ready-for-agent', 'refactor'],
    }),
    ticketSnapshot({ number: 12, title: 'Export rows', blockers: [11] }),
    ticketSnapshot({ number: 13, title: 'Add the menu item' }),
    runBranchCreated({ branch: 'luca/run-10' }),
]
