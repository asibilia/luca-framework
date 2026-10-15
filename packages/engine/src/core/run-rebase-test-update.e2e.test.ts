import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import { MAX_TEST_UPDATES } from './decide-build'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { ticketIssue } from '../testing/intake-fixtures'
import {
    journalRecords,
    runManyTickets,
    waitUntil,
    type ManyTicketsRun,
    type ManyTicketsScenario,
} from '../testing/many-tickets'
import {
    APPROVE,
    IMPLEMENTER_RESULT,
    PRACTICE_SPEC_NUMBER,
    practiceSpec,
} from '../testing/practice-repo'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Seam 2 for #489 and #490: a test that another ticket's join made wrong.
 * #21 "Add a hint step" puts a hint between the two steps; #22 "Count the
 * steps" pins the count at two. Both change `src/index.ts`, so #22 clashes
 * when it joins after #21 and is moved on top of the run branch. There its
 * implementer resolves the clash and sends the count test back as bad. The
 * test-writer updates it to three steps, with the code kept, and #22 joins.
 * Real git, gates, journal; scripted agents; no GitHub, no models.
 */

const STEPS = "export const steps = (): string[] => ['drop', 'catch']\n"

const HINT_TEST = `import { describe, expect, test } from 'bun:test'

import { HINT } from './hint'
import { steps } from './steps'

describe('hint', () => {
    test('comes between drop and catch', () => {
        expect(steps()).toEqual(['drop', HINT, 'catch'])
    })
})
`

const HINT = "export const HINT = 'hint'\n"

const STEPS_WITH_HINT = `import { HINT } from './hint'

export const steps = (): string[] => ['drop', HINT, 'catch']
`

const countTest = (
    count: number
) => `import { describe, expect, test } from 'bun:test'

import { count } from './count'

describe('count', () => {
    test('gives the number of steps', () => {
        expect(count()).toBe(${count})
    })
})
`

const COUNT = `import { steps } from './steps'

export const count = (): number => steps().length
`

const BOTH_INDEX =
    "export { count } from './count'\nexport { steps } from './steps'\n"

const REASON =
    "The test pins two steps, but #21 joined the run branch first and added the hint step the spec asks for, so there are three now. Passing it would mean removing #21's hint."

const mapped = ({ file, name }: { file: string; name: string }) => ({
    outcome: 'tests_written',
    criteria: [{ criterion_id: 'AC1', tests: [{ file, name }] }],
    summary: 'One test for the criterion.',
    assumptions: [],
    run_notes: [],
})

const COUNT_MAPPED = mapped({
    file: 'src/count.test.ts',
    name: 'count > gives the number of steps',
})

const BAD_COUNT = {
    ...IMPLEMENTER_RESULT,
    outcome: 'bad_test',
    bad_test: {
        file: 'src/count.test.ts',
        name: 'count > gives the number of steps',
        reason: REASON,
    },
    summary: 'Resolved the clash; the count test is wrong now.',
}

/** #21 builds and joins; #22 builds, waiting for #21's push to join. */
const firstTurns = ({
    journal_file,
}: {
    journal_file: string
}): ScriptedTurn[] => [
    {
        role: 'test-writer',
        ticket: 21,
        files: { 'src/hint.test.ts': HINT_TEST },
        result: mapped({
            file: 'src/hint.test.ts',
            name: 'hint > comes between drop and catch',
        }),
    },
    {
        role: 'implementer',
        ticket: 21,
        files: {
            'src/hint.ts': HINT,
            'src/steps.ts': STEPS_WITH_HINT,
            'src/index.ts': "export { steps } from './steps'\n",
        },
        result: { ...IMPLEMENTER_RESULT, summary: 'Added the hint step.' },
    },
    { role: 'ticket-reviewer', ticket: 21, result: APPROVE },
    {
        role: 'test-writer',
        ticket: 22,
        files: { 'src/count.test.ts': countTest(2) },
        result: COUNT_MAPPED,
    },
    {
        role: 'implementer',
        ticket: 22,
        files: {
            'src/count.ts': COUNT,
            'src/index.ts': "export { count } from './count'\n",
        },
        result: { ...IMPLEMENTER_RESULT, summary: 'Added count.' },
    },
    {
        role: 'ticket-reviewer',
        ticket: 22,
        act: async () =>
            waitUntil({
                check: () =>
                    journalRecords(journal_file).some(
                        (record) =>
                            record.kind === 'run_branch_pushed' &&
                            record.ticket === 21
                    ),
                what: "#21's push",
            }),
        result: APPROVE,
    },
    // On the run branch: resolve the clash, and send the count test back.
    {
        role: 'implementer',
        ticket: 22,
        files: { 'src/index.ts': BOTH_INDEX },
        result: BAD_COUNT,
    },
]

const tracker = () =>
    createInMemoryTracker({
        issues: [
            practiceSpec(),
            ticketIssue({
                number: 21,
                title: 'Add a hint step',
                criteria: ['a hint comes between drop and catch'],
            }),
            ticketIssue({
                number: 22,
                title: 'Count the steps',
                criteria: ['count gives the number of steps'],
            }),
        ],
        sub_tickets: { [PRACTICE_SPEC_NUMBER]: [21, 22] },
    })

/** The test-writer updates the count test once, and #22 joins. */
const UPDATED: ManyTicketsScenario = {
    files: { 'src/steps.ts': STEPS },
    tracker,
    turns: ({ journal_file }) => [
        ...firstTurns({ journal_file }),
        {
            role: 'test-writer',
            ticket: 22,
            files: { 'src/count.test.ts': countTest(3) },
            result: {
                ...COUNT_MAPPED,
                summary: 'The count is three now, with #21 hint step.',
            },
        },
        {
            role: 'implementer',
            ticket: 22,
            result: { ...IMPLEMENTER_RESULT, summary: 'Nothing left to fix.' },
        },
        { role: 'ticket-reviewer', ticket: 22, result: APPROVE },
    ],
}

/** The implementer sends the test back after every update: stuck at the cap. */
const NEVER_RIGHT: ManyTicketsScenario = {
    files: { 'src/steps.ts': STEPS },
    tracker,
    turns: ({ journal_file }) => [
        ...firstTurns({ journal_file }),
        ...Array.from({ length: MAX_TEST_UPDATES }, (): ScriptedTurn[] => [
            {
                role: 'test-writer',
                ticket: 22,
                files: { 'src/count.test.ts': countTest(3) },
                result: COUNT_MAPPED,
            },
            { role: 'implementer', ticket: 22, result: BAD_COUNT },
        ]).flat(),
    ],
}

const ofKind = <K extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: K
) =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: K }> =>
            record.kind === kind
    )

/** #22's records after its rebase, as short strings, in journal order. */
const stepsAfterRebase = (run: ManyTicketsRun): string[] => {
    const [rebased] = ofKind(run.records, 'ticket_rebased')
    return run.records.flatMap((record) => {
        if (record.ticket !== 22 || record.seq <= (rebased?.seq ?? 0)) {
            return []
        }
        switch (record.kind) {
            case 'agent_started':
                return [
                    `${record.content.follow_up_of === null ? 'launch' : 'follow_up'} ${record.content.role}`,
                ]
            case 'tests_sent_back':
                return [`tests sent back ${record.content.round}`]
            case 'red_check':
                return ['red check']
            case 'gates_run':
                return [
                    `gates ${record.content.target} ${record.content.ok ? 'ok' : 'failed'}`,
                ]
            case 'commit_made':
                return [`commit ${record.content.stage}`]
            case 'ticket_joined':
                return [`joined ${record.content.ok ? 'ok' : 'clashed'}`]
            case 'run_branch_pushed':
                return ['pushed']
            case 'ticket_stuck':
                return [`stuck ${record.content.reason}`]
            default:
                return []
        }
    })
}

const roots: string[] = []

afterAll(async () => {
    for (const root of roots) await rm(root, { recursive: true, force: true })
})

const runScenario = async (scenario: ManyTicketsScenario) => {
    const root = await mkdtemp(join(tmpdir(), 'luca-engine-test-update-'))
    roots.push(root)
    return runManyTickets({ root, scenario })
}

describe('a test a joined ticket made wrong, end to end', () => {
    let run: ManyTicketsRun

    test('goes back to the test-writer, and the ticket joins; one PR opens', async () => {
        run = await runScenario(UPDATED)

        expect(run.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        expect(ofKind(run.records, 'ticket_stuck')).toEqual([])
        expect(ofKind(run.records, 'agent_failed')).toEqual([])
        // The first implementer's session closed with its green commit.
        expect(stepsAfterRebase(run)).toEqual([
            'launch implementer',
            'tests sent back 1',
            'launch test-writer',
            'follow_up implementer',
            'gates ticket ok',
            'commit green',
            'launch ticket-reviewer',
            'joined ok',
            'gates run_branch ok',
            'pushed',
        ])
    }, 120_000)

    test('the journal names what joined, the files it changed, and the bad test', () => {
        const [sent] = ofKind(run.records, 'tests_sent_back')
        const [rebased] = ofKind(run.records, 'ticket_rebased')
        const created = ofKind(run.records, 'ticket_worktree_created').find(
            ({ ticket }) => ticket === 22
        )

        expect(sent?.content).toEqual({
            round: 1,
            bad_test: BAD_COUNT.bad_test,
            from_sha: created?.content.base_sha ?? '',
            base_sha: rebased?.content.base_sha ?? '',
            joined: [{ ticket: 21, title: 'Add a hint step' }],
            files: [
                'src/hint.test.ts',
                'src/hint.ts',
                'src/index.ts',
                'src/steps.ts',
            ],
        })
    })

    test("the test-writer is told what joined and why the test is wrong; the implementer's code stays", () => {
        const calls = run.launches.filter(({ ticket }) => ticket === 22)
        const writer = calls.filter(({ role }) => role === 'test-writer').at(-1)
        const implementer = calls
            .filter(({ role }) => role === 'implementer')
            .at(-1)

        expect(writer?.kind).toBe('launch')
        expect(writer?.may_edit_tests).toBe(true)
        expect(writer?.prompt).toContain('- #21 Add a hint step')
        expect(writer?.prompt).toContain('- src/steps.ts')
        expect(writer?.prompt).toContain(`- Reason: ${REASON}`)
        expect(implementer?.kind).toBe('follow_up')
        expect(implementer?.prompt).toContain(
            'The test-writer updated the tests'
        )
        expect(implementer?.prompt).toContain('with #21 hint step')
    })

    test('the rejoin commit holds the updated test and the resolved clash', () => {
        const green = ofKind(run.records, 'commit_made')
            .filter(({ ticket }) => ticket === 22)
            .at(-1)

        expect(green?.content.message).toBe(
            'fix: rejoin #22 Count the steps onto the run branch'
        )
        expect(green?.content.files).toEqual(
            expect.arrayContaining(['src/count.test.ts', 'src/index.ts'])
        )
    })
})

describe(`a test sent back after ${MAX_TEST_UPDATES} updates, end to end`, () => {
    let run: ManyTicketsRun

    test("is stuck, and the spec comment keeps the implementer's reason", async () => {
        run = await runScenario(NEVER_RIGHT)

        expect(run.action).toMatchObject({ type: 'wait_for_reply' })
        expect(stepsAfterRebase(run)).toEqual([
            'launch implementer',
            ...Array.from({ length: MAX_TEST_UPDATES }, (_, index) => [
                `tests sent back ${index + 1}`,
                'launch test-writer',
                'follow_up implementer',
            ]).flat(),
            'stuck bad_test',
        ])
        const [stuck] = ofKind(run.records, 'ticket_stuck')
        expect(stuck?.content.detail).toContain(
            `src/count.test.ts > count > gives the number of steps: ${REASON}`
        )
        const [report] = ofKind(run.records, 'stuck_reported')
        expect(report?.content.body).toContain(REASON)
        expect(report?.content.body).toContain(
            `${MAX_TEST_UPDATES} test updates after a rebase`
        )
        expect(report?.content.body).not.toContain('no reason given')
    }, 120_000)
})
