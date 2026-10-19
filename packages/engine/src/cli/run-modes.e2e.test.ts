import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import {
    resumeRun,
    runDemo,
    runSpec,
    unfinishedRuns,
    type RunEnd,
    type RunLauncher,
} from './run-modes'
import {
    fakeClaudeLauncher,
    recordingBoard,
    recordsOf,
    kindsIn,
} from './run-modes-helpers'

import type { JournalRecord } from '../journal/journal-record'
import { createFakeMuninn, type FakeMuninn } from '../testing/fake-muninn'
import {
    EMPTY_LEARNER_TURN,
    git,
    HAPPY_TURNS,
    makePracticeRepo,
    practiceTracker,
} from '../testing/practice-repo'
import type { InMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * `luca-run`'s run modes on practice repos (#566: each run built once, its
 * tests only reading what it left).
 */

describe('luca-run --demo', () => {
    const logs: string[] = []
    const log = (line: string) => {
        logs.push(line)
    }

    test('builds both practice tickets, opens one PR, tells the board, and cleans up', async () => {
        const recorder = recordingBoard()
        const realFetch = globalThis.fetch
        let fetched = 0
        globalThis.fetch = Object.assign(
            async () => {
                fetched += 1
                throw new Error('the demo must not reach the network')
            },
            { preconnect: realFetch.preconnect }
        )

        let result: Awaited<ReturnType<typeof runDemo>>
        try {
            result = await runDemo({
                run_id: 'luca-20260923-141500-ab12',
                board: recorder.board,
                log,
                turn_delay_ms: 0,
            })
        } finally {
            globalThis.fetch = realFetch
        }

        expect(result.ok).toBe(true)
        expect(result.pull_requests).toHaveLength(1)
        expect(result.pull_requests[0]?.body).toContain('Closes #11')
        expect(result.pull_requests[0]?.body).toContain('Closes #12')
        expect(recorder.kinds()[0]).toBe('run_started')
        expect(recorder.kinds().slice(-2)).toEqual([
            'pull_request_opened',
            'worktrees_removed',
        ])
        // The decision model is off in the demo: no asks, nothing sent.
        expect(recorder.kinds()).not.toContain('jev_asked')
        expect(recorder.kinds()).not.toContain('jev_failed')
        expect(fetched).toBe(0)
        expect(logs.join('\n')).toContain('decision model off')
        // Memory is a fake MuninnDB: searched, learned, and saved offline.
        expect(recorder.kinds()).toContain('memory_recalled')
        expect(recorder.kinds()).toContain('memories_saved')
        expect(result.pull_requests[0]?.body).toContain('## New memories')
        expect(recorder.kinds()).not.toContain('jev_answered')
        expect(recorder.endings()).toEqual([
            { ok: true, message: expect.stringContaining('PR opened') },
        ])
        expect(existsSync(result.root)).toBe(false)
        expect(logs.join('\n')).toContain(result.root)
    }, 120_000)
})

/**
 * A launcher whose first launch of `role` throws, as if the engine died in
 * the middle of that agent's turn.
 */
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

describe('luca-run --resume, on one crashed run', () => {
    // One run with memory on, built once (#566): the first engine commits
    // the red tests, then dies launching the implementer; `resumeRun`
    // finishes it with a second memory client.
    let root = ''
    let repo = ''
    let origin = ''
    let runs_dir = ''
    const tracker: InMemoryTracker = practiceTracker()
    const first: FakeMuninn = createFakeMuninn()
    const second: FakeMuninn = createFakeMuninn()
    const recorder = recordingBoard()
    let crashed: RunEnd
    let crashedRecords: JournalRecord[] = []
    let unfinishedAfterCrash: string[] = []
    let firstClosedAfterCrash = false
    let trackerRepo = ''
    let resumed: ReturnType<typeof fakeClaudeLauncher>
    let end: RunEnd
    let records: JournalRecord[] = []

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-run-modes-'))
        ;({ repo, origin } = await makePracticeRepo({ root }))
        runs_dir = join(root, 'runs')
        const [testWriter, implementer, ...rest] = HAPPY_TURNS
        expect(testWriter?.role).toBe('test-writer')
        expect(implementer?.role).toBe('implementer')
        const log = () => undefined

        crashed = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir,
            tracker,
            launcher: crashingOnLaunch({
                launcher: fakeClaudeLauncher({ turns: HAPPY_TURNS }).launcher,
                role: 'implementer',
            }),
            memory: { client: first },
            board: null,
            log,
        })
        crashedRecords = recordsOf({ runs_dir, run_id: 'run-1' })
        unfinishedAfterCrash = unfinishedRuns({ runs_dir })
        firstClosedAfterCrash = first.closed()

        resumed = fakeClaudeLauncher({
            turns: [
                ...[implementer, ...rest].flatMap((turn) =>
                    turn === undefined ? [] : [turn]
                ),
                EMPTY_LEARNER_TURN(10),
            ],
        })
        end = await resumeRun({
            run_id: 'run-1',
            runs_dir,
            repo: null,
            tracker: ({ repo: at }) => {
                trackerRepo = at
                return tracker
            },
            launcher: resumed.launcher,
            memory: { client: second },
            board: recorder.board,
            log,
        })
        records = recordsOf({ runs_dir, run_id: 'run-1' })
    }, 120_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('a run that crashed after a commit is resumed by its id and finishes: one PR, one of each commit, no comment twice', async () => {
        expect(crashed).toEqual({
            ok: false,
            message:
                'The engine crashed: The engine was killed. To go on from its journal, run luca-run --resume run-1.',
        })
        expect(kindsIn(crashedRecords)).toContain('commit_made')
        expect(unfinishedAfterCrash).toEqual(['run-1'])

        expect(trackerRepo).toBe(repo)
        expect(end).toEqual({
            ok: true,
            message: expect.stringContaining('PR opened'),
        })
        expect(recorder.endings()).toEqual([end])
        expect(
            kindsIn(records).filter((kind) => kind === 'run_started')
        ).toHaveLength(1)
        expect(kindsIn(records)).toContain('run_resumed')
        // The resumed run never wrote the tests again.
        expect(resumed.launches().map(({ role }) => role)).not.toContain(
            'test-writer'
        )
        expect(tracker.pullRequests()).toHaveLength(1)
        const head = tracker.pullRequests()[0]?.head ?? 'none'
        const subjects = (await git(origin, 'log', '--format=%s', head))
            .trim()
            .split('\n')
        expect(subjects).toEqual([...new Set(subjects)])
        for (const number of [10, 11]) {
            const bodies = tracker.commentsOn({ number })
            expect(bodies).toEqual([...new Set(bodies)])
        }
        expect(unfinishedRuns({ runs_dir })).toEqual([])
    })

    test('a run with memory on goes on with memory: the resume uses its client and closes it', () => {
        expect(firstClosedAfterCrash).toBe(true)
        expect(end.ok).toBe(true)
        expect(kindsIn(records)).toContain('run_resumed')
        expect(kindsIn(records)).toContain('memories_saved')
        expect(second.closed()).toBe(true)
        // The resume searched with its own client.
        expect(second.calls().some(({ op }) => op === 'recall')).toBe(true)
    })
})
