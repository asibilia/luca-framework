/**
 * Journal entry builders for the steps along a ticket's spine: the red check,
 * the leftover scan, commits, gates, resets, the join and its rebase, the
 * push, a stuck ticket, and `ticketBuilt`, every step of one ticket passing.
 */
import { implemented, reviewed, testsWritten } from './agent-turn-fixtures'
import {
    baselineTests,
    emptyTestRun,
    RUN_BRANCH,
    ticketWorktreeCreated,
} from './run-fixtures'

import type { BadTest } from '../agents/role-results'
import type { TestCase } from '../gates/gate-schemas'
import type {
    CommitStage,
    JournalEntry,
    StuckReason,
} from '../journal/journal-record'

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
        tests: {
            ...emptyTestRun(),
            output: ok ? '1 fail' : '(pass) sum adds two numbers',
        },
    },
})

export const leftoverScan = ({
    ticket,
    stage,
    hits,
}: {
    /** `null` for the final review. */
    ticket: number | null
    stage: CommitStage
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
    sha,
    files,
}: {
    /** `null` for the final review. */
    ticket: number | null
    stage: CommitStage
    /** Defaults to `<stage>-sha`. */
    sha?: string
    files?: string[]
}): JournalEntry => ({
    kind: 'commit_made',
    ticket,
    role: null,
    content: {
        stage,
        sha: sha ?? `${stage}-sha`,
        message: stage,
        files: files ?? [],
    },
})

export const gatesRun = ({
    ticket,
    target,
    ok,
    cases,
}: {
    /** `null` for the final review. */
    ticket: number | null
    target: 'ticket' | 'run_branch'
    ok: boolean
    /** The test cases a ticket's gates journal (#581). Defaults to none. */
    cases?: TestCase[]
}): JournalEntry => ({
    kind: 'gates_run',
    ticket,
    role: null,
    content: {
        target,
        ok,
        ...(cases === undefined ? {} : { cases }),
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

/**
 * The engine threw away a ticket worktree's uncommitted changes. With a
 * `bad_test`, the engine found that test checks nothing (#581).
 */
export const worktreeReset = ({
    ticket,
    bad_test,
}: {
    ticket: number
    bad_test?: BadTest
}): JournalEntry => ({
    kind: 'worktree_reset',
    ticket,
    role: null,
    content: {
        sha: 'red-sha',
        ...(bad_test === undefined ? {} : { bad_test }),
    },
})

export const joined = ({ ticket }: { ticket: number }): JournalEntry => ({
    kind: 'ticket_joined',
    ticket,
    role: null,
    content: { ok: true, shas: ['r1', 'g1'] },
})

/** A join whose cherry-pick clashed with the run branch (git aborted it). */
export const joinClashed = ({
    ticket,
    error,
}: {
    ticket: number
    /** Defaults to a conflict in `src/index.ts`. */
    error?: string
}): JournalEntry => ({
    kind: 'ticket_joined',
    ticket,
    role: null,
    content: { ok: false, error: error ?? 'CONFLICT (content): src/index.ts' },
})

/** The engine put a ticket's change back on top of the run branch. */
export const ticketRebased = ({
    ticket,
    cause,
    tests,
    code,
    undone,
}: {
    ticket: number
    cause: 'clash' | 'join_gates'
    /** The test files that clashed. Defaults to none. */
    tests?: string[]
    /** The code files that clashed. Defaults to none. */
    code?: string[]
    /** The run branch commits undone first. Defaults to none. */
    undone?: string[]
}): JournalEntry => ({
    kind: 'ticket_rebased',
    ticket,
    role: null,
    content: {
        cause,
        base_sha: 'onto-sha',
        tests: tests ?? [],
        code: code ?? [],
        undone: undone ?? [],
    },
})

/**
 * After a rebase, the engine sent a ticket's tests back to its test-writer
 * (#489): #12 "Add product" joined, and `src/index.ts` changed.
 */
export const testsSentBack = ({
    ticket,
    round,
    reason,
}: {
    ticket: number
    /** Defaults to 1. */
    round?: number
    /** The bad test's reason. Defaults to "Wrong sum." */
    reason?: string
}): JournalEntry => ({
    kind: 'tests_sent_back',
    ticket,
    role: null,
    content: {
        round: round ?? 1,
        bad_test: {
            file: 'src/sum.test.ts',
            name: 'sum adds two numbers',
            reason: reason ?? 'Wrong sum.',
        },
        from_sha: 'b0',
        base_sha: 'onto-sha',
        joined: [{ ticket: 12, title: 'Add product' }],
        files: ['src/index.ts', 'src/product.ts'],
    },
})

export const ticketStuck = ({
    ticket,
    reason,
    detail,
}: {
    ticket: number
    reason: StuckReason
    /** Defaults to "why". */
    detail?: string
}): JournalEntry => ({
    kind: 'ticket_stuck',
    ticket,
    role: null,
    content: { reason, detail: detail ?? 'why' },
})

export const pushed = ({
    ticket,
    sha,
}: {
    /** `null` for the final review's push. */
    ticket: number | null
    /** Defaults to `g1`. */
    sha?: string
}): JournalEntry => ({
    kind: 'run_branch_pushed',
    ticket,
    role: null,
    content: { branch: RUN_BRANCH, sha: sha ?? 'g1' },
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

/** One ticket's steps up to and including its approving review. */
export const ticketApproved = ({
    ticket,
}: {
    ticket: number
}): JournalEntry[] => ticketBuilt({ ticket }).slice(0, 11)
