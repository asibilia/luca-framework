import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { recordResume, runEngine, startRun } from './execute'

import type { GoingRun } from '../cli/going-runs'
import { parseRunArgs, RUN_USAGE } from '../cli/run-args'
import { createJournal, type Journal } from '../journal/journal'
import type { EngineClock } from '../limits/limit-wait'
import { practiceTracker } from '../testing/practice-repo'
import { BUILD_CONFIG } from '../testing/run-fixtures'
import type { InMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * The repo wait (#615), from the decision step through the executor: a run
 * started while an earlier run on the same repo is going waits for it before
 * intake, telling the spec issue once. `going_runs` fakes `goingRuns`, and a
 * fake clock means nothing really waits. The run under test is `run-b`.
 */

const REPO = '/code/app'
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

let root = ''
let journal: Journal
let tracker: InMemoryTracker

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-repo-wait-'))
    journal = createJournal({ file: join(root, 'run-b', 'journal.jsonl') })
    tracker = practiceTracker()
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const start = ({ alongside }: { alongside?: true } = {}) =>
    startRun({
        journal,
        spec_number: 10,
        config: BUILD_CONFIG,
        repo: REPO,
        ...(alongside === undefined ? {} : { alongside }),
    })

/** When this run's `run_started` was journaled, in ms. */
const ownStart = (): number => Date.parse(journal.read()[0]?.time ?? '')

const at = (ms: number): string => new Date(ms).toISOString()

/** A going run as `goingRuns` lists it, with its `run_started` time. */
const going = ({
    run_id,
    started_at,
    repo = REPO,
    spec = 7,
}: {
    run_id: string
    started_at: number
    repo?: string
    spec?: number
}): GoingRun => ({
    run_id,
    spec,
    repo,
    board: false,
    state: 'engine_running',
    started_at: at(started_at),
})

/** This run's own entry: `goingRuns` lists the run that asks, too. */
const self = (): GoingRun =>
    going({ run_id: 'run-b', started_at: ownStart(), spec: 10 })

/** A clock that starts now and moves only when slept. */
const fakeClock = (from = Date.now()) => {
    let now = from
    const clock: EngineClock = {
        now: () => now,
        sleep: async (ms) => {
            now += ms
        },
    }
    return { clock, now: () => now }
}

type Listing = { runs: GoingRun[]; stopped?: GoingRun[] }

/** A fake `goingRuns` whose answer depends on the clock. */
const fakeGoingRuns =
    (clock: EngineClock, listing: (now: number) => Listing) => async () => {
        const { runs, stopped } = listing(clock.now())
        return {
            ok: true as const,
            runs,
            stopped: stopped ?? [],
            ps_error: null,
        }
    }

const runToIntake = ({
    clock,
    listing,
}: {
    clock: EngineClock
    listing: (now: number) => Listing
}) =>
    runEngine({
        journal,
        tracker,
        clock,
        going_runs: fakeGoingRuns(clock, listing),
        stop_before: ['read_intake', 'wait_for_reply'],
    })

const kinds = (): string[] => journal.read().map(({ kind }) => kind)

const recordOf = (kind: string) =>
    journal.read().find((record) => record.kind === kind)

const specComments = () => tracker.commentsOn({ number: 10 })

describe('repo waits (#615)', () => {
    test('a run started while an earlier run on the same repo is going waits for it, tells the spec issue once which run, and goes on to intake once that run stops', async () => {
        start()
        const time = fakeClock()
        const t0 = time.now()
        const earlier = going({
            run_id: 'run-a',
            started_at: ownStart() - 10 * MINUTE,
        })

        const action = await runToIntake({
            clock: time.clock,
            listing: (now) =>
                now < t0 + 30 * MINUTE
                    ? { runs: [earlier, self()] }
                    : {
                          runs: [self()],
                          stopped: [{ ...earlier, state: 'engine_gone' }],
                      },
        })

        expect(action.type).toBe('read_intake')
        expect(recordOf('repo_wait_started')).toMatchObject({
            ticket: null,
            content: { runs: [{ run_id: 'run-a', spec: 7 }] },
        })
        const order = kinds()
        expect(order.indexOf('repo_wait_started')).toBeGreaterThan(-1)
        expect(order.indexOf('repo_wait_ended')).toBeGreaterThan(
            order.indexOf('repo_wait_started')
        )
        expect(time.now()).toBeGreaterThanOrEqual(t0 + 30 * MINUTE)
        expect(time.now()).toBeLessThanOrEqual(t0 + 31 * MINUTE)
        const comments = specComments()
        expect(comments).toHaveLength(1)
        expect(comments[0]).toContain('run-a')
    })

    test('a run waits for none on another repo, none started later, not itself, and of runs started at the same moment only for the earlier run id, so two never wait for each other', async () => {
        start()
        const time = fakeClock()
        const t0 = time.now()
        const tied = (run_id: string) =>
            going({ run_id, started_at: ownStart() })
        const never = [
            self(),
            tied('run-c'),
            going({ run_id: 'run-0', started_at: ownStart() + 1 }),
            going({
                run_id: 'run-x',
                repo: '/code/other',
                started_at: ownStart() - 60 * MINUTE,
            }),
        ]

        const action = await runToIntake({
            clock: time.clock,
            listing: (now) => ({
                runs: now < t0 + 5 * MINUTE ? [tied('run-a'), ...never] : never,
            }),
        })

        expect(action.type).toBe('read_intake')
        expect(recordOf('repo_wait_started')).toMatchObject({
            content: { runs: [{ run_id: 'run-a' }] },
        })
        expect(kinds()).toContain('repo_wait_ended')
        expect(time.now()).toBeGreaterThanOrEqual(t0 + 5 * MINUTE)
    })

    test('luca-run reads --alongside, and its usage names it', () => {
        const parsed = parseRunArgs({
            argv: ['--spec', '10', '--alongside'],
            cwd: REPO,
            env: {},
        })

        expect(parsed).toMatchObject({
            ok: true,
            args: { mode: 'spec', spec_number: 10, alongside: true },
        })
        expect(RUN_USAGE).toContain('--alongside')
    })

    test('a run started alongside journals that it skipped the wait and goes straight on to intake', async () => {
        start({ alongside: true })
        const time = fakeClock()
        const t0 = time.now()

        const action = await runToIntake({
            clock: time.clock,
            listing: () => ({
                runs: [
                    going({ run_id: 'run-a', started_at: ownStart() - MINUTE }),
                    self(),
                ],
            }),
        })

        expect(action.type).toBe('read_intake')
        expect(kinds()).toContain('repo_wait_skipped')
        expect(kinds()).not.toContain('repo_wait_started')
        expect(specComments()).toHaveLength(0)
        expect(time.now()).toBe(t0)
    })

    test('a wait that reaches 24 hours makes the run stuck as repo_busy, before intake', async () => {
        start()
        const time = fakeClock()
        const t0 = time.now()
        const earlier = going({ run_id: 'run-a', started_at: ownStart() - 1 })

        const action = await runToIntake({
            clock: time.clock,
            listing: () => ({ runs: [earlier, self()] }),
        })

        expect(action.type).toBe('wait_for_reply')
        expect(recordOf('run_stuck')).toMatchObject({
            ticket: null,
            content: { reason: 'repo_busy' },
        })
        expect(kinds()).not.toContain('intake_read')
        expect(time.now() - t0).toBeGreaterThanOrEqual(DAY)
        expect(time.now() - t0).toBeLessThan(DAY + 60 * MINUTE)
    })

    test('an engine killed during the wait waits again on resume, and the spec issue still hears of it once', async () => {
        start()
        const t0 = Date.now()
        const earlier = going({
            run_id: 'run-a',
            started_at: ownStart() - 10 * MINUTE,
        })
        const killed: EngineClock = {
            now: () => t0,
            sleep: async () => {
                throw new Error('engine killed')
            },
        }

        await expect(
            runToIntake({
                clock: killed,
                listing: () => ({ runs: [earlier, self()] }),
            })
        ).rejects.toThrow('engine killed')
        expect(kinds()).toContain('repo_wait_started')
        expect(kinds()).not.toContain('repo_wait_ended')

        recordResume({ journal })
        const time = fakeClock(t0)
        const action = await runToIntake({
            clock: time.clock,
            listing: (now) => ({
                runs: now < t0 + 10 * MINUTE ? [earlier, self()] : [self()],
            }),
        })

        expect(action.type).toBe('read_intake')
        expect(kinds()).toContain('repo_wait_ended')
        expect(time.now()).toBeGreaterThanOrEqual(t0 + 10 * MINUTE)
        expect(specComments()).toHaveLength(1)
    })
})

describe('the docs on the repo wait', () => {
    test('the glossary has a Repo wait entry, and the engine docs describe the wait, --alongside and repo_busy', async () => {
        const repoRoot = join(import.meta.dir, '../../../..')
        const glossary = await Bun.file(join(repoRoot, 'GLOSSARY.md')).text()
        const entry = glossary.match(/^\*\*Repo wait\*\*:\n(.+)$/m)?.[1] ?? null
        expect(entry?.toLowerCase()).toContain('repo')

        const docsDir = join(import.meta.dir, '..', '..', 'docs')
        const pages = (await readdir(docsDir)).filter((name) =>
            name.endsWith('.md')
        )
        const docs = (
            await Promise.all(
                pages.map((name) => Bun.file(join(docsDir, name)).text())
            )
        ).join('\n')
        expect(docs).toContain('repo_wait_started')
        expect(docs).toContain('--alongside')
        expect(docs).toContain('repo_busy')
    })
})
