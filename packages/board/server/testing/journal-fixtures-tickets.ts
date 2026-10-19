/**
 * Journal records about one ticket's work: the red check, scans and commits,
 * the gates, the ticket review and its fixes, the join and rebase, and
 * `wholeTicket`, every step of one ticket.
 */
import { entry, RESULTS, testRun, type Entry } from './journal-fixture-base'
import {
    agentFinished,
    agentSession,
    agentStarted,
} from './journal-fixtures-agents'
import {
    baselineTests,
    runBranchPushed,
    ticketWorktreeCreated,
} from './journal-fixtures-run'

export const redCheck = ({
    ticket,
    ok,
    failing,
    passing,
}: {
    ticket: number
    ok: boolean
    failing: number
    passing: number
}): Entry =>
    entry({
        kind: 'red_check',
        ticket,
        content: {
            ok,
            problems: ok ? [] : ['A new test passes before any code'],
            notes: [],
            tests: testRun({ passed: passing, failed: failing }),
        },
    })

export const leftoverScan = ({
    ticket,
    stage,
    hits = [],
}: {
    ticket: number
    stage: 'red' | 'green' | 'fix'
    hits?: { path: string; reason: string }[]
}): Entry => entry({ kind: 'leftover_scan', ticket, content: { stage, hits } })

export const commitMade = ({
    ticket,
    stage,
}: {
    ticket: number
    stage: 'red' | 'green' | 'fix'
}): Entry =>
    entry({
        kind: 'commit_made',
        ticket,
        content: {
            stage,
            sha: `${stage}-${ticket}`,
            message: `${stage} #${ticket}`,
            files: stage === 'fix' ? [] : ['a.ts'],
        },
    })

/** One ticket-review finding, as the ticket-reviewer reports it. */
export type Finding = {
    id: string
    severity: 'blocker' | 'should_fix' | 'nit'
    kind: 'code' | 'test'
    file: string | null
    title: string
    detail: string
}

export const finding = ({
    id,
    severity,
    kind = 'code',
}: {
    id: string
    severity: Finding['severity']
    kind?: Finding['kind']
}): Finding => ({
    id,
    severity,
    kind,
    file: kind === 'test' ? 'src/a.test.ts' : 'src/a.ts',
    title: `Finding ${id}`,
    detail: `The detail of ${id}.`,
})

/** A re-reviewer's ruling on a fixer's "won't fix". */
export type Ruling = {
    finding_id: string
    ruling: 'accepted' | 'rejected'
    reason: string
}

/**
 * The ticket-reviewer's result: `changes_requested` exactly when some
 * finding is a blocker or a should-fix.
 */
export const reviewFinished = ({
    ticket,
    findings = [],
    rulings = [],
}: {
    ticket: number
    findings?: Finding[]
    rulings?: Ruling[]
}): Entry =>
    agentFinished({
        ticket,
        role: 'ticket-reviewer',
        result: {
            verdict: findings.some(({ severity }) => severity !== 'nit')
                ? 'changes_requested'
                : 'approve',
            findings,
            rulings,
            summary: '',
            assumptions: [],
        },
    })

/** A fixer's answer to one review finding. */
export type FindingResponse = {
    finding_id: string
    response: 'fixed' | 'wont_fix'
    reason: string
}

/** A review fixer's (test-writer or implementer) result. */
export const fixerFinished = ({
    ticket,
    role,
    responses,
}: {
    ticket: number
    role: 'test-writer' | 'implementer'
    responses: FindingResponse[]
}): Entry =>
    agentFinished({
        ticket,
        role,
        result: {
            ...(RESULTS[role] as Record<string, unknown>),
            finding_responses: responses,
        },
    })

export const gatesRun = ({
    ticket,
    ok,
    target = 'ticket',
}: {
    ticket: number
    ok: boolean
    target?: 'ticket' | 'run_branch'
}): Entry =>
    entry({
        kind: 'gates_run',
        ticket,
        content: {
            target,
            ok,
            checks: [
                {
                    name: 'test',
                    command: 'bun test',
                    ok,
                    exit_code: ok ? 0 : 1,
                    output: '',
                },
                {
                    name: 'types',
                    command: 'tsc',
                    ok: true,
                    exit_code: 0,
                    output: '',
                },
            ],
        },
    })

export const ticketJoined = ({ ticket }: { ticket: number }): Entry =>
    entry({
        kind: 'ticket_joined',
        ticket,
        content: { ok: true, shas: ['r1', 'g1'] },
    })

export const joinClashed = ({ ticket }: { ticket: number }): Entry =>
    entry({
        kind: 'ticket_joined',
        ticket,
        content: { ok: false, error: 'CONFLICT (content): src/index.ts' },
    })

export const ticketRebased = ({
    ticket,
    cause,
    tests = [],
    code = [],
}: {
    ticket: number
    cause: 'clash' | 'join_gates'
    tests?: string[]
    code?: string[]
}): Entry =>
    entry({
        kind: 'ticket_rebased',
        ticket,
        content: { cause, base_sha: 'onto', tests, code, undone: [] },
    })

/** After a rebase, a ticket's tests went back to its test-writer (#489). */
export const testsSentBack = ({
    ticket,
    joined,
}: {
    ticket: number
    joined: number[]
}): Entry =>
    entry({
        kind: 'tests_sent_back',
        ticket,
        content: {
            round: 1,
            bad_test: {
                file: 'src/menu.test.ts',
                name: 'menu > lists three items',
                reason: 'Another ticket added a fourth item.',
            },
            from_sha: 'b0',
            base_sha: 'onto',
            joined: joined.map((number) => ({
                ticket: number,
                title: `Ticket ${number}`,
            })),
            files: ['src/menu.ts'],
        },
    })

/**
 * Every step of one feature ticket, from its worktree to the push, as the
 * engine journals it, each agent's session included.
 */
export const wholeTicket = ({ ticket }: { ticket: number }): Entry[] => [
    ticketWorktreeCreated({ ticket }),
    baselineTests({ ticket, passed: 4 }),
    agentStarted({ ticket, role: 'test-writer' }),
    agentSession({ ticket, role: 'test-writer', input: 100, output: 400 }),
    agentFinished({ ticket, role: 'test-writer' }),
    redCheck({ ticket, ok: true, failing: 2, passing: 4 }),
    leftoverScan({ ticket, stage: 'red' }),
    commitMade({ ticket, stage: 'red' }),
    agentStarted({ ticket, role: 'implementer' }),
    agentSession({ ticket, role: 'implementer', input: 200, output: 800 }),
    agentFinished({ ticket, role: 'implementer' }),
    gatesRun({ ticket, ok: true }),
    leftoverScan({ ticket, stage: 'green' }),
    commitMade({ ticket, stage: 'green' }),
    agentStarted({ ticket, role: 'ticket-reviewer' }),
    agentSession({ ticket, role: 'ticket-reviewer', input: 50, output: 150 }),
    agentFinished({ ticket, role: 'ticket-reviewer' }),
    ticketJoined({ ticket }),
    gatesRun({ ticket, ok: true, target: 'run_branch' }),
    runBranchPushed({ ticket }),
]
