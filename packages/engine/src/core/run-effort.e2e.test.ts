import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { recordConfigReload, recordResume } from './run-start'

import type { AgentLauncher } from '../agents/agent-launcher'
import { LENS_ROLES, lensRole, type LensName } from '../agents/role-results'
import {
    createScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import { loadEngineConfig } from '../config/engine-config'
import { createFakeMuninn } from '../testing/fake-muninn'
import {
    createPracticeRepo,
    happyTurns,
    IMPLEMENTER_RESULT,
    PRACTICE_ENGINE_CONFIG,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
    type PracticeRun,
} from '../testing/practice-repo'

/**
 * Seam B for effort per role (#659): the engine end to end on the practice
 * repo, with no effort settings and scripted agents. The scripted launcher
 * records the effort each launch asked for, and a follow-up's is its
 * session's. One run, built once and shared (#566): fix loops on the ticket,
 * a final review whose findings and fresh pass (#548) each get a fix round,
 * and a learner, with memory on.
 */

/** A sum test that defines sum itself, so the red check fails. */
const PASSING_SUM_TEST = SUM_TEST.replace(
    "import { sum } from './sum'",
    'const sum = ({ numbers }: { numbers: number[] }) =>\n    numbers.reduce((a, b) => a + b, 0)'
)

const SUM_TEST_WITH_NEGATIVES = SUM_TEST.replace(
    "    test('of no numbers is zero'",
    "    test('adds negative numbers', () => {\n        expect(sum({ numbers: [-1, -2] })).toBe(-3)\n    })\n\n    test('of no numbers is zero'"
)

const RENAMED_SUM = SUM.replaceAll('total', 'running')

/** A lens turn of spec #10 with these findings (none: it approves). */
const lensTurn = (lens: LensName, findings: object[] = []): ScriptedTurn => ({
    role: lensRole({ lens }),
    ticket: 10,
    result: {
        verdict: findings.length > 0 ? 'changes_requested' : 'approve',
        findings,
        summary: `The ${lens} lens looked.`,
        assumptions: [],
    },
})

const finding = (fields: {
    id: string
    kind: 'code' | 'test'
    file: string
    title: string
}) => ({ severity: 'blocker', detail: 'Fix it.', ...fields })

const fixed = (finding_id: string) => ({
    finding_responses: [{ finding_id, response: 'fixed', reason: '' }],
})

const { testWriter, implementer, reviewer } = happyTurns()

const TURNS: ScriptedTurn[] = [
    // The red check fails, and the follow-up fixes the test.
    { ...testWriter, files: { 'src/sum.test.ts': PASSING_SUM_TEST } },
    testWriter,
    // Lint fails on the console.log, and the follow-up removes it.
    {
        ...implementer,
        files: {
            'src/sum.ts': `${SUM}console.log('sum loaded')\n`,
            'src/index.ts': "export { sum } from './sum'\n",
        },
    },
    { ...implementer, files: { 'src/sum.ts': SUM } },
    reviewer,
    // Round 1: a test finding and a code finding, for both fixers.
    lensTurn('architecture', [
        finding({
            id: 'A1',
            kind: 'test',
            file: 'src/sum.test.ts',
            title: 'No test adds negative numbers',
        }),
    ]),
    lensTurn('security', [
        finding({
            id: 'S1',
            kind: 'code',
            file: 'src/sum.ts',
            title: 'Name the accumulator for what it holds',
        }),
    ]),
    {
        role: 'test-writer',
        ticket: 10,
        files: { 'src/sum.test.ts': SUM_TEST_WITH_NEGATIVES },
        result: { ...TEST_WRITER_RESULT, ...fixed('architecture-A1') },
    },
    {
        role: 'implementer',
        ticket: 10,
        files: { 'src/sum.ts': RENAMED_SUM },
        result: { ...IMPLEMENTER_RESULT, ...fixed('security-S1') },
    },
    // Round 2, the re-review.
    lensTurn('architecture'),
    lensTurn('security'),
    // The fresh pass finds a blocker, fixed in its own fix round.
    lensTurn('security', [
        finding({
            id: 'S2',
            kind: 'code',
            file: 'src/sum.ts',
            title: 'Say where sum loses precision',
        }),
    ]),
    {
        role: 'implementer',
        ticket: 10,
        files: {
            'src/sum.ts': `/** Past Number.MAX_SAFE_INTEGER the total loses precision. */\n${RENAMED_SUM}`,
        },
        result: { ...IMPLEMENTER_RESULT, ...fixed('security-S2') },
    },
    // The re-check approves.
    lensTurn('security'),
]

describe('effort per role, end to end (#659)', () => {
    let root = ''
    let run: PracticeRun | undefined

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-effort-'))
        const practice = await createPracticeRepo({ root })
        const ran = await practice.run({
            turns: TURNS,
            memory: { client: createFakeMuninn(), project_vault: null },
        })
        run = { ...ran, origin: practice.origin }
    }, 180_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    const shared = (): PracticeRun => {
        if (run === undefined) throw new Error('The run was not built.')
        return run
    }

    /** Each scripted call's kind, role and effort, for these calls. */
    const efforts = (calls: PracticeRun['launches']) =>
        calls.map(({ kind, role, effort }) => ({ kind, role, effort }))

    test("with no effort settings, the ticket's test-writer and implementer launch at medium, and their fix-loop follow-ups keep it", () => {
        const done = shared()

        expect(done.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        const writers = done.launches.filter(
            ({ ticket, role }) => ticket === 11 && role !== 'ticket-reviewer'
        )
        expect(efforts(writers)).toEqual([
            { kind: 'launch', role: 'test-writer', effort: 'medium' },
            { kind: 'follow_up', role: 'test-writer', effort: 'medium' },
            { kind: 'launch', role: 'implementer', effort: 'medium' },
            { kind: 'follow_up', role: 'implementer', effort: 'medium' },
        ])
    })

    test('the learner launches at medium', () => {
        const learners = shared().launches.filter(
            ({ role }) => role === 'learner'
        )

        expect(efforts(learners)).toEqual([
            { kind: 'launch', role: 'learner', effort: 'medium' },
        ])
    })

    test('the ticket reviewer and each of the five lenses launch at xhigh', () => {
        const reviewers = shared().launches.filter(
            ({ role }) =>
                role === 'ticket-reviewer' ||
                (LENS_ROLES as readonly string[]).includes(role)
        )

        expect(new Set(reviewers.map(({ role }) => role))).toEqual(
            new Set(['ticket-reviewer', ...LENS_ROLES])
        )
        expect(new Set(reviewers.map(({ effort }) => effort))).toEqual(
            new Set(['xhigh'])
        )
    })

    test("the final review's fixers launch at xhigh, the fresh pass's fix round included", () => {
        const fixers = shared().launches.filter(
            ({ ticket, role }) =>
                ticket === 10 &&
                (role === 'test-writer' || role === 'implementer')
        )

        expect(efforts(fixers)).toEqual([
            { kind: 'launch', role: 'test-writer', effort: 'xhigh' },
            { kind: 'launch', role: 'implementer', effort: 'xhigh' },
            { kind: 'launch', role: 'implementer', effort: 'xhigh' },
        ])
        expect(fixers[2]?.prompt).toContain('security-S2')
    })

    test('every agent_started records the effort its agent ran at', () => {
        const starts = shared().records.flatMap((record) =>
            record.kind === 'agent_started'
                ? [
                      {
                          role: record.content.role,
                          ticket: record.ticket,
                          follow_up: record.content.follow_up_of !== null,
                          effort: record.content.effort,
                      },
                  ]
                : []
        )
        /** Medium for the ticket's writers and the learner; xhigh for the rest. */
        const expected = ({
            role,
            ticket,
        }: {
            role: string
            ticket: number | null
        }) =>
            role === 'learner' ||
            (ticket === 11 &&
                (role === 'test-writer' || role === 'implementer'))
                ? 'medium'
                : 'xhigh'

        expect(starts.filter(({ follow_up }) => follow_up)).toHaveLength(2)
        expect(starts.map(({ effort }) => effort)).toEqual(
            starts.map((start) => expected(start))
        )
    })
})

/** The practice config with these writers' efforts under `models.effort`. */
const withEffort = (effort: Record<string, string>) => ({
    ...PRACTICE_ENGINE_CONFIG,
    models: { effort },
})

/** Each scripted call's kind, role and effort, on `ticket`, for the writers. */
const writerEfforts = (calls: PracticeRun['launches'], ticket: number) =>
    calls
        .filter(
            ({ ticket: on, role }) =>
                on === ticket &&
                (role === 'test-writer' || role === 'implementer')
        )
        .map(({ kind, role, effort }) => ({ kind, role, effort }))

describe('a configured writer effort, end to end (#660)', () => {
    let root = ''
    let run: PracticeRun | undefined

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-effort-config-'))
        const practice = await createPracticeRepo({
            root,
            config: withEffort({ 'test-writer': 'high' }),
        })
        const ran = await practice.run({
            turns: [
                testWriter,
                implementer,
                reviewer,
                lensTurn('architecture', [
                    finding({
                        id: 'A1',
                        kind: 'test',
                        file: 'src/sum.test.ts',
                        title: 'No test adds negative numbers',
                    }),
                ]),
                {
                    role: 'test-writer',
                    ticket: 10,
                    files: { 'src/sum.test.ts': SUM_TEST_WITH_NEGATIVES },
                    result: {
                        ...TEST_WRITER_RESULT,
                        ...fixed('architecture-A1'),
                    },
                },
                lensTurn('architecture'),
            ],
        })
        run = { ...ran, origin: practice.origin }
    }, 180_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    const shared = (): PracticeRun => {
        if (run === undefined) throw new Error('The run was not built.')
        return run
    }

    test("with the test-writer at high under models.effort, the test-writer launches at high on its ticket and at xhigh as the final review's fixer, and the implementer stays at medium", () => {
        const done = shared()

        expect(done.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        expect(writerEfforts(done.launches, 11)).toEqual([
            { kind: 'launch', role: 'test-writer', effort: 'high' },
            { kind: 'launch', role: 'implementer', effort: 'medium' },
        ])
        expect(writerEfforts(done.launches, 10)).toEqual([
            { kind: 'launch', role: 'test-writer', effort: 'xhigh' },
        ])
    })

    test("with the test-writer at high under models.effort, the test-writer's agent_started says high on its ticket and xhigh as the final review's fixer", () => {
        const starts = shared().records.flatMap((record) =>
            record.kind === 'agent_started' && record.role === 'test-writer'
                ? [{ ticket: record.ticket, effort: record.content.effort }]
                : []
        )

        expect(starts).toEqual([
            { ticket: 11, effort: 'high' },
            { ticket: null, effort: 'xhigh' },
        ])
    })
})

/** A launcher whose launches throw, as if the engine died mid-turn. */
const crashingLaunches = (launcher: AgentLauncher): AgentLauncher => ({
    launch: () => Promise.reject(new Error('The engine crashed.')),
    followUp: (args) => launcher.followUp(args),
    closeSession: (args) => launcher.closeSession(args),
})

describe('a resumed run keeps its effort settings (#660)', () => {
    let root = ''
    let run: PracticeRun | undefined

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-effort-resume-'))
        const practice = await createPracticeRepo({
            root,
            config: withEffort({ 'test-writer': 'high', implementer: 'high' }),
        })
        // The first run starts at high and crashes in the first launch.
        await practice
            .run({
                launcher: crashingLaunches(
                    createScriptedLauncher({ turns: [] })
                ),
            })
            .catch(() => undefined)
        // Since then, the config file lowers both efforts and a build field.
        const changed = join(root, 'changed')
        await mkdir(join(changed, '.luca'), { recursive: true })
        await writeFile(
            join(changed, '.luca', 'config.json'),
            JSON.stringify({
                ...withEffort({ 'test-writer': 'low', implementer: 'low' }),
                test_timeout_ms: 600_000,
            })
        )
        recordResume({ journal: practice.journal })
        recordConfigReload({
            journal: practice.journal,
            loaded: await loadEngineConfig({ repo_root: changed }),
        })
        const ran = await practice.run({
            resume: true,
            turns: Object.values(happyTurns()),
        })
        run = { ...ran, origin: practice.origin }
    }, 180_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('after a resume whose config file lowered the efforts, the test-writer and the implementer still launch at the high the run started with', () => {
        if (run === undefined) throw new Error('The run was not built.')

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const reloads = run.records.flatMap((record) =>
            record.kind === 'config_reloaded'
                ? record.content.changes.map(({ field }) => field)
                : []
        )
        expect(reloads).toEqual(['test_timeout_ms'])
        expect(writerEfforts(run.launches, 11)).toEqual([
            { kind: 'launch', role: 'test-writer', effort: 'high' },
            { kind: 'launch', role: 'implementer', effort: 'high' },
        ])
    })
})
