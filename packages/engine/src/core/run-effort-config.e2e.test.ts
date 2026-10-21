import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { lensRole } from '../agents/role-results'
import {
    createScriptedLauncher,
    type ScriptedCall,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import { resumeRun, runSpec, type RunLauncher } from '../cli/run-modes'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    HAPPY_TURNS,
    happyTurns,
    makePracticeRepo,
    PRACTICE_ENGINE_CONFIG,
    practiceTracker,
    SUM_TEST,
    TEST_WRITER_RESULT,
    type PracticeRun,
} from '../testing/practice-repo'

/**
 * Seam B for the writers' effort in the config (#660): the engine end to end
 * on the practice repo, with scripted agents (the scripted launcher records
 * the effort each launch asked for). One run sets the test-writer's effort
 * to `high`, and its final review sends a test finding to a test-writer
 * fixer. Another sets the implementer's to `high`, crashes at its
 * test-writer, and is resumed after the config file set it to `low`. Each
 * run is built once and shared (#566).
 */

/** Each scripted call as `<kind> <role> #<ticket> <effort>`. */
const callLines = (calls: ScriptedCall[]) =>
    calls.map(
        (call) => `${call.kind} ${call.role} #${call.ticket} ${call.effort}`
    )

/** The effort a record's content names, or `null` for none. */
const effortOf = (value: object): unknown =>
    'effort' in value ? value.effort : null

/** Each `agent_started` of a writer as `<role> #<ticket> <effort>`. */
const writerStartedLines = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'agent_started' &&
        (record.content.role === 'test-writer' ||
            record.content.role === 'implementer')
            ? [
                  `${record.content.role} #${record.ticket ?? 'final'} ${String(effortOf(record.content))}`,
              ]
            : []
    )

const isWriter = (role: string) =>
    role === 'test-writer' || role === 'implementer'

const { testWriter, implementer, reviewer } = happyTurns()

/** A clean ticket, then a final review whose test finding a fixer fixes. */
const TURNS: ScriptedTurn[] = [
    testWriter,
    implementer,
    reviewer,
    {
        role: lensRole({ lens: 'architecture' }),
        ticket: 10,
        result: {
            verdict: 'changes_requested',
            findings: [
                {
                    id: 'A1',
                    severity: 'blocker',
                    kind: 'test',
                    file: 'src/sum.test.ts',
                    title: 'No test adds negative numbers',
                    detail: 'Add one.',
                },
            ],
            summary: 'The architecture lens looked.',
            assumptions: [],
        },
    },
    {
        role: 'test-writer',
        ticket: 10,
        files: {
            'src/sum.test.ts': SUM_TEST.replace(
                "    test('of no numbers is zero'",
                "    test('adds negative numbers', () => {\n        expect(sum({ numbers: [-1, -2] })).toBe(-3)\n    })\n\n    test('of no numbers is zero'"
            ),
        },
        result: {
            ...TEST_WRITER_RESULT,
            finding_responses: [
                {
                    finding_id: 'architecture-A1',
                    response: 'fixed',
                    reason: '',
                },
            ],
        },
    },
]

describe("a configured test-writer's effort, end to end (#660)", () => {
    let root = ''
    let built: PracticeRun | undefined
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-effort-config-'))
        const practice = await createPracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                models: { effort: { 'test-writer': 'high' } },
            },
        })
        const ran = await practice.run({ turns: TURNS })
        built = { ...ran, origin: practice.origin }
    }, 180_000)
    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })
    const run = (): PracticeRun => {
        if (built === undefined) throw new Error('The run was not built.')
        return built
    }

    test('with "test-writer": "high", the test-writer launches at high on its ticket and at xhigh as a final review fixer, and the implementer left out at medium', () => {
        const { action, launches, records } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(
            callLines(
                launches.filter(
                    ({ kind, role }) => kind === 'launch' && isWriter(role)
                )
            )
        ).toEqual([
            'launch test-writer #11 high',
            'launch implementer #11 medium',
            'launch test-writer #10 xhigh',
        ])
        expect(writerStartedLines(records)).toEqual([
            'test-writer #11 high',
            'implementer #11 medium',
            'test-writer #final xhigh',
        ])
    })
})

/** A launcher whose first launch of `role` throws, as if the engine died then. */
const crashingOnLaunch = ({
    launcher,
    role,
}: {
    launcher: RunLauncher
    role: string
}): RunLauncher => ({
    ...launcher,
    launch: (args) =>
        args.role === role
            ? Promise.reject(new Error('The engine was killed.'))
            : launcher.launch(args),
})

const writeConfig = ({ repo, config }: { repo: string; config: object }) =>
    writeFile(
        join(repo, '.luca', 'config.json'),
        JSON.stringify(config, null, 4)
    )

describe('a resumed run keeps the effort settings it started with (#660)', () => {
    let root = ''
    let ok = false
    let resumedLaunches: ScriptedCall[] = []
    let records: JournalRecord[] = []
    const log = () => {}
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-effort-resume-'))
        const started = {
            ...PRACTICE_ENGINE_CONFIG,
            models: { effort: { implementer: 'high' } },
        }
        const { repo } = await makePracticeRepo({ root, config: started })
        const runs_dir = join(root, 'runs')
        const tracker = practiceTracker()
        await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir,
            tracker,
            launcher: crashingOnLaunch({
                launcher: createScriptedLauncher({ turns: HAPPY_TURNS }),
                role: 'test-writer',
            }),
            board: null,
            log,
        })
        await writeConfig({
            repo,
            config: { ...started, models: { effort: { implementer: 'low' } } },
        })
        const launcher = createScriptedLauncher({ turns: HAPPY_TURNS })
        const end = await resumeRun({
            run_id: 'run-1',
            runs_dir,
            repo: null,
            tracker: () => tracker,
            launcher,
            board: null,
            log,
        })
        ok = end.ok
        resumedLaunches = launcher.launches()
        records = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'run-1' }),
        }).read()
    }, 180_000)
    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('after the config file sets the implementer to low, the resumed run still launches it at high, as the run started', () => {
        expect(ok).toBe(true)
        expect(
            callLines(
                resumedLaunches.filter(
                    ({ ticket, role }) => ticket === 11 && isWriter(role)
                )
            )
        ).toEqual([
            'launch test-writer #11 medium',
            'launch implementer #11 high',
        ])
        expect(writerStartedLines(records)).toContain('implementer #11 high')
        expect(writerStartedLines(records)).not.toContain('implementer #11 low')
    })
})
