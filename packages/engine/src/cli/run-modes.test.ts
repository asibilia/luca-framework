import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    resumeRun,
    runDemo,
    runSpec,
    unfinishedRuns,
    type RunLauncher,
} from './run-modes'

import { LENS_ROLES } from '../agents/role-results'
import {
    createScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import {
    createBoardSync,
    type BoardEnded,
    type BoardLink,
} from '../board/board-sync'
import { createTypeSafeJev } from '../jev/jev-client'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { createFakeMuninn } from '../testing/fake-muninn'
import {
    EMPTY_LEARNER_TURN,
    git,
    HAPPY_TURNS,
    makePracticeRepo,
    PRACTICE_ENGINE_CONFIG,
    practiceTracker,
} from '../testing/practice-repo'

/**
 * A stand-in for the Claude launcher: scripted turns, plus a `closeAll`
 * that counts its calls.
 */
const fakeClaudeLauncher = ({ turns }: { turns: ScriptedTurn[] }) => {
    const scripted = createScriptedLauncher({ turns })
    let closed = 0
    const launcher: RunLauncher = {
        launch: scripted.launch,
        followUp: scripted.followUp,
        closeAll: async () => {
            closed += 1
        },
    }
    return { launcher, closed: () => closed, launches: scripted.launches }
}

/** A board that keeps everything it is sent. */
const recordingBoard = () => {
    const kinds: string[] = []
    const seqs: number[] = []
    const endings: BoardEnded[] = []
    const link: BoardLink = {
        send: async ({ records, ended }) => {
            for (const record of records) {
                if (record.seq === seqs.length + 1) {
                    seqs.push(record.seq)
                    kinds.push(record.kind)
                }
            }
            if (ended !== null) endings.push(ended)
            return { ok: true, next_seq: seqs.length + 1, message: 'ok' }
        },
    }
    return {
        board: createBoardSync({ link }),
        /** The kinds it got, without the scheduler's step records. */
        kinds: () =>
            kinds.filter(
                (kind) =>
                    kind !== 'step_started' &&
                    kind !== 'step_ended' &&
                    kind !== 'run_resumed'
            ),
        endings: () => endings,
    }
}

let root = ''
const logs: string[] = []
const log = (line: string) => {
    logs.push(line)
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-run-modes-'))
    logs.length = 0
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('luca-run --demo', () => {
    test('builds both practice tickets, opens one PR, tells the board, and cleans up', async () => {
        const recorder = recordingBoard()

        const result = await runDemo({
            run_id: 'luca-20260923-141500-ab12',
            board: recorder.board,
            log,
            turn_delay_ms: 0,
        })

        expect(result.ok).toBe(true)
        expect(result.pull_requests).toHaveLength(1)
        expect(result.pull_requests[0]?.body).toContain('Closes #11')
        expect(result.pull_requests[0]?.body).toContain('Closes #12')
        expect(recorder.kinds()[0]).toBe('run_started')
        expect(recorder.kinds().slice(-2)).toEqual([
            'pull_request_opened',
            'worktrees_removed',
        ])
        // Jev is asked in shadow mode with no key: journaled, never sent.
        expect(recorder.kinds()).toContain('jev_asked')
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

describe('luca-run --spec', () => {
    test('builds the spec with the launcher it is given, opens the PR, and closes the sessions', async () => {
        const { repo } = await makePracticeRepo({ root })
        const recorder = recordingBoard()
        const claude = fakeClaudeLauncher({ turns: HAPPY_TURNS })

        const result = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker(),
            launcher: claude.launcher,
            board: recorder.board,
            log,
        })

        expect(result).toEqual({
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
        expect(claude.closed()).toBe(1)
        expect(recorder.kinds()).toContain('agent_finished')
        expect(recorder.kinds().slice(-2)).toEqual([
            'pull_request_opened',
            'worktrees_removed',
        ])
        expect(recorder.endings()).toEqual([result])
    }, 60_000)

    test('asks Jev in shadow mode when given one', async () => {
        const { repo } = await makePracticeRepo({ root })
        const recorder = recordingBoard()

        const result = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker(),
            launcher: fakeClaudeLauncher({ turns: HAPPY_TURNS }).launcher,
            jev: { client: createTypeSafeJev({ api_key: '' }) },
            board: recorder.board,
            log,
        })

        expect(result.ok).toBe(true)
        expect(recorder.kinds()).toContain('jev_asked')
        expect(recorder.kinds()).toContain('jev_failed')
    }, 60_000)

    test('with a memory client, memory is on with the config’s vault, and the client is closed', async () => {
        const { repo } = await makePracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                muninn: { vault: 'practice-vault' },
            },
        })
        const muninn = createFakeMuninn()

        const result = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker(),
            launcher: fakeClaudeLauncher({
                turns: [...HAPPY_TURNS, EMPTY_LEARNER_TURN(10)],
            }).launcher,
            memory: { client: muninn },
            board: null,
            log,
        })

        expect(result.ok).toBe(true)
        const records = createJournal({
            file: runJournalPath({
                runs_dir: join(root, 'runs'),
                run_id: 'run-1',
            }),
        }).read()
        const [started] = records
        expect(
            started?.kind === 'run_started' ? started.content.memory : null
        ).toEqual({ project_vault: 'practice-vault' })
        expect(
            muninn
                .calls()
                .filter(({ op }) => op === 'recall')
                .map(({ vault }) => vault)
                .slice(0, 2)
        ).toEqual(['practice-vault', 'default'])
        expect(records.map(({ kind }) => kind)).toContain('memories_saved')
        expect(muninn.closed()).toBe(true)
    }, 60_000)

    test('a launcher stop ends the run with its reason, and the sessions are closed', async () => {
        const { repo } = await makePracticeRepo({ root })
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
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker(),
            launcher: claude.launcher,
            board: recorder.board,
            log,
        })

        expect(result).toEqual({
            ok: false,
            message: 'Run stopped: An API key was used, not the Claude plan.',
        })
        expect(recorder.kinds().at(-1)).toBe('run_stopped')
        expect(recorder.endings()).toEqual([result])
        expect(claude.closed()).toBe(1)
    }, 60_000)

    test('a run id with a journal already resumes it instead of starting again', async () => {
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')
        const args = {
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir,
            tracker: practiceTracker(),
            launcher: fakeClaudeLauncher({ turns: HAPPY_TURNS }).launcher,
            board: null,
            log,
        }

        const first = await runSpec(args)
        const second = await runSpec(args)

        expect(first.ok).toBe(true)
        expect(second).toEqual(first)
        const journal = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'run-1' }),
        })
        expect(
            journal.read().filter((record) => record.kind === 'run_started')
        ).toHaveLength(1)
        expect(logs).toContain('[luca-run] resuming the run from its journal')
    }, 60_000)

    test('the run_started record keeps the repo, so a resume can find it', async () => {
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')

        await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: 'main',
            runs_dir,
            tracker: practiceTracker(),
            launcher: fakeClaudeLauncher({ turns: HAPPY_TURNS }).launcher,
            board: null,
            log,
        })

        const [started] = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'run-1' }),
        }).read()
        expect(started).toMatchObject({
            kind: 'run_started',
            content: { spec_number: 10, base_branch: 'main', repo },
        })
    }, 60_000)

    test('a repo with no engine config ends with the config error', async () => {
        const recorder = recordingBoard()
        const claude = fakeClaudeLauncher({ turns: [] })

        const result = await runSpec({
            spec_number: 10,
            repo: root,
            run_id: 'run-1',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker(),
            launcher: claude.launcher,
            board: recorder.board,
            log,
        })

        expect(result.ok).toBe(false)
        expect(result.message).toContain('No engine config found')
        expect(recorder.endings()).toEqual([result])
        expect(claude.launches()).toEqual([])
        expect(claude.closed()).toBe(1)
    })
})

/** The kinds of a run's records, oldest first. */
const kindsIn = (records: JournalRecord[]) => records.map(({ kind }) => kind)

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

describe('luca-run --resume', () => {
    test('a run that crashed after a commit is resumed by its id and finishes: one PR, one of each commit, no comment twice', async () => {
        const { repo, origin } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')
        const tracker = practiceTracker()
        const [testWriter, implementer, ...rest] = HAPPY_TURNS
        expect(testWriter?.role).toBe('test-writer')
        expect(implementer?.role).toBe('implementer')

        // The first engine commits the red tests, then dies launching the
        // implementer.
        const crashed = await runSpec({
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
            board: null,
            log,
        })
        expect(crashed).toEqual({
            ok: false,
            message: 'The engine crashed: The engine was killed.',
        })
        const journal = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'run-1' }),
        })
        expect(kindsIn(journal.read())).toContain('commit_made')
        expect(unfinishedRuns({ runs_dir })).toEqual(['run-1'])

        const recorder = recordingBoard()
        const resumed = fakeClaudeLauncher({
            turns: [implementer, ...rest].flatMap((turn) =>
                turn === undefined ? [] : [turn]
            ),
        })
        const end = await resumeRun({
            run_id: 'run-1',
            runs_dir,
            repo: null,
            tracker: ({ repo: at }) => {
                expect(at).toBe(repo)
                return tracker
            },
            launcher: resumed.launcher,
            board: recorder.board,
            log,
        })

        expect(end).toEqual({
            ok: true,
            message: expect.stringContaining('PR opened'),
        })
        expect(recorder.endings()).toEqual([end])
        const records = journal.read()
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
    }, 120_000)

    test('a run with memory on goes on with memory: the resume uses its client and closes it', async () => {
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')
        const tracker = practiceTracker()
        const [, implementer, ...rest] = HAPPY_TURNS
        const first = createFakeMuninn()

        await runSpec({
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
        expect(first.closed()).toBe(true)

        const second = createFakeMuninn()
        const end = await resumeRun({
            run_id: 'run-1',
            runs_dir,
            repo: null,
            tracker: () => tracker,
            launcher: fakeClaudeLauncher({
                turns: [
                    ...[implementer, ...rest].flatMap((turn) =>
                        turn === undefined ? [] : [turn]
                    ),
                    EMPTY_LEARNER_TURN(10),
                ],
            }).launcher,
            memory: { client: second },
            board: null,
            log,
        })

        expect(end.ok).toBe(true)
        const records = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'run-1' }),
        }).read()
        expect(kindsIn(records)).toContain('run_resumed')
        expect(kindsIn(records)).toContain('memories_saved')
        expect(second.closed()).toBe(true)
    }, 120_000)

    test('a run id with no journal is a clear error, and nothing runs', async () => {
        const recorder = recordingBoard()
        const claude = fakeClaudeLauncher({ turns: [] })
        const muninn = createFakeMuninn()
        const runs_dir = join(root, 'runs')

        const end = await resumeRun({
            run_id: 'no-such-run',
            runs_dir,
            repo: null,
            tracker: () => practiceTracker(),
            launcher: claude.launcher,
            memory: { client: muninn },
            board: recorder.board,
            log,
        })

        expect(end).toEqual({
            ok: false,
            message: expect.stringContaining('No run no-such-run'),
        })
        expect(muninn.closed()).toBe(true)
        expect(muninn.calls()).toEqual([])
        expect(recorder.endings()).toEqual([end])
        expect(claude.launches()).toEqual([])
        expect(claude.closed()).toBe(1)
        expect(existsSync(join(runs_dir, 'no-such-run'))).toBe(false)
    })

    test('an empty journal is a clear error too', async () => {
        const runs_dir = join(root, 'runs')
        const file = runJournalPath({ runs_dir, run_id: 'empty' })
        createJournal({ file })
        await Bun.write(file, '')

        const end = await resumeRun({
            run_id: 'empty',
            runs_dir,
            repo: null,
            tracker: () => practiceTracker(),
            launcher: fakeClaudeLauncher({ turns: [] }).launcher,
            board: null,
            log,
        })

        expect(end).toEqual({
            ok: false,
            message: expect.stringContaining('empty'),
        })
        expect(unfinishedRuns({ runs_dir })).toEqual([])
    })

    test('unfinished runs: none in a runs folder that does not exist', () => {
        expect(unfinishedRuns({ runs_dir: join(root, 'nowhere') })).toEqual([])
    })
})
