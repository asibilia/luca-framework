import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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

import { resumeRun, runSpec, type RunLauncher } from './run-modes'

import { createScriptedLauncher } from '../agents/scripted-launcher'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import {
    HAPPY_TURNS,
    makePracticeRepo,
    PRACTICE_ENGINE_CONFIG,
    practiceTracker,
} from '../testing/practice-repo'

/**
 * A resume re-reads the repo's config (#516), end to end on the practice
 * repo, through `resumeRun` (what `luca-run --resume` and the board's
 * auto-restart run). A run crashes at its implementer; the repo's
 * `.luca/config.json` changes; the resume journals a `config_reloaded`
 * with the build fields that changed, right after its `engine_resumed`,
 * and the gates after it run the new prepare command. A new run with a bad
 * config still stops, as before.
 *
 * What a resume journals for an unchanged config, frozen fields, or a bad
 * config (refused, keeping the run's own) is checked without a run in
 * `decide-config-reload.test.ts` (#566).
 */

let lines: string[] = []
const log = (line: string) => {
    lines.push(line)
}

const OLD_PREPARE = 'echo old-prepare'
const NEW_PREPARE = 'echo new-prepare'
const STARTED_CONFIG = { ...PRACTICE_ENGINE_CONFIG, prepare: OLD_PREPARE }

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

/**
 * A run of the practice spec on a repo whose config has `OLD_PREPARE`,
 * cut off at its implementer's launch.
 */
const crashedRun = async ({ root }: { root: string }) => {
    const { repo } = await makePracticeRepo({ root, config: STARTED_CONFIG })
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
    })
    expect(crashed.ok).toBe(false)
    return { repo, runs_dir, tracker }
}

/** Writes the repo's `.luca/config.json` as `text`, in its main checkout. */
const writeConfigText = ({ repo, text }: { repo: string; text: string }) =>
    writeFile(join(repo, '.luca', 'config.json'), text)

const writeConfig = ({ repo, config }: { repo: string; config: object }) =>
    writeConfigText({ repo, text: JSON.stringify(config, null, 4) })

/** Resumes run-1, as `luca-run --resume run-1` does. */
const resume = ({
    runs_dir,
    tracker,
}: {
    runs_dir: string
    tracker: ReturnType<typeof practiceTracker>
}) =>
    resumeRun({
        run_id: 'run-1',
        runs_dir,
        repo: null,
        tracker: () => tracker,
        launcher: createScriptedLauncher({ turns: turnsAfterTests() }),
        board: null,
        log,
    })

const kindsAfterResume = (records: JournalRecord[]) => {
    const at = records.findIndex((record) => record.kind === 'engine_resumed')
    return records.slice(at).map(({ kind }) => kind)
}

/** The commands of every check named `name` in the ticket gates after `seq`. */
const gateCommands = ({
    records,
    after,
    name,
}: {
    records: JournalRecord[]
    after: number
    name: string
}) =>
    records.flatMap((record) =>
        record.kind === 'gates_run' && record.seq > after
            ? record.content.checks
                  .filter((check) => check.name === name)
                  .map(({ command }) => command)
            : []
    )

const resumedSeq = (records: JournalRecord[]) =>
    records.find((record) => record.kind === 'engine_resumed')?.seq ?? -1

describe('a resume adopts the repo’s new build fields, on one run', () => {
    // One run, crashed at its implementer, then resumed after its config
    // got a new prepare, a prepare time limit, and a test time limit; built
    // once (#566).
    let root = ''
    let end: Awaited<ReturnType<typeof resume>>
    let records: JournalRecord[] = []
    let tracker: ReturnType<typeof practiceTracker>

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-config-reload-'))
        lines = []
        const crashed = await crashedRun({ root })
        tracker = crashed.tracker
        await writeConfig({
            repo: crashed.repo,
            config: {
                ...STARTED_CONFIG,
                prepare: NEW_PREPARE,
                prepare_timeout_ms: 120_000,
                test_timeout_ms: 600_000,
            },
        })
        end = await resume({ runs_dir: crashed.runs_dir, tracker })
        records = recordsOf({ runs_dir: crashed.runs_dir })
    }, 180_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    const changesOf = () => {
        const reloaded = records.find(
            (record) => record.kind === 'config_reloaded'
        )
        return reloaded?.kind === 'config_reloaded'
            ? reloaded.content.changes
            : []
    }

    test('a changed prepare is journaled right after engine_resumed, and the gates run the new one', () => {
        expect(end.ok).toBe(true)
        expect(tracker.pullRequests()).toHaveLength(1)
        expect(kindsAfterResume(records).slice(0, 2)).toEqual([
            'engine_resumed',
            'config_reloaded',
        ])
        expect(changesOf()).toEqual([
            { field: 'prepare', from: OLD_PREPARE, to: NEW_PREPARE },
            { field: 'prepare_timeout_ms', from: null, to: 120_000 },
            { field: 'test_timeout_ms', from: null, to: 600_000 },
        ])
        const after = resumedSeq(records)
        const prepares = gateCommands({ records, after, name: 'prepare' })
        expect(prepares.length).toBeGreaterThan(0)
        expect(prepares.every((command) => command === NEW_PREPARE)).toBe(true)
        expect(lines.some((line) => line.includes('prepare'))).toBe(true)
    })

    test('a changed test time limit is journaled after engine_resumed (#542)', () => {
        expect(end.ok).toBe(true)
        expect(kindsAfterResume(records).slice(0, 2)).toEqual([
            'engine_resumed',
            'config_reloaded',
        ])
        expect(changesOf()).toContainEqual({
            field: 'test_timeout_ms',
            from: null,
            to: 600_000,
        })
    })
})

describe('a resume after a removed prepare', () => {
    let root = ''

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-config-reload-'))
        lines = []
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('a removed prepare stops the gates running one', async () => {
        const { repo, runs_dir, tracker } = await crashedRun({ root })
        await writeConfig({ repo, config: PRACTICE_ENGINE_CONFIG })

        const end = await resume({ runs_dir, tracker })

        expect(end.ok).toBe(true)
        const records = recordsOf({ runs_dir })
        expect(
            gateCommands({
                records,
                after: resumedSeq(records),
                name: 'prepare',
            })
        ).toEqual([])
    }, 120_000)
})

describe('a new run', () => {
    let root = ''

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-config-reload-'))
        lines = []
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('a bad config still stops it before its journal starts', async () => {
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')
        await writeConfigText({ repo, text: 'not json' })

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
        })

        expect(end.ok).toBe(false)
        expect(end.message).toContain('not valid JSON')
        expect(recordsOf({ runs_dir })).toEqual([])
    }, 60_000)
})
