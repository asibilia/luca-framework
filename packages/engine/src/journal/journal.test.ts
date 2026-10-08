import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import omit from 'lodash/omit'

import {
    createJournal,
    defaultRunsDir,
    makeRunId,
    runJournalPath,
} from './journal'
import { JournalEntrySchema } from './journal-record'
import { replayRun } from './replay'

import { AgentRoleSchema } from '../agents/role-results'
import {
    intakePassed,
    practiceTicket,
    redCheck,
    testsWritten,
    ticketWorktreeCreated,
    worktreeReset,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

const CONFIG = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

let runsDir = ''

beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'luca-engine-journal-'))
})

afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true })
})

describe('journal', () => {
    test('each append gets the next sequence number, a time, and who it is about', () => {
        const journal = createJournal({
            file: runJournalPath({ runs_dir: runsDir, run_id: 'run-1' }),
        })

        const first = journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        const second = journal.append({
            kind: 'nothing_to_do',
            ticket: null,
            role: null,
            content: { closed_tickets: [11] },
        })

        expect(first).toMatchObject({
            seq: 1,
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10 },
        })
        expect(second).toMatchObject({
            seq: 2,
            kind: 'nothing_to_do',
            content: { closed_tickets: [11] },
        })
        expect(Number.isNaN(Date.parse(first.time))).toBe(false)
    })

    test('the journal is one JSON line per record in the run folder', async () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-2' })
        const journal = createJournal({ file })

        journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        journal.append({
            kind: 'nothing_to_do',
            ticket: null,
            role: null,
            content: { closed_tickets: [] },
        })

        expect(file).toBe(join(runsDir, 'run-2', 'journal.jsonl'))
        const lines = (await readFile(file, 'utf8')).trimEnd().split('\n')
        expect(lines).toHaveLength(2)
        expect(JSON.parse(lines[0] ?? '')).toMatchObject({
            seq: 1,
            kind: 'run_started',
        })
        expect(JSON.parse(lines[1] ?? '')).toMatchObject({
            seq: 2,
            kind: 'nothing_to_do',
        })
    })

    test('appending never rewrites earlier records', async () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-3' })
        const journal = createJournal({ file })
        journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        const before = await readFile(file, 'utf8')

        journal.append({
            kind: 'nothing_to_do',
            ticket: null,
            role: null,
            content: { closed_tickets: [] },
        })

        expect((await readFile(file, 'utf8')).startsWith(before)).toBe(true)
    })

    test('reopening a journal keeps counting from the last record', () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-4' })
        createJournal({ file }).append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })

        const reopened = createJournal({ file })
        const record = reopened.append({
            kind: 'nothing_to_do',
            ticket: null,
            role: null,
            content: { closed_tickets: [] },
        })

        expect(record.seq).toBe(2)
        expect(reopened.read().map((each) => each.seq)).toEqual([1, 2])
    })

    test('a run is rebuilt by replaying its journal file', () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-5' })
        const journal = createJournal({ file })
        journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        journal.append({
            kind: 'intake_refused',
            ticket: null,
            role: null,
            content: {
                problems: [{ ticket: 11, missing: ['A checkbox.'] }],
            },
        })

        const state = replayRun({ records: createJournal({ file }).read() })

        expect(state).toMatchObject({
            phase: 'refused',
            spec_number: 10,
            config: CONFIG,
            problems: [{ ticket: 11, missing: ['A checkbox.'] }],
            last_seq: 2,
        })
    })

    test('a line that is not a journal record is an error on read', async () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-6' })
        const journal = createJournal({ file })
        journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        await Bun.write(
            file,
            `${await readFile(file, 'utf8')}{"seq":2,"kind":"mystery"}\n`
        )

        expect(() => journal.read()).toThrow('line 2')
    })

    test('agent records from before fix loops read with no session', async () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-1' })
        const journal = createJournal({ file })
        journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        const time = '2026-01-01T00:00:00.000Z'
        const old = [
            {
                seq: 2,
                time,
                kind: 'agent_started',
                ticket: 11,
                role: 'implementer',
                content: { role: 'implementer', prompt: 'p' },
            },
            {
                seq: 3,
                time,
                kind: 'agent_finished',
                ticket: 11,
                role: 'implementer',
                content: { role: 'implementer', result: { outcome: 'done' } },
            },
        ]
        await Bun.write(
            file,
            `${await readFile(file, 'utf8')}${old.map((record) => JSON.stringify(record)).join('\n')}\n`
        )

        const [, started, finished] = journal.read()
        expect(started?.content).toMatchObject({ follow_up_of: null })
        expect(finished?.content).toMatchObject({ session_id: null })
        expect(
            replayRun({ records: journal.read() }).tickets[11]?.sessions
        ).toEqual({})
    })

    test('Jev records from before Clef (#534) read and replay', async () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-1' })
        const journal = createJournal({ file })
        journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        const time = '2026-09-28T00:00:00.000Z'
        const request = {
            state: { ticket: '#11 Add sum' },
            questions: { tdd: { type: 'noul', instructions: 'Use tdd?' } },
        }
        const old = [
            {
                seq: 2,
                time,
                kind: 'jev_asked',
                ticket: 11,
                role: 'implementer',
                content: {
                    job: 'agent_skills',
                    request,
                    fixed: { tdd: false },
                },
            },
            {
                seq: 3,
                time,
                kind: 'jev_answered',
                ticket: 11,
                role: 'implementer',
                content: {
                    job: 'agent_skills',
                    asked_seq: 2,
                    answers: {
                        tdd: {
                            value: 0.9,
                            confidence: null,
                            raw: { probability: 0.9 },
                        },
                    },
                    ms: 300,
                },
            },
            {
                seq: 4,
                time,
                kind: 'jev_asked',
                ticket: 11,
                role: 'implementer',
                content: {
                    job: 'agent_skills',
                    request,
                    fixed: { tdd: false },
                },
            },
            {
                seq: 5,
                time,
                kind: 'jev_failed',
                ticket: 11,
                role: 'implementer',
                content: {
                    job: 'agent_skills',
                    asked_seq: 4,
                    reason: 'missing_key',
                    error: 'TYPESAFE_API_KEY is not set.',
                    ms: 0,
                },
            },
        ]
        await Bun.write(
            file,
            `${await readFile(file, 'utf8')}${old.map((record) => JSON.stringify(record)).join('\n')}\n`
        )

        const records = journal.read()
        expect(records.map(({ kind }) => kind)).toEqual([
            'run_started',
            'jev_asked',
            'jev_answered',
            'jev_asked',
            'jev_failed',
        ])
        expect(records[2]?.content).not.toHaveProperty('model')
        expect(records[4]?.content).toMatchObject({ reason: 'missing_key' })
        expect(omit(replayRun({ records }), 'last_seq')).toEqual(
            omit(replayRun({ records: records.slice(0, 1) }), 'last_seq')
        )
    })

    test('a decision_model_off record reads and changes nothing on replay', () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-1' })
        const journal = createJournal({ file })
        journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        journal.append({
            kind: 'decision_model_off',
            ticket: null,
            role: null,
            content: {
                model: '@cf/cloudflare/clef',
                reason: 'no_credentials',
                detail: 'No Cloudflare credentials.',
            },
        })

        const records = journal.read()
        expect(records[1]?.kind).toBe('decision_model_off')
        expect(omit(replayRun({ records }), 'last_seq')).toEqual(
            omit(replayRun({ records: records.slice(0, 1) }), 'last_seq')
        )
    })

    test.each(AgentRoleSchema.options)(
        'an agent_finished of the %s reads with its result',
        (role) => {
            const reviewer =
                role === 'ticket-reviewer' || role.endsWith('-lens')
            const result = reviewer
                ? { verdict: 'approve', findings: [] }
                : role === 'test-writer'
                  ? { outcome: 'tests_written' }
                  : role === 'learner'
                    ? { memories: [], helped: [] }
                    : { outcome: 'done' }
            const parsed = JournalEntrySchema.safeParse({
                kind: 'agent_finished',
                ticket: null,
                role,
                content: { role, result, session_id: 's-1' },
            })
            expect(parsed.success).toBe(true)
        }
    )

    test('runs live outside git, under the Luca state folder by default', () => {
        const saved = process.env.LUCA_RUNS_DIR
        delete process.env.LUCA_RUNS_DIR
        expect(defaultRunsDir()).toBe(
            join(homedir(), '.local', 'state', 'luca', 'runs')
        )
        process.env.LUCA_RUNS_DIR = '/tmp/custom-runs'
        expect(defaultRunsDir()).toBe('/tmp/custom-runs')
        if (saved === undefined) delete process.env.LUCA_RUNS_DIR
        else process.env.LUCA_RUNS_DIR = saved
    })

    test('run ids are unique and safe as folder names', () => {
        const first = makeRunId()
        const second = makeRunId()

        expect(first).not.toBe(second)
        expect(first).toMatch(/^[a-z0-9-]+$/)
    })
})

/**
 * A ticket's `red_tests` (#513): the new tests its latest passing red check
 * proved fail first, from the test-writer's criteria, one per file and
 * name. The PR's Evidence section lists them.
 */
describe("replay: a ticket's red tests", () => {
    const CRITERIA = [
        {
            criterion_id: 'AC1',
            tests: [
                { file: 'src/sum.test.ts', name: 'sum > adds' },
                { file: 'src/sum.test.ts', name: 'sum > subtracts' },
            ],
        },
        {
            criterion_id: 'AC2',
            tests: [
                { file: 'src/sum.test.ts', name: 'sum > adds' },
                { file: 'src/menu.test.ts', name: 'sum > adds' },
            ],
        },
    ]

    const redTestsAfter = (
        entries: Parameters<typeof recordsFrom>[0]['entries']
    ) =>
        replayRun({
            records: recordsFrom({
                entries: [
                    ...intakePassed({
                        tickets: [practiceTicket({ number: 11 })],
                    }),
                    ticketWorktreeCreated({ ticket: 11 }),
                    ...entries,
                ],
            }),
        }).tickets[11]?.red_tests

    test("a passing red check sets them from the test-writer's criteria, each test once", () => {
        expect(
            redTestsAfter([
                testsWritten({ ticket: 11, criteria: CRITERIA }),
                redCheck({ ticket: 11, ok: true }),
            ])
        ).toEqual([
            { file: 'src/sum.test.ts', name: 'sum > adds' },
            { file: 'src/sum.test.ts', name: 'sum > subtracts' },
            { file: 'src/menu.test.ts', name: 'sum > adds' },
        ])
    })

    test('a failed red check leaves them as they were', () => {
        expect(
            redTestsAfter([
                testsWritten({ ticket: 11, criteria: CRITERIA }),
                redCheck({ ticket: 11, ok: false }),
            ])
        ).toEqual([])
        expect(
            redTestsAfter([
                testsWritten({ ticket: 11 }),
                redCheck({ ticket: 11, ok: true }),
                testsWritten({ ticket: 11, criteria: CRITERIA }),
                redCheck({ ticket: 11, ok: false }),
            ])
        ).toEqual([{ file: 'src/sum.test.ts', name: 'sum adds two numbers' }])
    })

    test('a worktree reset clears them', () => {
        expect(
            redTestsAfter([
                testsWritten({ ticket: 11 }),
                redCheck({ ticket: 11, ok: true }),
                worktreeReset({ ticket: 11 }),
            ])
        ).toEqual([])
    })
})
