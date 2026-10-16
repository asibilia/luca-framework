import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { resumeRun, runSpec, type RunLauncher } from './run-modes'

import { createScriptedLauncher } from '../agents/scripted-launcher'
import { lucaVersion } from '../config/luca-version'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import {
    HAPPY_TURNS,
    makePracticeRepo,
    practiceTracker,
} from '../testing/practice-repo'

/**
 * Luca's version in a real run's journal (#460), end to end on the practice
 * repo: a new run records the version it started on in `run_started`
 * (`luca_version`), and each resume (`luca-run --resume`, or a run id whose
 * journal already exists) appends an `engine_resumed` with the version it
 * resumed on. A journal from before the version was recorded still resumes.
 *
 * Two runs, each built once (#566); the tests only read what they left.
 */

const log = () => undefined

const STARTED_ON = '14.0.0-alpha.1'
const UPGRADED_TO = '14.0.0-alpha.2'
const LATER = '14.0.0-alpha.3'

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

/** The turns after the test-writer's, for a run resumed after it. */
const turnsAfterTests = () =>
    HAPPY_TURNS.filter((turn, index) => index > 0 && turn !== undefined)

const recordsOf = ({ runs_dir }: { runs_dir: string }): JournalRecord[] =>
    createJournal({
        file: runJournalPath({ runs_dir, run_id: 'run-1' }),
    }).read()

/** The version in the run's `run_started`. */
const startedOn = (records: JournalRecord[]) => {
    const started = records.find((record) => record.kind === 'run_started')
    return started?.kind === 'run_started'
        ? started.content.luca_version
        : undefined
}

/** The versions of the run's `engine_resumed` records, oldest first. */
const resumedOn = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'engine_resumed' ? [record.content.luca_version] : []
    )

/** The run's args for `runSpec`, on `repo` with run id `run-1`. */
const specArgs = ({
    repo,
    runs_dir,
    tracker,
}: {
    repo: string
    runs_dir: string
    tracker: ReturnType<typeof practiceTracker>
}) => ({
    spec_number: 10,
    repo,
    run_id: 'run-1',
    base_branch: null,
    runs_dir,
    tracker,
    board: null,
    log,
})

describe("Luca's version on a run's start and each resume, on one run", () => {
    // One run, built once (#566): it starts on STARTED_ON and crashes at its
    // implementer; `resumeRun` finishes it on UPGRADED_TO; then the same run
    // id is started twice more, on UPGRADED_TO again and on a third version.
    let root = ''
    const tracker = practiceTracker()
    let crashed: Awaited<ReturnType<typeof runSpec>>
    let end: Awaited<ReturnType<typeof resumeRun>>
    let atStart: JournalRecord[] = []
    let afterResume: JournalRecord[] = []
    let atEnd: JournalRecord[] = []

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-run-version-'))
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')
        const args = specArgs({ repo, runs_dir, tracker })

        crashed = await runSpec({
            ...args,
            launcher: crashingOnLaunch({
                launcher: createScriptedLauncher({ turns: HAPPY_TURNS }),
                role: 'implementer',
            }),
            luca_version: STARTED_ON,
        })
        atStart = recordsOf({ runs_dir })
        end = await resumeRun({
            run_id: 'run-1',
            runs_dir,
            repo: null,
            tracker: () => tracker,
            launcher: createScriptedLauncher({ turns: turnsAfterTests() }),
            board: null,
            log,
            luca_version: UPGRADED_TO,
        })
        afterResume = recordsOf({ runs_dir })
        await runSpec({
            ...args,
            launcher: createScriptedLauncher({ turns: [] }),
            luca_version: UPGRADED_TO,
        })
        await runSpec({
            ...args,
            launcher: createScriptedLauncher({ turns: [] }),
            luca_version: LATER,
        })
        atEnd = recordsOf({ runs_dir })
    }, 180_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('a new run records the version it started on in run_started', () => {
        expect(startedOn(atStart)).toBe(STARTED_ON)
        expect(resumedOn(atStart)).toEqual([])
    })

    test('a crashed run resumed on a different version finishes, with both versions in its journal', () => {
        expect(crashed.ok).toBe(false)
        expect(end.ok).toBe(true)
        expect(tracker.pullRequests()).toHaveLength(1)
        expect(startedOn(afterResume)).toBe(STARTED_ON)
        expect(resumedOn(afterResume)).toEqual([UPGRADED_TO])
        // The resume is recorded before the engine launches the implementer
        // again. The crashed run's own implementer start comes before it:
        // the engine journals `agent_started` before the launch that threw.
        const resumedAt = afterResume.findIndex(
            (record) => record.kind === 'engine_resumed'
        )
        const isImplementerStart = (record: JournalRecord) =>
            record.kind === 'agent_started' && record.role === 'implementer'
        const relaunchedAt = afterResume.findIndex(
            (record, index) => index > resumedAt && isImplementerStart(record)
        )
        expect(resumedAt).toBeGreaterThan(-1)
        expect(afterResume.slice(0, resumedAt).some(isImplementerStart)).toBe(
            true
        )
        expect(relaunchedAt).toBeGreaterThan(resumedAt)
    })

    test('a run id whose journal exists records the version of each resume, and run_started keeps the first', () => {
        expect(
            atEnd.filter((record) => record.kind === 'run_started')
        ).toHaveLength(1)
        expect(startedOn(atEnd)).toBe(STARTED_ON)
        expect(resumedOn(atEnd)).toEqual([UPGRADED_TO, UPGRADED_TO, LATER])
    })
})

describe('a run with no version given, made an old journal, on one run', () => {
    // One run, built once (#566): started with no version given, it crashes
    // at its implementer; its journal is then rewritten as one from before
    // #460 (no version anywhere), and `resumeRun` finishes it.
    let root = ''
    const tracker = practiceTracker()
    let startedWith: string | null | undefined
    let rewritten: JournalRecord[] = []
    let end: Awaited<ReturnType<typeof resumeRun>>
    let records: JournalRecord[] = []

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-run-version-'))
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')
        await runSpec({
            ...specArgs({ repo, runs_dir, tracker }),
            launcher: crashingOnLaunch({
                launcher: createScriptedLauncher({ turns: HAPPY_TURNS }),
                role: 'implementer',
            }),
        })
        startedWith = startedOn(recordsOf({ runs_dir }))
        // Make it an old journal: no version anywhere, as before #460.
        const file = runJournalPath({ runs_dir, run_id: 'run-1' })
        const lines = (await readFile(file, 'utf8'))
            .split('\n')
            .filter((line) => line !== '')
            .map((line) => {
                const record = JSON.parse(line)
                if (record.kind === 'run_started') {
                    delete record.content.luca_version
                }
                return JSON.stringify(record)
            })
            .filter((line) => !line.includes('"engine_resumed"'))
        await writeFile(file, `${lines.join('\n')}\n`)
        rewritten = recordsOf({ runs_dir })

        end = await resumeRun({
            run_id: 'run-1',
            runs_dir,
            repo: null,
            tracker: () => tracker,
            launcher: createScriptedLauncher({ turns: turnsAfterTests() }),
            board: null,
            log,
            luca_version: UPGRADED_TO,
        })
        records = recordsOf({ runs_dir })
    }, 180_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test("a new run with no version given records the engine's own version", () => {
        expect(startedWith).toBe(lucaVersion())
    })

    test('a journal written before the version was recorded still resumes and finishes, and the resume records its version', () => {
        expect(startedOn(rewritten)).toBeNull()
        expect(end.ok).toBe(true)
        expect(tracker.pullRequests()).toHaveLength(1)
        expect(startedOn(records)).toBeNull()
        expect(resumedOn(records)).toEqual([UPGRADED_TO])
    })
})
