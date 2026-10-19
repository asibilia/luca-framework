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

import { runSpec, type DecisionModelSetup, type RunEnd } from './run-modes'
import {
    fakeClaudeLauncher,
    recordingBoard,
    recordsOf,
    kindsIn,
} from './run-modes-helpers'

import { LENS_ROLES } from '../agents/role-results'
import type { JournalRecord } from '../journal/journal-record'
import {
    HAPPY_TURNS,
    makePracticeRepo,
    practiceTracker,
} from '../testing/practice-repo'

/**
 * `luca-run --spec` on practice repos (#566: each run built once, its tests
 * only reading what it left).
 */

/** A fresh folder for each test's practice repo, and a fresh log. */
const eachRoot = () => {
    const folder = { root: '', logs: [] as string[] }
    beforeEach(async () => {
        folder.root = await mkdtemp(join(tmpdir(), 'luca-run-modes-'))
        folder.logs = []
    })
    afterEach(async () => {
        await rm(folder.root, { recursive: true, force: true })
    })
    return folder
}

describe('luca-run --spec, on one happy run', () => {
    // One happy run, built once: the board records it, the decision model
    // has no credentials, and `main` is named as the base. Then the same
    // call again, which resumes it (#566).
    let root = ''
    let repo = ''
    let file = ''
    const recorder = recordingBoard()
    const claude = fakeClaudeLauncher({ turns: HAPPY_TURNS })
    let first: RunEnd
    let second: RunEnd
    let closedAfterFirst = 0
    let firstRecords: JournalRecord[] = []
    let firstLogs: string[] = []
    let secondRecords: JournalRecord[] = []
    let secondLogs: string[] = []

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-run-modes-'))
        ;({ repo } = await makePracticeRepo({ root }))
        file = join(root, 'config', 'luca', '.env')
        const runs_dir = join(root, 'runs')
        const logs: string[] = []
        const args = {
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: 'main',
            runs_dir,
            tracker: practiceTracker(),
            launcher: claude.launcher,
            decision_model: {
                credentials: {
                    ok: false,
                    missing: ['CLOUDFLARE_API_TOKEN'],
                    file,
                },
                fetch: async () => {
                    throw new Error('fetch must not be called')
                },
            } satisfies DecisionModelSetup,
            log: (line: string) => {
                logs.push(line)
            },
        }

        first = await runSpec({ ...args, board: recorder.board })
        closedAfterFirst = claude.closed()
        firstRecords = recordsOf({ runs_dir, run_id: 'run-1' })
        firstLogs = [...logs]
        second = await runSpec({ ...args, board: null })
        secondRecords = recordsOf({ runs_dir, run_id: 'run-1' })
        secondLogs = logs.slice(firstLogs.length)
    }, 120_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('builds the spec with the launcher it is given, opens the PR, and closes the sessions', () => {
        expect(first).toEqual({
            ok: true,
            message: expect.stringContaining('PR opened'),
        })
        const roles = claude.launches().map(({ role }) => role)
        expect(roles.filter((role) => !role.endsWith('-lens'))).toEqual([
            'test-writer',
            'implementer',
            'ticket-reviewer',
        ])
        // The final review's five lenses run at once, in any order.
        expect(
            roles.filter((role) => role.endsWith('-lens')).toSorted()
        ).toEqual(LENS_ROLES.toSorted())
        expect(closedAfterFirst).toBe(1)
        expect(recorder.kinds()).toContain('agent_finished')
        expect(recorder.kinds().slice(-2)).toEqual([
            'pull_request_opened',
            'worktrees_removed',
        ])
        expect(recorder.endings()).toEqual([first])
    })

    test('with no credentials, the decision model is off: one line, one record, and no asks', () => {
        expect(first.ok).toBe(true)
        const kinds = kindsIn(firstRecords)
        expect(
            kinds.filter((kind) => kind === 'decision_model_off')
        ).toHaveLength(1)
        expect(kinds).not.toContain('jev_asked')
        expect(kinds).not.toContain('jev_failed')
        const off = firstRecords.find(
            ({ kind }) => kind === 'decision_model_off'
        )
        expect(off?.content).toEqual({
            model: '@cf/cloudflare/clef',
            reason: 'no_credentials',
            detail: expect.stringContaining(file),
        })
        const lines = firstLogs.filter((line) =>
            line.includes('decision model')
        )
        expect(lines).toHaveLength(1)
        expect(lines[0]).toContain(file)
        expect(lines[0]).toContain('CLOUDFLARE_API_TOKEN')
    })

    test('the run_started record keeps the repo, so a resume can find it', () => {
        const [started] = firstRecords
        expect(started).toMatchObject({
            kind: 'run_started',
            content: { spec_number: 10, base_branch: 'main', repo },
        })
    })

    test('a run id with a journal already resumes it instead of starting again', () => {
        expect(first.ok).toBe(true)
        expect(second).toEqual(first)
        expect(
            secondRecords.filter((record) => record.kind === 'run_started')
        ).toHaveLength(1)
        expect(secondLogs).toContain(
            '[luca-run] resuming the run from its journal'
        )
    })
})

describe('luca-run --spec, a stop', () => {
    const folder = eachRoot()

    test('a launcher stop ends the run with its reason, and the sessions are closed', async () => {
        const { repo } = await makePracticeRepo({ root: folder.root })
        const recorder = recordingBoard()
        const claude = fakeClaudeLauncher({
            turns: [
                {
                    role: 'test-writer',
                    ticket: 11,
                    failure: 'stop',
                    error: 'An API key was used, not the Claude plan.',
                },
            ],
        })

        const result = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir: join(folder.root, 'runs'),
            tracker: practiceTracker(),
            launcher: claude.launcher,
            board: recorder.board,
            log: (line) => {
                folder.logs.push(line)
            },
        })

        expect(result).toEqual({
            ok: false,
            message:
                'Run stopped: An API key was used, not the Claude plan. Fix that, then, to go on from its journal, type /luca-run resume run-1 in a Paseo chat.',
        })
        expect(recorder.kinds().at(-1)).toBe('run_stopped')
        expect(recorder.endings()).toEqual([result])
        expect(claude.closed()).toBe(1)
    }, 60_000)
})
