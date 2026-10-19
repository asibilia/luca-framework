import { describe, expect, test } from 'bun:test'

import { decideSteps } from './decide'

import {
    JournalRecordSchema,
    type JournalEntry,
} from '../journal/journal-record'
import {
    agentStarted,
    commitMade,
    emptyTestRun,
    implemented,
    intakePassed,
    leftoverScan,
    practiceTicket,
    redCheck,
    runBranchCreated,
    SESSIONS,
    testsWritten,
    ticketWorktreeCreated,
    withInstalls,
} from '../testing/build-fixtures'
import { FIXED_TIME, recordsFrom } from '../testing/intake-fixtures'

/**
 * Shared failures (#544): when the same old test (one that passed at the
 * ticket's baseline) fails in two tickets within 10 minutes, by record time,
 * the second ticket's failed check is rerun alone (`exclusive: true`)
 * before any fix round. One lone rerun per check per ticket.
 */

const SUM = practiceTicket({ number: 11, title: 'Add sum' })
const PRODUCT = practiceTicket({ number: 12, title: 'Add product' })

/** An old test, in the repo before the run. */
const OLD = { file: 'src/old.test.ts', full_name: 'old > still works' }
/** The ticket's own new test. */
const NEW = { file: 'src/sum.test.ts', full_name: 'sum adds two numbers' }

type Case = { file: string; full_name: string }

/** The minute after `FIXED_TIME` each entry's record is journaled at. */
const MINUTES = new WeakMap<JournalEntry, number>()

const at = (minute: number, entry: JournalEntry): JournalEntry => {
    MINUTES.set(entry, minute)
    return entry
}

/** The baseline test run of a ticket, with these tests passing. */
const baseline = ({
    ticket,
    passed,
}: {
    ticket: number
    passed: Case[]
}): JournalEntry => ({
    kind: 'baseline_tests',
    ticket,
    role: null,
    content: {
        ...emptyTestRun(),
        ok: true,
        exit_code: 0,
        no_test_files: false,
        cases: passed.map((test) => ({ ...test, status: 'passed' })),
        output: `${passed.length} pass`,
    },
})

/**
 * A ticket's gates, failing on `failed` (or passing with none), as a lone
 * rerun with `exclusive`. With `failed` left out, an old journal's record
 * with no `failed_cases`.
 */
const gates = ({
    ticket,
    failed,
    exclusive,
}: {
    ticket: number
    failed?: Case[]
    exclusive?: boolean
}): JournalEntry => {
    const ok = failed !== undefined && failed.length === 0
    return {
        kind: 'gates_run',
        ticket,
        role: null,
        content: {
            target: 'ticket',
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
            ...(failed === undefined ? {} : { failed_cases: failed }),
            ...(exclusive === true ? { exclusive: true } : {}),
        },
    } as JournalEntry
}

/** A ticket's steps up to its implementer's answer, `old` in its baseline. */
const upToGates = ({
    ticket,
    old,
}: {
    ticket: number
    old?: Case[]
}): JournalEntry[] => [
    ticketWorktreeCreated({ ticket }),
    baseline({ ticket, passed: old ?? [OLD] }),
    testsWritten({ ticket }),
    redCheck({ ticket, ok: true }),
    leftoverScan({ ticket, stage: 'red' }),
    commitMade({ ticket, stage: 'red' }),
    implemented({ ticket }),
]

/** An implementer's fix round on a ticket: a follow-up, answered. */
const fixRound = ({ ticket }: { ticket: number }): JournalEntry[] => [
    agentStarted({
        ticket,
        role: 'implementer',
        follow_up_of: SESSIONS.implementer,
    }),
    implemented({ ticket }),
]

/**
 * #11's gates failed on the old test at minute 0 (and #11 went on to its
 * fix round); #12's gates failed on `failed` at `minute`.
 */
const bothFailed = ({
    minute,
    failed,
    old,
    first,
}: {
    minute: number
    failed?: Case[]
    /** The old tests of #12's baseline. Defaults to `OLD`. */
    old?: Case[]
    /** #11's failed gates. Defaults to failing on `OLD`. */
    first?: JournalEntry
}): JournalEntry[] => [
    runBranchCreated(),
    ...upToGates({ ticket: 11 }),
    first ?? gates({ ticket: 11, failed: [OLD] }),
    ...fixRound({ ticket: 11 }),
    ...upToGates({ ticket: 12, old }),
    at(minute, gates({ ticket: 12, failed: failed ?? [OLD] })),
]

/** #12's next step, on a run with #11 and #12 and these entries. */
const stepOf12 = (entries: JournalEntry[]) => {
    const all = [
        ...intakePassed({ tickets: [SUM, PRODUCT] }),
        ...withInstalls({ entries }),
    ]
    const records = recordsFrom({ entries: all }).map((record, index) => {
        const entry = all[index]
        const minute = entry === undefined ? 0 : (MINUTES.get(entry) ?? 0)
        return {
            ...record,
            time: new Date(
                Date.parse(FIXED_TIME) + minute * 60_000
            ).toISOString(),
        }
    })
    return decideSteps({ records }).find(
        (action) => 'ticket' in action && action.ticket === 12
    )
}

const LONE_GATES = {
    type: 'run_gates',
    ticket: 12,
    target: 'ticket',
    exclusive: true,
}

const FIX_ROUND = {
    type: 'follow_up_agent',
    ticket: 12,
    role: 'implementer',
    session_id: SESSIONS.implementer,
}

describe('shared failures: a lone rerun (#544)', () => {
    test('gates failing on an old test another ticket failed 5 minutes earlier are rerun alone, before any fix round', () => {
        expect(stepOf12(bothFailed({ minute: 5 }))).toMatchObject(LONE_GATES)
    })

    test('a red check failing on an old test another ticket failed 5 minutes earlier is rerun alone', () => {
        const failedRed: JournalEntry = {
            kind: 'red_check',
            ticket: 12,
            role: null,
            content: {
                ok: false,
                problems: [
                    `"${OLD.full_name}" in ${OLD.file} no longer passes`,
                ],
                notes: [],
                tests: {
                    ...emptyTestRun(),
                    ok: false,
                    exit_code: 1,
                    no_test_files: false,
                    cases: [
                        { ...OLD, status: 'failed' },
                        { ...NEW, status: 'failed' },
                    ],
                    output: '2 fail',
                },
            },
        }

        expect(
            stepOf12([
                runBranchCreated(),
                ...upToGates({ ticket: 11 }),
                gates({ ticket: 11, failed: [OLD] }),
                ...fixRound({ ticket: 11 }),
                ticketWorktreeCreated({ ticket: 12 }),
                baseline({ ticket: 12, passed: [OLD] }),
                testsWritten({ ticket: 12 }),
                at(5, failedRed),
            ])
        ).toMatchObject({ type: 'run_red_check', ticket: 12, exclusive: true })
    })

    test('failures more than 10 minutes apart get the usual fix round, where ones 5 minutes apart get a lone rerun', () => {
        expect(stepOf12(bothFailed({ minute: 5 }))).toMatchObject(LONE_GATES)
        expect(stepOf12(bothFailed({ minute: 15 }))).toMatchObject(FIX_ROUND)
    })

    test('a failing new test gets the usual fix round, even when another ticket failed it as an old test', () => {
        // In #12's baseline, the test is old: a lone rerun.
        expect(stepOf12(bothFailed({ minute: 5 }))).toMatchObject(LONE_GATES)
        // Not in #12's baseline, it is #12's own new test.
        expect(stepOf12(bothFailed({ minute: 5, old: [] }))).toMatchObject(
            FIX_ROUND
        )
    })

    test('an old journal whose gates_run has no failed_cases still replays, as no shared failure', () => {
        expect(stepOf12(bothFailed({ minute: 5 }))).toMatchObject(LONE_GATES)
        expect(
            stepOf12(bothFailed({ minute: 5, first: gates({ ticket: 11 }) }))
        ).toMatchObject(FIX_ROUND)
    })

    test('a passing lone rerun goes on to the green commit', () => {
        const shared = bothFailed({ minute: 5 })
        expect(stepOf12(shared)).toMatchObject(LONE_GATES)

        expect(
            stepOf12([
                ...shared,
                at(6, gates({ ticket: 12, failed: [], exclusive: true })),
            ])
        ).toMatchObject({ type: 'commit_ticket', ticket: 12, stage: 'green' })
    })

    test('a failing lone rerun starts the usual fix round, and the check gets no second lone rerun', () => {
        const shared = bothFailed({ minute: 5 })
        expect(stepOf12(shared)).toMatchObject(LONE_GATES)

        const loneFailed = [
            ...shared,
            at(6, gates({ ticket: 12, failed: [OLD], exclusive: true })),
        ]
        expect(stepOf12(loneFailed)).toMatchObject(FIX_ROUND)

        // After the fix round, the gates fail on the shared old test again,
        // still within 10 minutes of #11's failure: the fix round goes on.
        expect(
            stepOf12([
                ...loneFailed,
                ...fixRound({ ticket: 12 }),
                at(7, gates({ ticket: 12, failed: [OLD] })),
            ])
        ).toMatchObject(FIX_ROUND)
    })
})

/** #12's writer answers `environment` on a follow-up turn (#613). */
const blamesEnvironment = (
    role: 'test-writer' | 'implementer'
): JournalEntry[] => [
    agentStarted({ ticket: 12, role, follow_up_of: SESSIONS[role] }),
    {
        kind: 'agent_finished',
        ticket: 12,
        role,
        content: {
            role,
            session_id: SESSIONS[role],
            result: {
                outcome: 'environment',
                environment: { evidence: 'EADDRINUSE on port 4000.' },
                summary: 'Not this ticket.',
            },
        },
    } as JournalEntry,
]

/** #12's red check, failing on the old test, as a lone rerun with `exclusive`. */
const redFailedOnOld = ({
    exclusive,
}: {
    exclusive?: boolean
}): JournalEntry => ({
    kind: 'red_check',
    ticket: 12,
    role: null,
    content: {
        ok: false,
        problems: [`"${OLD.full_name}" in ${OLD.file} no longer passes`],
        notes: [],
        tests: {
            ...emptyTestRun(),
            ok: false,
            exit_code: 1,
            no_test_files: false,
            cases: [
                { ...OLD, status: 'failed' },
                { ...NEW, status: 'failed' },
            ],
            output: '2 fail',
        },
        ...(exclusive === true ? { exclusive: true } : {}),
    },
})

/**
 * #12's check failed at minute 0, before any other ticket failed the old
 * test, and its writer answered `environment`; then #11's gates failed on
 * the old test at minute 1, and #12's rerun failed the same way at minute
 * 2, now shared.
 */
const environmentRerunShared = ({
    check,
}: {
    check: 'gates' | 'red_check'
}): JournalEntry[] => {
    const failed = (minute: number) =>
        at(
            minute,
            check === 'gates'
                ? gates({ ticket: 12, failed: [OLD] })
                : redFailedOnOld({})
        )
    return [
        runBranchCreated(),
        ...upToGates({ ticket: 11 }),
        ticketWorktreeCreated({ ticket: 12 }),
        baseline({ ticket: 12, passed: [OLD] }),
        testsWritten({ ticket: 12 }),
        ...(check === 'gates'
            ? [
                  redCheck({ ticket: 12, ok: true }),
                  leftoverScan({ ticket: 12, stage: 'red' }),
                  commitMade({ ticket: 12, stage: 'red' }),
                  implemented({ ticket: 12 }),
              ]
            : []),
        failed(0),
        ...blamesEnvironment(check === 'gates' ? 'implementer' : 'test-writer'),
        at(1, gates({ ticket: 11, failed: [OLD] })),
        failed(2),
    ]
}

describe('shared failures after an environment answer (#544, #613)', () => {
    test('gates whose environment rerun fails the same way on a shared old test are rerun alone, not stuck', () => {
        const shared = environmentRerunShared({ check: 'gates' })
        expect(stepOf12(shared)).toMatchObject(LONE_GATES)

        expect(
            stepOf12([
                ...shared,
                at(3, gates({ ticket: 12, failed: [OLD], exclusive: true })),
            ])
        ).toMatchObject({
            type: 'mark_stuck',
            ticket: 12,
            reason: 'environment_failed',
        })
    })

    test('a red check whose environment rerun fails the same way on a shared old test is rerun alone, not stuck', () => {
        const shared = environmentRerunShared({ check: 'red_check' })
        expect(stepOf12(shared)).toMatchObject({
            type: 'run_red_check',
            ticket: 12,
            exclusive: true,
        })

        expect(
            stepOf12([...shared, at(3, redFailedOnOld({ exclusive: true }))])
        ).toMatchObject({
            type: 'mark_stuck',
            ticket: 12,
            reason: 'environment_failed',
        })
    })
})

describe('shared failures: the journal (#544)', () => {
    test("a ticket's and a join's gates_run keep their failed test cases, and an old one without them still parses", () => {
        for (const target of ['ticket', 'run_branch'] as const) {
            const failed = gates({ ticket: 11, failed: [OLD] })
            const record = JournalRecordSchema.parse({
                ...failed,
                content: { ...(failed as { content: object }).content, target },
                seq: 1,
                time: FIXED_TIME,
            })
            if (record.kind !== 'gates_run') throw new Error(record.kind)
            expect(record.content).toMatchObject({
                target,
                failed_cases: [OLD],
            })
        }
        const old = JournalRecordSchema.parse({
            ...gates({ ticket: 11 }),
            seq: 1,
            time: FIXED_TIME,
        })
        expect(old.kind).toBe('gates_run')
        expect(old.content).not.toHaveProperty('failed_cases')
    })

    test('a lone rerun of the gates or the red check is journaled as exclusive', () => {
        const lone = JournalRecordSchema.parse({
            ...gates({ ticket: 12, failed: [], exclusive: true }),
            seq: 1,
            time: FIXED_TIME,
        })
        expect(lone.content).toMatchObject({ exclusive: true })

        const red = redCheck({ ticket: 12, ok: true })
        const loneRed = JournalRecordSchema.parse({
            ...red,
            content: {
                ...(red as { content: object }).content,
                exclusive: true,
            },
            seq: 2,
            time: FIXED_TIME,
        })
        expect(loneRed.content).toMatchObject({ exclusive: true })
    })
})
