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

import {
    callsOf,
    closeOf,
    expectEveryoneClosed,
    launchedBy,
    PASSING_SUM_TEST,
    scriptedWith,
} from './run-session-close-helpers'

import { lensRole, type LensName } from '../agents/role-results'
import type {
    ScriptedLauncher,
    ScriptedTurn,
} from '../agents/scripted-launcher'
import { createFakeMuninn } from '../testing/fake-muninn'
import {
    CLEAN_LENS_TURNS,
    createPracticeRepo,
    happyTurns,
    IMPLEMENTER_RESULT,
    type PracticeRun,
    SUM,
    SUM_TEST,
} from '../testing/practice-repo'

/**
 * Seam 2 for closing finished agents' sessions (#409): whole runs on the
 * practice repo with the scripted launcher, which counts the sessions still
 * open. However a step ends, no finished agent's session is left open, each
 * close is journaled once, and same-session fix rounds still reuse theirs.
 * Here: the clean run and the fix rounds. The rest are in
 * `run-session-close-*.e2e.test.ts`.
 */

let root = ''

/** A fresh `root` for each test of the describe it is called in. */
const rootPerTest = () => {
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-session-close-'))
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })
}

const RENAMED_SUM = `export const sum = ({ numbers }: { numbers: number[] }): number =>
    numbers.reduce((running, each) => running + each, 0)
`

/** A lens turn of spec #10 with these findings (none: it approves). */
const lensTurn = ({
    lens,
    findings,
}: {
    lens: LensName
    findings?: object[]
}): ScriptedTurn => ({
    role: lensRole({ lens }),
    ticket: 10,
    result: {
        verdict: (findings ?? []).length > 0 ? 'changes_requested' : 'approve',
        findings: findings ?? [],
        rulings: [],
        summary: `The ${lens} lens looked.`,
        assumptions: [],
    },
})

describe('finished agents’ sessions close on one clean run, end to end', () => {
    /** One run, built once: every test reads it, and none changes it (#565). */
    let sharedRoot = ''
    let launcher: ScriptedLauncher
    let run: Omit<PracticeRun, 'origin'>
    /** The sessions open while each watched agent worked. */
    const seen: Record<string, string[]> = {}

    beforeAll(async () => {
        sharedRoot = await mkdtemp(join(tmpdir(), 'luca-session-close-'))
        const practice = await createPracticeRepo({ root: sharedRoot })
        const { testWriter, implementer, reviewer } = happyTurns()
        const [firstLens] = CLEAN_LENS_TURNS(10)
        if (firstLens === undefined) throw new Error('lenses')
        launcher = scriptedWith([
            testWriter,
            {
                ...implementer,
                act: async () => {
                    seen.implementer = launcher.openSessions()
                },
            },
            {
                ...reviewer,
                act: async () => {
                    seen.reviewer = launcher.openSessions()
                },
            },
            {
                ...firstLens,
                act: async () => {
                    seen.lens = launcher.openSessions()
                },
            },
        ])
        run = await practice.run({ launcher })
    }, 60_000)

    afterAll(async () => {
        await rm(sharedRoot, { recursive: true, force: true })
    })

    test('a clean run leaves no session open, and the journal records each close once', () => {
        const { action, records } = run

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(launchedBy(launcher).length).toBeGreaterThanOrEqual(8)
        expectEveryoneClosed({ launcher, records })
    })

    test("the test-writer's session closes with the red commit, the implementer's with the green commit, and the reviewer's once its review is ruled on", () => {
        const { action, records } = run

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [writer, coder, review] = callsOf(launcher, 11)
        if (!writer || !coder || !review) throw new Error('three calls')
        // Only the agent at work is open; the ones before it closed.
        expect(seen.implementer).toEqual([coder.session_id])
        expect(seen.reviewer).toEqual([review.session_id])
        const ticketSessions = [writer, coder, review].map(
            ({ session_id }) => session_id
        )
        expect(seen.lens?.length ?? 0).toBeGreaterThan(0)
        expect(
            (seen.lens ?? []).filter((id) => ticketSessions.includes(id))
        ).toEqual([])

        // The journal says when: after the step's result was accepted.
        const green = records.find(
            (record) =>
                record.kind === 'commit_made' &&
                record.content.stage === 'green'
        )
        const coderClosed = closeOf(records, coder.session_id)
        expect(coderClosed).toMatchObject({ ticket: 11, role: 'implementer' })
        expect(coderClosed?.seq ?? 0).toBeGreaterThan(green?.seq ?? Infinity)
        const ruled = records.find(
            (record) =>
                record.kind === 'agent_finished' &&
                record.role === 'ticket-reviewer'
        )
        const reviewClosed = closeOf(records, review.session_id)
        expect(reviewClosed).toMatchObject({
            ticket: 11,
            role: 'ticket-reviewer',
        })
        expect(reviewClosed?.seq ?? 0).toBeGreaterThan(ruled?.seq ?? Infinity)
        expect(closeOf(records, writer.session_id)).toMatchObject({
            ticket: 11,
            role: 'test-writer',
        })
        expectEveryoneClosed({ launcher, records })
    })
})

describe('finished agents’ sessions close, end to end', () => {
    rootPerTest()

    test('same-session fix rounds reuse their open session until the loop is over, and a bounced agent’s session closes', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()
        const seen: Record<string, string[]> = {}
        const launcher: ScriptedLauncher = scriptedWith([
            // 1. The first test's already passes: the red check fails.
            { ...testWriter, files: { 'src/sum.test.ts': PASSING_SUM_TEST } },
            // 2. Its follow-up, in the same session, expects 1 + 2 to be 4.
            {
                ...testWriter,
                files: {
                    'src/sum.test.ts': SUM_TEST.replace('toBe(3)', 'toBe(4)'),
                },
                act: async () => {
                    seen.writerFix = launcher.openSessions()
                },
            },
            // 3. The implementer calls that test bad.
            {
                role: 'implementer',
                ticket: 11,
                files: { 'src/sum.ts': SUM },
                result: {
                    ...IMPLEMENTER_RESULT,
                    outcome: 'bad_test',
                    bad_test: {
                        file: 'src/sum.test.ts',
                        name: 'sum > adds two numbers',
                        reason: '1 + 2 is 3, not 4.',
                    },
                },
            },
            // 4. A fresh test-writer replaces the bad test.
            {
                ...testWriter,
                act: async () => {
                    seen.freshWriter = launcher.openSessions()
                },
            },
            // 5. A fresh implementer leaves a console.log: lint fails.
            {
                ...implementer,
                files: {
                    'src/sum.ts': `${SUM}console.log('sum loaded')\n`,
                    'src/index.ts': "export { sum } from './sum'\n",
                },
                act: async () => {
                    seen.coder = launcher.openSessions()
                },
            },
            // 6. Its follow-up, in the same session, removes it.
            {
                ...implementer,
                files: { 'src/sum.ts': SUM },
                act: async () => {
                    seen.coderFix = launcher.openSessions()
                },
            },
            reviewer,
        ])

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const calls = callsOf(launcher, 11)
        expect(calls.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'follow_up test-writer',
            'launch implementer',
            'launch test-writer',
            'launch implementer',
            'follow_up implementer',
            'launch ticket-reviewer',
        ])
        const [writer1, writerFix, , writer2, coder2, coderFix] = calls
        expect(writerFix?.session_id).toBe(writer1?.session_id ?? '')
        expect(coderFix?.session_id).toBe(coder2?.session_id ?? '')
        // Each fix round found its session open, and only its own.
        expect(seen.writerFix).toEqual([writer1?.session_id ?? ''])
        expect(seen.freshWriter).toEqual([writer2?.session_id ?? ''])
        expect(seen.coder).toEqual([coder2?.session_id ?? ''])
        expect(seen.coderFix).toEqual([coder2?.session_id ?? ''])
        expectEveryoneClosed({ launcher, records })
    }, 90_000)

    test('a review fix round goes to a fresh implementer, and each reviewer’s session closes once its round is ruled on', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer } = happyTurns()
        const seen: Record<string, string[]> = {}
        const launcher: ScriptedLauncher = scriptedWith([
            testWriter,
            implementer,
            {
                role: 'ticket-reviewer',
                ticket: 11,
                result: {
                    verdict: 'changes_requested',
                    findings: [
                        {
                            id: 'R1-1',
                            severity: 'should_fix',
                            kind: 'code',
                            file: 'src/sum.ts',
                            title: 'Name the accumulator for what it holds',
                            detail: 'total reads like the result.',
                        },
                    ],
                    rulings: [],
                    summary: 'One fix.',
                    assumptions: [],
                },
            },
            {
                role: 'implementer',
                ticket: 11,
                files: { 'src/sum.ts': RENAMED_SUM },
                act: async () => {
                    seen.fixer = launcher.openSessions()
                },
                result: {
                    ...IMPLEMENTER_RESULT,
                    finding_responses: [
                        { finding_id: 'R1-1', response: 'fixed', reason: '' },
                    ],
                },
            },
            {
                role: 'ticket-reviewer',
                ticket: 11,
                act: async () => {
                    seen.reReview = launcher.openSessions()
                },
                result: {
                    verdict: 'approve',
                    findings: [],
                    rulings: [],
                    summary: 'Fixed.',
                    assumptions: [],
                },
            },
        ])

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const calls = callsOf(launcher, 11)
        expect(calls.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'launch implementer',
            'launch ticket-reviewer',
            'launch implementer',
            'launch ticket-reviewer',
        ])
        const [, , , fixer, reReview] = calls
        expect(seen.fixer).toEqual([fixer?.session_id ?? ''])
        expect(seen.reReview).toEqual([reReview?.session_id ?? ''])
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test('the final review closes each lens once it is ruled on, and its fixer after the fix commit; the fixer’s gate round reuses its session', async () => {
        const practice = await createPracticeRepo({ root })
        const seen: Record<string, string[]> = {}
        const fixerResult = {
            ...IMPLEMENTER_RESULT,
            finding_responses: [
                { finding_id: 'security-S1', response: 'fixed', reason: '' },
            ],
        }
        const launcher: ScriptedLauncher = scriptedWith([
            ...Object.values(happyTurns()),
            lensTurn({
                lens: 'security',
                findings: [
                    {
                        id: 'S1',
                        severity: 'should_fix',
                        kind: 'code',
                        file: 'src/sum.ts',
                        title: 'Name the accumulator for what it holds',
                        detail: 'total reads like the result.',
                    },
                ],
            }),
            // The code fixer leaves a console.log: lint fails.
            {
                role: 'implementer',
                ticket: 10,
                files: {
                    'src/sum.ts': `${RENAMED_SUM}console.log('sum loaded')\n`,
                },
                act: async () => {
                    seen.fixer = launcher.openSessions()
                },
                result: fixerResult,
            },
            // Its follow-up, in the same session, removes it.
            {
                role: 'implementer',
                ticket: 10,
                files: { 'src/sum.ts': RENAMED_SUM },
                act: async () => {
                    seen.fixerFix = launcher.openSessions()
                },
                result: fixerResult,
            },
            {
                ...lensTurn({ lens: 'security' }),
                act: async () => {
                    seen.reReview = launcher.openSessions()
                },
            },
        ])

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const fixerCalls = launcher
            .launches()
            .filter(
                ({ ticket, role }) => ticket === 10 && role === 'implementer'
            )
        expect(fixerCalls.map(({ kind }) => kind)).toEqual([
            'launch',
            'follow_up',
        ])
        const [fixer, fixerFix] = fixerCalls
        expect(fixerFix?.session_id).toBe(fixer?.session_id ?? '')
        // Every lens of the first round was ruled on before the fixer ran.
        expect(seen.fixer).toEqual([fixer?.session_id ?? ''])
        expect(seen.fixerFix).toEqual([fixer?.session_id ?? ''])
        expect(seen.reReview ?? []).not.toContain(fixer?.session_id ?? '')
        expect(seen.reReview?.length ?? 0).toBeGreaterThan(0)
        expectEveryoneClosed({ launcher, records })
    }, 90_000)

    test("the learner's session closes too, in a run with memory on", async () => {
        const practice = await createPracticeRepo({ root })
        const launcher = scriptedWith(Object.values(happyTurns()))

        const { action, records } = await practice.run({
            launcher,
            memory: { client: createFakeMuninn(), project_vault: 'practice' },
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(
            launchedBy(launcher).some(({ role }) => role === 'learner')
        ).toBe(true)
        expectEveryoneClosed({ launcher, records })
    }, 60_000)
})
