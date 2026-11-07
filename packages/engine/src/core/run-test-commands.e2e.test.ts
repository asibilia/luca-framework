import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
} from 'bun:test'

import { lensRole } from '../agents/role-results'
import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    happyTurns,
    IMPLEMENTER_RESULT,
    PRACTICE_ENGINE_CONFIG,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'

/**
 * Seam 2: several test commands per repo (#428), end to end on the practice
 * repo. Besides `bun test`, the repo has a pass-or-fail test command: a
 * small script, listed first, that the red check and baseline must leave
 * out, and that every gate runs.
 */

const WORKERS_COMMAND = 'bun scripts/check-workers.ts'

/** Fails while any source file still has a `TODO(workers)` in it. */
const CHECK_WORKERS = `const glob = new Bun.Glob('src/**/*.ts')
let bad = 0
for await (const file of glob.scan('.')) {
    if ((await Bun.file(file).text()).includes('TODO(workers)')) {
        console.error(file + ': the workers check found TODO(workers)')
        bad += 1
    }
}
process.exit(bad === 0 ? 0 : 1)
`

const TWO_TEST_COMMANDS_CONFIG = {
    ...PRACTICE_ENGINE_CONFIG,
    checks: {
        ...PRACTICE_ENGINE_CONFIG.checks,
        test: [WORKERS_COMMAND, 'bun test'],
    },
}

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-test-commands-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const byKind = <K extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: K
) =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: K }> =>
            record.kind === kind
    )

describe('several test commands, end to end', () => {
    test('a pass_fail test command runs as a gate, fails, and gets fixed, while the red check uses bun test only', async () => {
        const practice = await createPracticeRepo({
            root,
            config: TWO_TEST_COMMANDS_CONFIG,
            files: { 'scripts/check-workers.ts': CHECK_WORKERS },
        })
        const { testWriter, implementer, reviewer } = happyTurns()
        const leavesTodo: ScriptedTurn = {
            ...implementer,
            files: {
                ...implementer.files,
                'src/sum.ts': `${SUM}// TODO(workers): hook sum up to the queue\n`,
            },
        }
        const fixesTodo: ScriptedTurn = {
            ...implementer,
            files: { 'src/sum.ts': SUM },
        }

        const { action, records, launches } = await practice.run({
            turns: [testWriter, leavesTodo, fixesTodo, reviewer],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // The baseline and the red check ran bun's tests only.
        expect(byKind(records, 'baseline_tests')[0]?.content.command).toBe(
            'bun test'
        )
        const [red] = byKind(records, 'red_check')
        expect(red?.content).toMatchObject({ ok: true, problems: [] })
        expect(red?.content.tests.command).toBe('bun test')

        // Every gate run ran both test commands, in the config's order.
        const gates = byKind(records, 'gates_run').map(({ content }) => content)
        expect(gates.map(({ target, ok }) => ({ target, ok }))).toEqual([
            { target: 'ticket', ok: false },
            { target: 'ticket', ok: true },
            { target: 'run_branch', ok: true },
        ])
        for (const run of gates) {
            expect(
                run.checks.map(({ name, command }) => ({ name, command }))
            ).toEqual([
                { name: 'test', command: WORKERS_COMMAND },
                { name: 'test', command: 'bun test' },
                {
                    name: 'types',
                    command: PRACTICE_ENGINE_CONFIG.checks.types,
                },
                { name: 'lint', command: PRACTICE_ENGINE_CONFIG.checks.lint },
            ])
        }

        // The first time, only the workers check failed, with its output.
        const [first] = gates
        expect(
            first?.checks.map(({ command, ok }) => ({ command, ok }))
        ).toEqual([
            { command: WORKERS_COMMAND, ok: false },
            { command: 'bun test', ok: true },
            { command: PRACTICE_ENGINE_CONFIG.checks.types, ok: true },
            { command: PRACTICE_ENGINE_CONFIG.checks.lint, ok: true },
        ])
        expect(first?.checks[0]?.output).toContain(
            'the workers check found TODO(workers)'
        )

        // That output went to the same implementer, in the normal fix loop.
        const calls = launches.filter(({ ticket }) => ticket === 11)
        expect(calls.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'launch implementer',
            'follow_up implementer',
            'launch ticket-reviewer',
        ])
        expect(calls[2]?.session_id).toBe(calls[1]?.session_id ?? '')
        expect(calls[2]?.prompt).toContain(
            'the workers check found TODO(workers)'
        )

        // The green commit holds the fixed code.
        const green = byKind(records, 'commit_made').find(
            ({ content }) => content.stage === 'green'
        )
        expect(green?.content.files).toEqual(['src/index.ts', 'src/sum.ts'])
    }, 90_000)
})

const PASSING_TEST = `import { expect, test } from 'bun:test'

test('ok', () => {
    expect(1).toBe(1)
})
`

/** Two test commands, each covering its own folder (#722). */
const BY_PATH_CONFIG = {
    ...PRACTICE_ENGINE_CONFIG,
    checks: {
        ...PRACTICE_ENGINE_CONFIG.checks,
        test: [
            { run: 'bun test src/a', paths: ['src/a/**'] },
            { run: 'bun test src/b', paths: ['src/b/**'] },
        ],
    },
}

/** A final review finding on ticket 11's code, which only touches src/b. */
const B_FINDING = {
    id: 'S1',
    severity: 'should_fix',
    kind: 'code',
    file: 'src/b/x.ts',
    title: 'Say what x adds',
    detail: 'x has no doc comment.',
}

describe('tests by path, end to end (#722)', () => {
    // One run, built once and shared: ticket 11 changes only src/b, joins,
    // and a final review finding is fixed in src/b too, so the final
    // review's gates run.
    let shared = ''
    let records: JournalRecord[] = []

    beforeAll(async () => {
        shared = await mkdtemp(join(tmpdir(), 'luca-engine-by-path-'))
        const practice = await createPracticeRepo({
            root: shared,
            config: BY_PATH_CONFIG,
            files: {
                'src/a/a.test.ts': PASSING_TEST,
                'src/b/old.test.ts': PASSING_TEST,
            },
        })
        const { testWriter, implementer, reviewer } = happyTurns()
        const file = 'src/b/x.test.ts'
        const writesB: ScriptedTurn = {
            ...testWriter,
            files: { [file]: SUM_TEST.replace("'./sum'", "'./x'") },
            result: {
                ...TEST_WRITER_RESULT,
                criteria: [
                    {
                        criterion_id: 'AC1',
                        tests: [{ file, name: 'sum > adds two numbers' }],
                    },
                    {
                        criterion_id: 'AC2',
                        tests: [{ file, name: 'sum > of no numbers is zero' }],
                    },
                ],
            },
        }
        const codesB: ScriptedTurn = {
            ...implementer,
            files: { 'src/b/x.ts': SUM },
        }
        const findsB: ScriptedTurn = {
            role: lensRole({ lens: 'security' }),
            ticket: 10,
            result: {
                verdict: 'changes_requested',
                findings: [B_FINDING],
                summary: 'The security lens looked.',
                assumptions: [],
            },
        }
        const fixesB: ScriptedTurn = {
            role: 'implementer',
            ticket: 10,
            files: { 'src/b/x.ts': `/** Adds the numbers. */\n${SUM}` },
            result: {
                ...IMPLEMENTER_RESULT,
                finding_responses: [
                    {
                        finding_id: 'security-S1',
                        response: 'fixed',
                        reason: '',
                    },
                ],
            },
        }

        records = (
            await practice.run({
                turns: [writesB, codesB, reviewer, findsB, fixesB],
            })
        ).records
    }, 150_000)

    afterAll(async () => {
        await rm(shared, { recursive: true, force: true })
    })

    test("a ticket's gate skips the test command whose paths its changes don't touch", () => {
        const [gate] = byKind(records, 'gates_run').filter(
            ({ ticket, content }) =>
                ticket === 11 && content.target === 'ticket'
        )
        expect(gate?.content.ok).toBe(true)
        expect(
            gate?.content.checks.find(
                ({ command }) => command === 'bun test src/b'
            )
        ).toMatchObject({ name: 'test', ok: true })
        expect(
            gate?.content.checks.find(
                ({ command }) => command === 'bun test src/a'
            )
        ).toEqual({
            name: 'test',
            command: 'bun test src/a',
            ok: true,
            exit_code: 0,
            output: '',
            duration_ms: 0,
            skipped: true,
            reason: 'no changed file matches its paths',
        })
    })

    test("a join's and the final review's gates run every test command, paths or not", () => {
        // Nothing in the run changed src/a, so the paths rule would skip it.
        const gates = byKind(records, 'gates_run').filter(
            ({ content }) => content.target === 'run_branch'
        )
        expect(gates.map(({ ticket }) => ticket)).toEqual([11, null])
        for (const { content } of gates) {
            expect(content.ok).toBe(true)
            const ranA = content.checks.find(
                ({ command }) => command === 'bun test src/a'
            )
            expect(ranA).toMatchObject({ name: 'test', ok: true })
            expect(ranA?.skipped).toBeUndefined()
        }
    })
})

/** `one`, which lives in src/a, though src/b's old test checks it. */
const ONE = 'export const one = (): number => 1\n'

const ONE_TEST = `import { expect, test } from 'bun:test'

import { one } from '../a/one'

test('one is still one', () => {
    expect(one()).toBe(1)
})
`

describe("tests by path after a join's gates fail, end to end (#722)", () => {
    test("the rebased ticket's gate runs every test command, and its failure reaches the implementer", async () => {
        // Ticket 11 changes only src/a, so its own gate skips src/b's tests,
        // but its change breaks them, and the join's gates catch it.
        const practice = await createPracticeRepo({
            root,
            config: BY_PATH_CONFIG,
            files: {
                'src/a/one.ts': ONE,
                'src/a/a.test.ts': PASSING_TEST,
                'src/b/one.test.ts': ONE_TEST,
            },
        })
        const { testWriter, implementer, reviewer } = happyTurns()
        const file = 'src/a/x.test.ts'
        const writesA: ScriptedTurn = {
            ...testWriter,
            files: { [file]: SUM_TEST.replace("'./sum'", "'./x'") },
            result: {
                ...TEST_WRITER_RESULT,
                criteria: [
                    {
                        criterion_id: 'AC1',
                        tests: [{ file, name: 'sum > adds two numbers' }],
                    },
                    {
                        criterion_id: 'AC2',
                        tests: [{ file, name: 'sum > of no numbers is zero' }],
                    },
                ],
            },
        }
        const breaksB: ScriptedTurn = {
            ...implementer,
            files: {
                'src/a/x.ts': SUM,
                'src/a/one.ts': 'export const one = (): number => 2\n',
            },
        }
        const fixesB: ScriptedTurn = {
            ...implementer,
            files: { 'src/a/one.ts': ONE },
        }

        const { action, records, launches } = await practice.run({
            turns: [writesA, breaksB, fixesB, reviewer, reviewer],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [rebased] = byKind(records, 'ticket_rebased')
        expect(rebased?.content).toMatchObject({
            cause: 'join_gates',
            code: [],
        })
        // What each of ticket 11's gate runs did with src/b's tests.
        const ranB = byKind(records, 'gates_run')
            .filter(({ ticket }) => ticket === 11)
            .map(({ content }) => {
                const check = content.checks.find(
                    ({ command }) => command === 'bun test src/b'
                )
                return {
                    target: content.target,
                    ok: check?.ok,
                    skipped: check?.skipped === true,
                }
            })
        expect(ranB).toEqual([
            { target: 'ticket', ok: true, skipped: true },
            { target: 'run_branch', ok: false, skipped: false },
            { target: 'ticket', ok: false, skipped: false },
            { target: 'ticket', ok: true, skipped: false },
            { target: 'run_branch', ok: true, skipped: false },
        ])

        // The rebased gate's failure went to the implementer, who fixed it.
        const fixer = launches
            .filter(
                ({ ticket, role }) => ticket === 11 && role === 'implementer'
            )
            .at(-1)
        expect(fixer?.prompt).toContain('The gates failed')
        expect(fixer?.prompt).toContain('one is still one')
    }, 150_000)
})
