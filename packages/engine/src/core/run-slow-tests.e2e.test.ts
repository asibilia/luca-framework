import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    git,
    HAPPY_TURNS,
    happyTurns,
    IMPLEMENTER_RESULT,
    PRACTICE_ENGINE_CONFIG,
    SUM,
} from '../testing/practice-repo'

/**
 * Seam 2, the slow tests at the final review (#563), end to end on the
 * practice repo: its config names the end-to-end tests in
 * `checks.slow_test` and leaves them out of `checks.test`. The ticket's
 * code passes the fast tests but not the slow one, which only the final
 * review runs: once round 1's lenses are in, then in its fix round's gates,
 * where a fresh implementer fixes it. The gates, commits, pushes, and PR
 * are real.
 */

const FAST_TEST = "bun test --path-ignore-patterns='**/*.e2e.test.ts'"
const SLOW_TEST = 'bun test .e2e.test'

const SLOW_TESTS_CONFIG = {
    ...PRACTICE_ENGINE_CONFIG,
    checks: {
        ...PRACTICE_ENGINE_CONFIG.checks,
        test: FAST_TEST,
        slow_test: SLOW_TEST,
    },
}

/** The repo's one slow test, in its first commit. */
const SUM_E2E_TEST = `import { expect, test } from 'bun:test'

import { sum } from './sum'

test('sum adds many numbers', () => {
    expect(sum({ numbers: [1, 2, 3, 4] })).toBe(10)
})
`

/** Passes the fast tests (two numbers, or none), not the slow one. */
const SUM_OF_FIRST_TWO = `export const sum = ({ numbers }: { numbers: number[] }): number =>
    numbers.slice(0, 2).reduce((total, each) => total + each, 0)
`

const gatesRuns = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'gates_run'
            ? [{ ...record.content, ticket: record.ticket }]
            : []
    )

describe('slow tests that fail at the final review and get fixed, end to end', () => {
    let root = ''
    let origin = ''
    let run: Awaited<
        ReturnType<Awaited<ReturnType<typeof createPracticeRepo>>['run']>
    >
    /** The journal with the scheduler's step records. */
    let journal: JournalRecord[] = []

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-slow-tests-'))
        const practice = await createPracticeRepo({
            root,
            config: SLOW_TESTS_CONFIG,
            files: { 'src/sum.e2e.test.ts': SUM_E2E_TEST },
        })
        origin = practice.origin
        const { testWriter, implementer, reviewer } = happyTurns()
        const firstTwoOnly: ScriptedTurn = {
            ...implementer,
            files: { ...implementer.files, 'src/sum.ts': SUM_OF_FIRST_TWO },
        }
        // The final review's implementer, for the failed slow test.
        const finalFixer: ScriptedTurn = {
            role: 'implementer',
            ticket: 10,
            files: { 'src/sum.ts': SUM },
            result: IMPLEMENTER_RESULT,
        }
        run = await practice.run({
            turns: [testWriter, firstTwoOnly, reviewer, finalFixer],
        })
        journal = practice.journal.read()
    }, 180_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test("a ticket's baseline, red check, gates, and join gates never run the slow tests", () => {
        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const baseline = run.records.find(
            (record) => record.kind === 'baseline_tests'
        )
        if (baseline?.kind !== 'baseline_tests') throw new Error('no baseline')
        expect(baseline.content.command).toBe(FAST_TEST)
        const red = run.records.find((record) => record.kind === 'red_check')
        if (red?.kind !== 'red_check') throw new Error('no red check')
        expect(red.content.ok).toBe(true)
        expect(red.content.tests.command).toBe(FAST_TEST)
        expect(
            [baseline.content.command, red.content.tests.command].some(
                (command) => command.includes(SLOW_TEST)
            )
        ).toBe(false)

        const ticketGates = gatesRuns(run.records).filter(
            ({ ticket }) => ticket === 11
        )
        expect(ticketGates.map(({ target, ok }) => ({ target, ok }))).toEqual([
            { target: 'ticket', ok: true },
            { target: 'run_branch', ok: true },
        ])
        for (const { checks } of ticketGates) {
            expect(checks.map(({ name }) => name)).not.toContain('slow_test')
            expect(
                checks.some(({ command }) => command.includes(SLOW_TEST))
            ).toBe(false)
        }
    })

    test("the slow tests start once round 1's lenses are in, fail, and the review waits for them", () => {
        const started = run.records.find(
            (record) => record.kind === 'final_review_started'
        )
        if (started?.kind !== 'final_review_started') throw new Error('none')
        expect(started.content.slow_due).toBe(true)

        const slow = gatesRuns(run.records).filter(
            ({ target }) => target === 'final_slow'
        )
        expect(slow).toHaveLength(1)
        expect(slow[0]).toMatchObject({ ticket: null, ok: false })
        expect(
            slow[0]?.checks.map(({ name, command, ok }) => ({
                name,
                command,
                ok,
            }))
        ).toEqual([{ name: 'slow_test', command: SLOW_TEST, ok: false }])
        expect(slow[0]?.checks[0]?.output).toContain('sum adds many numbers')

        // It started under the final review's key only once every round-1
        // lens finished and its step ended: nothing writes in the run
        // branch's worktree while a lens's guard judges it. (The fresh
        // pass's lenses, #548, come after the fix round.)
        const slowStep = journal.findIndex(
            (record) =>
                record.kind === 'step_started' &&
                record.content.key === 'final' &&
                record.content.step === 'run_final_slow_tests'
        )
        const roundOne = journal.slice(
            0,
            journal.findIndex((record) => record.kind === 'final_review_fixing')
        )
        const lastLensDone = roundOne.findLastIndex(
            (record) =>
                record.kind === 'agent_finished' &&
                record.ticket === null &&
                record.content.role.endsWith('-lens')
        )
        const lastLensStepEnded = roundOne.findLastIndex(
            (record) =>
                record.kind === 'step_ended' &&
                record.content.key.startsWith('lens:')
        )
        const lensesDone = run.records.filter(
            (record) =>
                record.kind === 'lens_finished' && record.content.round === 1
        )
        expect(lensesDone).toHaveLength(5)
        expect(slowStep).toBeGreaterThan(-1)
        expect(slowStep).toBeGreaterThan(lastLensDone)
        expect(slowStep).toBeGreaterThan(lastLensStepEnded)

        // Every lens approved, yet the fix round opened on the slow tests.
        const fixing = run.records.findIndex(
            (record) => record.kind === 'final_review_fixing'
        )
        const slowRun = run.records.findIndex(
            (record) =>
                record.kind === 'gates_run' &&
                record.content.target === 'final_slow'
        )
        expect(fixing).toBeGreaterThan(slowRun)
    })

    test("the fix round's gates run the slow tests; a fresh implementer gets the failure and fixes it", () => {
        const finalGates = gatesRuns(run.records).filter(
            ({ ticket, target }) => ticket === null && target === 'run_branch'
        )
        expect(finalGates.map(({ ok }) => ok)).toEqual([false, true])
        for (const { checks } of finalGates) {
            expect(checks.map(({ name }) => name)).toEqual([
                'test',
                'slow_test',
                'types',
                'lint',
            ])
        }
        const [failed, passed] = finalGates
        expect(
            failed?.checks.find(({ name }) => name === 'slow_test')?.ok
        ).toBe(false)
        expect(failed?.checks.find(({ name }) => name === 'test')?.ok).toBe(
            true
        )
        expect(
            passed?.checks.find(({ name }) => name === 'slow_test')
        ).toMatchObject({ command: SLOW_TEST, ok: true })

        const fixers = run.launches.filter(
            ({ ticket, role }) => ticket === 10 && !role.endsWith('-lens')
        )
        expect(fixers.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch implementer',
        ])
        expect(fixers[0]?.prompt).toContain('The gates failed.')
        expect(fixers[0]?.prompt).toContain('slow_test failed')
    })

    test('the fix is pushed and the review passes there, with no second lens round, then the PR opens', async () => {
        // No re-review round; only the fresh pass (#548) reads it again.
        expect(
            run.records.filter(
                (record) =>
                    record.kind === 'final_review_started' &&
                    !('fresh' in record.content && record.content.fresh)
            )
        ).toHaveLength(1)
        const kinds = run.records.map(({ kind }) => kind)
        const pushedFix = run.records.findLastIndex(
            (record) =>
                record.kind === 'run_branch_pushed' && record.ticket === null
        )
        expect(pushedFix).toBeGreaterThan(-1)
        expect(kinds.indexOf('final_review_passed')).toBeGreaterThan(pushedFix)
        expect(kinds.indexOf('pull_request_opened')).toBeGreaterThan(
            kinds.indexOf('final_review_passed')
        )

        const [pr] = run.tracker.pullRequests()
        const log = await git(origin, 'log', '--format=%s', pr?.head ?? 'none')
        expect(log.split('\n')[0]).toBe(
            'fix: final review round 1 for spec #10'
        )
        const originSum = await git(
            origin,
            'show',
            `${pr?.head ?? 'none'}:src/sum.ts`
        )
        expect(originSum).toBe(SUM)
    })
})

describe('a repo with no slow test command, end to end', () => {
    test('its final review journals no slow_due and runs no slow tests', async () => {
        const root = await mkdtemp(join(tmpdir(), 'luca-engine-no-slow-'))
        try {
            const practice = await createPracticeRepo({ root })
            const run = await practice.run({ turns: HAPPY_TURNS })

            expect(run.action).toMatchObject({
                type: 'done',
                outcome: 'pr_opened',
            })
            const started = run.records.find(
                (record) => record.kind === 'final_review_started'
            )
            if (started?.kind !== 'final_review_started') {
                throw new Error('no final review')
            }
            expect('slow_due' in started.content).toBe(false)
            const gates = gatesRuns(run.records)
            expect(gates.map(({ target }) => target)).not.toContain(
                'final_slow'
            )
            expect(
                gates.flatMap(({ checks }) => checks.map(({ name }) => name))
            ).not.toContain('slow_test')
            expect(
                practice.journal
                    .read()
                    .some(
                        (record) =>
                            record.kind === 'step_started' &&
                            record.content.step === 'run_final_slow_tests'
                    )
            ).toBe(false)
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    }, 60_000)
})
