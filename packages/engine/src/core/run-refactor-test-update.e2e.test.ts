import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { commits, ticketBranch } from './agent-guards-helpers'
import { closeOf } from './run-session-close-helpers'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { ticketIssue } from '../testing/intake-fixtures'
import {
    APPROVE,
    createPracticeRepo,
    git,
    IMPLEMENTER_RESULT,
    latestStuck,
} from '../testing/practice-repo'

/**
 * Seam 2 for #686: a refactor ticket's implementer sends a test back as bad.
 * #11 "Sort the rows" is a refactor ticket; `src/rows.test.ts` pins the old
 * order. The first bad test gets one refactor test update: a fresh
 * test-writer may change only the named file, and then the implementer
 * carries on. Real git, gates, journal; scripted agents; no GitHub, no
 * models.
 */

const rowsTest = (
    order: string
) => `import { describe, expect, test } from 'bun:test'

import { rows } from './rows'

describe('rows', () => {
    test('come in order', () => {
        expect(rows()).toEqual(${order})
    })
})
`

const otherTest = (
    name: string
) => `import { describe, expect, test } from 'bun:test'

describe('other', () => {
    test('${name}', () => {
        expect(1 + 1).toBe(2)
    })
})
`

const ROWS = 'export const rows = (): number[] => [2, 1]\n'

const SORTED_ROWS =
    'export const rows = (): number[] => [2, 1].toSorted((a, b) => a - b)\n'

const START_FILES = {
    'src/rows.ts': ROWS,
    'src/rows.test.ts': rowsTest('[2, 1]'),
    'src/other.test.ts': otherTest('adds'),
}

const FIXED_ROWS_TEST = rowsTest('[1, 2]')

const REASON =
    'The test pins the old order, but the criteria say the rows come sorted.'

const REFACTOR_LINE =
    "This is a refactor ticket. Change only src/rows.test.ts, and only so it checks what the ticket's criteria say."

const CARRY_ON =
    "The test-writer changed src/rows.test.ts so it checks what the ticket's criteria say. Carry on with the refactor. You may follow renames into test files, but don't change what a test checks."

const BAD_ROWS = {
    ...IMPLEMENTER_RESULT,
    outcome: 'bad_test',
    bad_test: {
        file: 'src/rows.test.ts',
        name: 'rows > come in order',
        reason: REASON,
    },
    summary: 'Sorted the rows; the rows test pins the old order.',
}

const FIXED = {
    outcome: 'tests_written',
    criteria: [],
    summary: 'The rows test checks the sorted order now.',
    assumptions: [],
    run_notes: [],
}

/** The implementer sorts the rows, renames a test, and sends one back. */
const BAD_TEST_TURN: ScriptedTurn = {
    role: 'implementer',
    ticket: 11,
    files: {
        'src/rows.ts': SORTED_ROWS,
        'src/other.test.ts': otherTest('adds two numbers'),
    },
    result: BAD_ROWS,
}

const FIX_TURN: ScriptedTurn = {
    role: 'test-writer',
    ticket: 11,
    files: { 'src/rows.test.ts': FIXED_ROWS_TEST },
    result: FIXED,
}

const HAPPY: ScriptedTurn[] = [
    BAD_TEST_TURN,
    FIX_TURN,
    {
        role: 'implementer',
        ticket: 11,
        result: { ...IMPLEMENTER_RESULT, summary: 'Nothing left to do.' },
    },
    { role: 'ticket-reviewer', ticket: 11, result: APPROVE },
]

const REFACTOR_TICKET = ticketIssue({
    number: 11,
    title: 'Sort the rows',
    labels: ['ready-for-agent', 'refactor'],
    criteria: ['the rows come sorted'],
})

/** Each test file's path and content hash, in whichever shape it is kept. */
const TestFilesSchema = z.union([
    z.array(z.object({ path: z.string(), hash: z.string() })),
    z.array(z.object({ file: z.string(), hash: z.string() })),
    z.record(z.string(), z.string()),
])

const hashes = (test_files: z.infer<typeof TestFilesSchema>) =>
    Array.isArray(test_files)
        ? Object.fromEntries(
              test_files.map((entry) => [
                  'path' in entry ? entry.path : entry.file,
                  entry.hash,
              ])
          )
        : test_files

/** The journal's `refactor_test_update` records. */
const updates = (records: JournalRecord[]) =>
    records.filter((record) => {
        const kind: string = record.kind
        return kind === 'refactor_test_update'
    })

const roots: string[] = []

afterAll(async () => {
    for (const root of roots) await rm(root, { recursive: true, force: true })
})

const runRefactor = async (turns: ScriptedTurn[]) => {
    const root = await mkdtemp(join(tmpdir(), 'luca-engine-refactor-update-'))
    roots.push(root)
    const practice = await createPracticeRepo({ root, files: START_FILES })
    const ran = await practice.run({ ticket: REFACTOR_TICKET, turns })
    return { ...ran, repo: practice.repo }
}

describe("a refactor ticket's first bad test, end to end (#686)", () => {
    /** One run, built once: every test reads it, and none changes it (#565). */
    let run: Awaited<ReturnType<typeof runRefactor>>

    beforeAll(async () => {
        run = await runRefactor(HAPPY)
    }, 120_000)

    test('journals a refactor test update naming the file, then launches a test-writer told to change only that file', () => {
        const [update] = updates(run.records)
        const writer = run.records.find(
            (record) =>
                record.kind === 'agent_started' &&
                record.ticket === 11 &&
                record.role === 'test-writer'
        )
        const call = run.launches.find(
            ({ ticket, role }) => ticket === 11 && role === 'test-writer'
        )

        expect(update?.ticket).toBe(11)
        expect(JSON.stringify(update?.content)).toContain('src/rows.test.ts')
        expect(writer?.seq ?? 0).toBeGreaterThan(update?.seq ?? Infinity)
        expect(call?.kind).toBe('launch')
        expect(call?.prompt).toContain(REFACTOR_LINE)
    })

    test('then the implementer hears the test was fixed and carries on, and the PR opens', () => {
        const implementer = run.launches
            .filter(
                ({ ticket, role }) => ticket === 11 && role === 'implementer'
            )
            .at(-1)

        expect(implementer?.kind).toBe('follow_up')
        expect(implementer?.prompt).toContain(CARRY_ON)
        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
    })

    test("the test-writer's session is closed before the implementer's follow-up", () => {
        const writer = run.launches.find(
            ({ ticket, role }) => ticket === 11 && role === 'test-writer'
        )
        const closed = closeOf(run.records, writer?.session_id ?? '')
        const followUp = run.records.find(
            (record) =>
                record.kind === 'agent_started' &&
                record.ticket === 11 &&
                record.role === 'implementer' &&
                record.content.follow_up_of !== null
        )

        expect(closed?.role).toBe('test-writer')
        expect(closed?.seq ?? Infinity).toBeLessThan(followUp?.seq ?? 0)
    })

    test('no red check runs for the ticket, though a test-writer had a turn', () => {
        expect(
            run.launches.filter(
                ({ ticket, role }) => ticket === 11 && role === 'test-writer'
            )
        ).toHaveLength(1)
        expect(
            run.records.filter(
                (record) => record.kind === 'red_check' && record.ticket === 11
            )
        ).toEqual([])
    })

    test("a test file the implementer changed before the update doesn't make the ticket stuck", () => {
        expect(latestStuck(run.records)).toBeNull()
        expect(commits(run.records).flatMap(({ files }) => files)).toContain(
            'src/other.test.ts'
        )
    })

    test("the update's record keeps a content hash for each test file", () => {
        const [update] = updates(run.records)
        const { test_files } = z
            .object({ test_files: TestFilesSchema })
            .parse(update?.content)
        const kept = hashes(test_files)

        expect(kept['src/rows.test.ts']).toEqual(expect.any(String))
        expect(kept['src/rows.test.ts']?.length ?? 0).toBeGreaterThan(0)
        expect(kept['src/rows.test.ts']).not.toBe(rowsTest('[2, 1]'))
        expect(kept['src/rows.test.ts']).not.toBe(kept['src/other.test.ts'])
    })

    test("the ticket's one commit holds the test-writer's fix and the implementer's code", async () => {
        const made = run.records.filter(
            (record) => record.kind === 'commit_made' && record.ticket === 11
        )
        const branch = ticketBranch(run.records)

        expect(commits(made)).toEqual([
            {
                stage: 'green',
                files: expect.arrayContaining([
                    'src/rows.test.ts',
                    'src/rows.ts',
                ]),
            },
        ])
        expect(await git(run.repo, 'show', `${branch}:src/rows.test.ts`)).toBe(
            FIXED_ROWS_TEST
        )
        expect(await git(run.repo, 'show', `${branch}:src/rows.ts`)).toBe(
            SORTED_ROWS
        )
    })
})

describe("a refactor test update that can't go on, end to end (#686)", () => {
    test('a test-writer that also changes another test file makes the ticket stuck', async () => {
        const { records } = await runRefactor([
            { ...BAD_TEST_TURN, files: { 'src/rows.ts': SORTED_ROWS } },
            {
                ...FIX_TURN,
                files: {
                    'src/rows.test.ts': FIXED_ROWS_TEST,
                    'src/other.test.ts': otherTest('adds one and one'),
                },
            },
        ])
        const stuck = latestStuck(records)

        expect(stuck).toMatchObject({ ticket: 11, reason: 'bad_test' })
        expect(
            stuck?.detail.startsWith(
                "The test-writer fixing a refactor ticket's bad test changed other test files: "
            )
        ).toBe(true)
        expect(stuck?.detail).toContain('src/other.test.ts')
    }, 60_000)

    test('a test-writer that answers environment makes the ticket stuck with its summary', async () => {
        const { records } = await runRefactor([
            BAD_TEST_TURN,
            {
                role: 'test-writer',
                ticket: 11,
                result: {
                    outcome: 'environment',
                    environment: { evidence: 'The simulator never booted.' },
                    criteria: [],
                    summary: "the simulator didn't start",
                    assumptions: [],
                    run_notes: [],
                },
            },
        ])

        expect(latestStuck(records)).toEqual({
            ticket: 11,
            reason: 'bad_test',
            detail: "The test-writer couldn't fix a refactor ticket's bad test: environment: the simulator didn't start",
        })
    }, 60_000)

    test('a test file the implementer changed before the update, changed again by the test-writer, makes the ticket stuck', async () => {
        const { records } = await runRefactor([
            BAD_TEST_TURN,
            {
                ...FIX_TURN,
                files: {
                    'src/rows.test.ts': FIXED_ROWS_TEST,
                    'src/other.test.ts': otherTest('adds one and one'),
                },
            },
        ])
        const stuck = latestStuck(records)

        expect(stuck).toMatchObject({ ticket: 11, reason: 'bad_test' })
        expect(stuck?.detail).toContain('changed other test files')
        expect(stuck?.detail).toContain('src/other.test.ts')
    }, 60_000)

    test('a second bad test after the update makes the ticket stuck', async () => {
        const { records } = await runRefactor([
            BAD_TEST_TURN,
            FIX_TURN,
            {
                role: 'implementer',
                ticket: 11,
                result: { ...BAD_ROWS, summary: 'Still the wrong order.' },
            },
        ])
        const stuck = latestStuck(records)

        expect(updates(records)).toHaveLength(1)
        expect(stuck).toMatchObject({ ticket: 11, reason: 'bad_test' })
        expect(
            stuck?.detail.startsWith(
                'The implementer of a refactor ticket sent a test back as bad a second time: '
            )
        ).toBe(true)
        expect(stuck?.detail).toContain(REASON)
    }, 60_000)
})
