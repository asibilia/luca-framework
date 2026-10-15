import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { CriterionTests } from '../agents/role-results'
import type { ScriptedTurn } from '../agents/scripted-launcher'
import { replayRun } from '../journal/replay'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    git,
    happyTurns,
    latestStuck,
} from '../testing/practice-repo'
import {
    createInMemoryTracker,
    type InMemoryTracker,
} from '../tracker/in-memory-tracker'

/**
 * Seam 2 for a ticket whose work is already on the base branch (#484):
 * whole runs on the practice repo with scripted agents and the in-memory
 * tracker. The test-writer answers `already_done` with its evidence; the
 * engine checks it (#495), and then the ticket is done, not stuck, and
 * nobody has to reply. Evidence that doesn't check out is a failed try.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-already-done-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** The double and its tests, already on `main` before the run. */
const DONE_FILES = {
    'src/double.ts':
        'export const double = ({ n }: { n: number }): number => n * 2\n',
    'src/double.test.ts': `import { describe, expect, test } from 'bun:test'

import { double } from './double'

describe('double', () => {
    test('doubles a number', () => {
        expect(double({ n: 2 })).toBe(4)
    })

    test('of zero is zero', () => {
        expect(double({ n: 0 })).toBe(0)
    })
})
`,
}

/** A test on `main` that fails. */
const BROKEN_TEST = `import { expect, test } from 'bun:test'

test('broken', () => {
    expect(1).toBe(2)
})
`

/** The existing tests that cover the double ticket's two criteria. */
const DONE_CRITERIA: CriterionTests[] = [
    {
        criterion_id: 'AC1',
        tests: [
            { file: 'src/double.test.ts', name: 'double > doubles a number' },
        ],
    },
    {
        criterion_id: 'AC2',
        tests: [
            { file: 'src/double.test.ts', name: 'double > of zero is zero' },
        ],
    },
]

/** A commit that no repo has. */
const UNKNOWN_SHA = '3559c25f5a1b2c3d4e5f60718293a4b5c6d7e8f9'

/** A test-writer that finds ticket `ticket`'s work already on `main`. */
const alreadyDoneTurn = ({
    ticket,
    shas,
    criteria,
}: {
    ticket: number
    shas: string[]
    /** Defaults to `DONE_CRITERIA`. */
    criteria?: CriterionTests[]
}): ScriptedTurn => ({
    role: 'test-writer',
    ticket,
    result: {
        outcome: 'already_done',
        done_by: shas.map((sha) => ({ sha, title: 'feat: add double (#482)' })),
        criteria: criteria ?? DONE_CRITERIA,
        summary: 'PR #482 already added the double and its tests.',
    },
})

const DOUBLE_TICKET = ticketIssue({
    number: 11,
    title: 'Add double',
    criteria: ['double doubles a number', 'double of zero is zero'],
})

/** Spec #10 with the double ticket, #11, only. */
const doubleTracker = (): InMemoryTracker =>
    createInMemoryTracker({
        issues: [specIssue({ number: 10 }), DOUBLE_TICKET],
        sub_tickets: { 10: [11] },
    })

/** The practice repo with the double on `main`, and the commit that added it. */
const practiceWithDouble = async ({
    files,
}: {
    files?: Record<string, string>
} = {}) => {
    const practice = await createPracticeRepo({
        root,
        files: { ...DONE_FILES, ...files },
    })
    const sha = (await git(practice.repo, 'rev-parse', 'HEAD')).trim()
    return { practice, sha }
}

describe('a ticket whose work is already done', () => {
    test('when every ticket is already done, the run ends with nothing to do, and closes the ticket with a comment', async () => {
        const { practice, sha } = await practiceWithDouble()
        const tracker = doubleTracker()

        const { action, records, launches } = await practice.run({
            tracker,
            turns: [alreadyDoneTurn({ ticket: 11, shas: [sha] })],
        })

        expect(action).toEqual({ type: 'done', outcome: 'nothing_to_do' })
        expect(records.some(({ kind }) => kind === 'ticket_stuck')).toBe(false)
        expect(launches.map(({ role }) => role)).toEqual(['test-writer'])
        const checked = records.find(
            (record) => record.kind === 'already_done_checked'
        )
        expect(checked).toMatchObject({
            ticket: 11,
            content: { ok: true, problems: [] },
        })
        expect(tracker.pullRequests()).toEqual([])
        expect((await tracker.readIssue({ number: 11 }))?.state).toBe('closed')
        const [closing] = tracker.commentsOn({ number: 11 })
        expect(closing).toContain('already on `main`')
        expect(closing).toContain(sha.slice(0, 7))
        const [told] = tracker.commentsOn({ number: 10 })
        expect(told).toContain('#11 is already done')
        expect(told).toContain(sha.slice(0, 7))
        const state = replayRun({ records })
        expect(state.phase).toBe('nothing_to_do')
        expect(state.tickets[11]?.already_done).toEqual({ shas: [sha] })
        expect(state.removed_worktrees).toContain(state.run_branch?.path ?? '')
    }, 60_000)

    test('in a mixed run, the ticket that waits on it builds, the PR closes it as already done, and names the open tickets not in the run', async () => {
        const { practice, sha } = await practiceWithDouble()
        const product = ticketIssue({
            number: 12,
            title: 'Add product',
            criteria: ['product adds two numbers', 'product of none is zero'],
            blocked_by_section: '- #11',
            blocked_by: [11],
        })
        const reopened = ticketIssue({ number: 13, title: 'Add the menu item' })
        const closed = ticketIssue({
            number: 14,
            title: 'Rename the module',
            state: 'closed',
        })
        const inner = createInMemoryTracker({
            issues: [
                specIssue({ number: 10 }),
                DOUBLE_TICKET,
                product,
                reopened,
                closed,
            ],
            sub_tickets: { 10: [11, 12, 13, 14] },
        })
        // At intake #13 was closed (so the run left it out); it was
        // reopened while the run went.
        let reads = 0
        const tracker: InMemoryTracker = {
            ...inner,
            listSubTickets: async (args) => {
                reads += 1
                const tickets = await inner.listSubTickets(args)
                return reads === 1
                    ? tickets.map((ticket) =>
                          ticket.number === 13
                              ? { ...ticket, state: 'closed' }
                              : ticket
                      )
                    : tickets
            },
        }
        const turns = Object.values(happyTurns()).map((turn) => ({
            ...turn,
            ticket: 12,
        }))

        const { action, records, launches } = await practice.run({
            tracker,
            turns: [alreadyDoneTurn({ ticket: 11, shas: [sha] }), ...turns],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(records.some(({ kind }) => kind === 'ticket_stuck')).toBe(false)
        expect(
            launches
                .filter(({ role }) => !role.endsWith('-lens'))
                .map(({ role, ticket }) => `${role} #${ticket}`)
        ).toEqual([
            'test-writer #11',
            'test-writer #12',
            'implementer #12',
            'ticket-reviewer #12',
        ])
        const [pull] = tracker.pullRequests()
        expect(pull?.body).toContain(
            `- Closes #11: Add double (already done before this run, by ${sha.slice(0, 7)})`
        )
        expect(pull?.body).toContain('- Closes #12: Add product')
        expect(pull?.body).toContain('## Not in this run')
        expect(pull?.body).toContain('- #13 Add the menu item')
        expect(pull?.body).not.toContain('#14')
        // The PR closes it on merge; the engine doesn't close it itself.
        expect((await tracker.readIssue({ number: 11 }))?.state).toBe('open')
        expect(tracker.commentsOn({ number: 11 })).toEqual([])
    }, 60_000)
})

describe("the engine checks a test-writer's already-done evidence (#495)", () => {
    test('a commit the repo lacks, or one not on the base, is a failed try; the corrected answer makes the ticket done', async () => {
        const { practice, sha } = await practiceWithDouble()
        // A commit the repo has, on no branch the run started from.
        const aside = (
            await git(
                practice.repo,
                'commit-tree',
                'HEAD^{tree}',
                '-p',
                'HEAD',
                '-m',
                'feat: a double on a side branch'
            )
        ).trim()
        const tracker = doubleTracker()

        const { action, records, launches } = await practice.run({
            tracker,
            turns: [
                alreadyDoneTurn({ ticket: 11, shas: [UNKNOWN_SHA, aside] }),
                alreadyDoneTurn({ ticket: 11, shas: [sha] }),
            ],
        })

        expect(action).toEqual({ type: 'done', outcome: 'nothing_to_do' })
        expect(launches.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'follow_up test-writer',
        ])
        const told = launches[1]?.prompt ?? ''
        expect(told).toContain(`commit ${UNKNOWN_SHA}: not found in the repo`)
        expect(told).toContain(`commit ${aside}: not on the base`)
        const checks = records.flatMap((record) =>
            record.kind === 'already_done_checked' ? [record.content.ok] : []
        )
        expect(checks).toEqual([false, true])
        expect(replayRun({ records }).tickets[11]?.already_done).toEqual({
            shas: [sha],
        })
    }, 60_000)

    test('named tests that are missing or failing on the base are a failed try', async () => {
        const { practice, sha } = await practiceWithDouble({
            files: { 'src/broken.test.ts': BROKEN_TEST },
        })
        const tracker = doubleTracker()
        const wrong: CriterionTests[] = [
            {
                criterion_id: 'AC1',
                tests: [
                    { file: 'src/double.test.ts', name: 'double > triples' },
                    { file: 'src/gone.test.ts', name: 'gone > works' },
                ],
            },
            {
                criterion_id: 'AC2',
                tests: [{ file: 'src/broken.test.ts', name: 'broken' }],
            },
        ]

        const { action, launches } = await practice.run({
            tracker,
            turns: [
                alreadyDoneTurn({ ticket: 11, shas: [sha], criteria: wrong }),
                alreadyDoneTurn({ ticket: 11, shas: [sha] }),
            ],
        })

        expect(action).toEqual({ type: 'done', outcome: 'nothing_to_do' })
        const told = launches[1]?.prompt ?? ''
        expect(launches[1]?.kind).toBe('follow_up')
        expect(told).toContain(
            '"double > triples" in src/double.test.ts: not found in the test results'
        )
        expect(told).toContain(
            '"gone > works" in src/gone.test.ts: the file does not exist'
        )
        expect(told).toContain(
            '"broken" in src/broken.test.ts: fails on the base'
        )
        expect(told).not.toContain('doubles a number')
    }, 60_000)

    test('when the failed tries run out, the ticket is stuck with what did not check out', async () => {
        const { practice } = await practiceWithDouble()
        const tracker = doubleTracker()
        const wrong = alreadyDoneTurn({ ticket: 11, shas: [UNKNOWN_SHA] })

        const { action, records, launches } = await practice.run({
            tracker,
            turns: [wrong, wrong, wrong],
        })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(launches.map(({ kind }) => kind)).toEqual([
            'launch',
            'follow_up',
            'follow_up',
        ])
        const stuck = latestStuck(records)
        expect(stuck).toMatchObject({ ticket: 11, reason: 'agent_failed' })
        expect(stuck?.detail).toContain('test-writer failed 3 tries')
        expect(stuck?.detail).toContain(
            `commit ${UNKNOWN_SHA}: not found in the repo`
        )
        expect(records.some(({ kind }) => kind === 'ticket_already_done')).toBe(
            false
        )
        expect((await tracker.readIssue({ number: 11 }))?.state).toBe('open')
    }, 60_000)
})
