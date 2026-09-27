import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

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
 */

let root = ''
const log = () => undefined

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-run-version-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const STARTED_ON = '14.0.0-alpha.1'
const UPGRADED_TO = '14.0.0-alpha.2'

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

describe("a run's start records Luca's version", () => {
    test('a new run records the version it started on in run_started', async () => {
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')

        const end = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir,
            tracker: practiceTracker(),
            launcher: createScriptedLauncher({ turns: HAPPY_TURNS }),
            board: null,
            log,
            luca_version: STARTED_ON,
        })

        expect(end.ok).toBe(true)
        const records = recordsOf({ runs_dir })
        expect(startedOn(records)).toBe(STARTED_ON)
        expect(resumedOn(records)).toEqual([])
    }, 60_000)

    test("a new run with no version given records the engine's own version", async () => {
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')

        await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir,
            tracker: practiceTracker(),
            launcher: createScriptedLauncher({ turns: HAPPY_TURNS }),
            board: null,
            log,
        })

        expect(startedOn(recordsOf({ runs_dir }))).toBe(lucaVersion())
    }, 60_000)
})

describe("each resume records Luca's version", () => {
    test('a run id whose journal exists records the version of each resume, and run_started keeps the first', async () => {
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')
        const args = {
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir,
            tracker: practiceTracker(),
            board: null,
            log,
        }

        await runSpec({
            ...args,
            launcher: createScriptedLauncher({ turns: HAPPY_TURNS }),
            luca_version: STARTED_ON,
        })
        await runSpec({
            ...args,
            launcher: createScriptedLauncher({ turns: [] }),
            luca_version: STARTED_ON,
        })
        await runSpec({
            ...args,
            launcher: createScriptedLauncher({ turns: [] }),
            luca_version: UPGRADED_TO,
        })

        const records = recordsOf({ runs_dir })
        expect(
            records.filter((record) => record.kind === 'run_started')
        ).toHaveLength(1)
        expect(startedOn(records)).toBe(STARTED_ON)
        expect(resumedOn(records)).toEqual([STARTED_ON, UPGRADED_TO])
    }, 60_000)

    test('a crashed run resumed on a different version finishes, with both versions in its journal', async () => {
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')
        const tracker = practiceTracker()

        const crashed = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir,
            tracker,
            launcher: crashingOnLaunch({
                launcher: createScriptedLauncher({ turns: HAPPY_TURNS }),
                role: 'implementer',
            }),
            board: null,
            log,
            luca_version: STARTED_ON,
        })
        expect(crashed.ok).toBe(false)

        const end = await resumeRun({
            run_id: 'run-1',
            runs_dir,
            repo: null,
            tracker: () => tracker,
            launcher: createScriptedLauncher({ turns: turnsAfterTests() }),
            board: null,
            log,
            luca_version: UPGRADED_TO,
        })

        expect(end.ok).toBe(true)
        expect(tracker.pullRequests()).toHaveLength(1)
        const records = recordsOf({ runs_dir })
        expect(startedOn(records)).toBe(STARTED_ON)
        expect(resumedOn(records)).toEqual([UPGRADED_TO])
        // The resume is recorded before the engine's first step on it.
        const resumedAt = records.findIndex(
            (record) => record.kind === 'engine_resumed'
        )
        const implementerAt = records.findIndex(
            (record) =>
                record.kind === 'agent_started' && record.role === 'implementer'
        )
        expect(resumedAt).toBeGreaterThan(-1)
        expect(implementerAt).toBeGreaterThan(resumedAt)
    }, 120_000)
})

describe('a journal written before the version was recorded', () => {
    test('it still resumes and finishes, and the resume records its version', async () => {
        const { repo } = await makePracticeRepo({ root })
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
                role: 'implementer',
            }),
            board: null,
            log,
            luca_version: STARTED_ON,
        })
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
        expect(startedOn(recordsOf({ runs_dir }))).toBeNull()

        const end = await resumeRun({
            run_id: 'run-1',
            runs_dir,
            repo: null,
            tracker: () => tracker,
            launcher: createScriptedLauncher({ turns: turnsAfterTests() }),
            board: null,
            log,
            luca_version: UPGRADED_TO,
        })

        expect(end.ok).toBe(true)
        expect(tracker.pullRequests()).toHaveLength(1)
        const records = recordsOf({ runs_dir })
        expect(startedOn(records)).toBeNull()
        expect(resumedOn(records)).toEqual([UPGRADED_TO])
    }, 120_000)
})
