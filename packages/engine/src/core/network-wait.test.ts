import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runEngine, startRun } from './execute'

import { createScriptedLauncher } from '../agents/scripted-launcher'
import type { EngineConfig } from '../config/engine-config'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal, runJournalPath, type Journal } from '../journal/journal'
import type { EngineClock } from '../limits/limit-wait'
import { intakePassed, withInstalls } from '../testing/build-fixtures'
import { finalReviewPassed, lensRound } from '../testing/final-review-fixtures'
import { built, TICKET } from '../testing/final-review-steps'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import { createGhCalls } from '../tracker/gh-retry'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'
import type { Tracker } from '../tracker/tracker'

/**
 * The network wait (#701): a step that throws a GitHub network error makes
 * the run wait for GitHub, trying the step again every minute for up to 15
 * minutes, instead of crashing. The network errors here are real ones: a
 * `gh` that can't reach GitHub, through the tracker's own retries.
 */

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

const START_LINE =
    "[luca-run] GitHub can't be reached; trying again every minute for up to 15 minutes."

const STILL_LINE =
    "[luca-run] GitHub still can't be reached; trying again in a minute."

let runsDir = ''
let journal: Journal

beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'luca-network-wait-'))
    journal = createJournal({
        file: runJournalPath({ runs_dir: runsDir, run_id: 'run' }),
    })
})

afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true })
})

/** A clock that only moves when the engine sleeps on it. */
const fakeClock = (): EngineClock & { slept: number[] } => {
    let now = Date.parse('2026-10-29T00:40:00.000Z')
    const slept: number[] = []
    return {
        slept,
        now: () => now,
        sleep: async (ms) => {
            slept.push(ms)
            now += ms
        },
    }
}

/**
 * A spec ready for intake whose first `failures` reads of the spec fail as
 * a `gh` that can't reach GitHub would. Each failure's message ends with its
 * number, `(try 1)`, `(try 2)` and so on; `tries()` is how many failed.
 */
const offlineTracker = ({
    failures,
}: {
    failures: number
}): { tracker: Tracker; tries: () => number } => {
    const base = createInMemoryTracker({
        issues: [specIssue({ number: 10 }), ticketIssue({ number: 11 })],
        sub_tickets: { 10: [11] },
    })
    let failed = 0
    const offline = createGhCalls({
        run: async () => ({
            exit_code: 1,
            stdout: '',
            stderr: `error connecting to api.github.com (try ${failed})\n`,
        }),
        sleep: async () => undefined,
        log: () => undefined,
    })
    return {
        tries: () => failed,
        tracker: {
            ...base,
            readSpec: async (args) => {
                if (failed >= failures) return base.readSpec(args)
                failed += 1
                await offline.ok({ args: ['api', 'repos/acme/app/issues/10'] })
                return base.readSpec(args)
            },
        },
    }
}

/** The network wait's records, kind and content, in journal order. */
const waitRecords = () =>
    journal
        .read()
        .filter(
            ({ kind }) =>
                kind === 'network_wait_started' || kind === 'network_wait_ended'
        )
        .map(({ kind, content }) => ({ kind, content }))

/** The step the run's first `step_started` names: intake's. */
const firstStep = (): unknown =>
    journal.read().find(({ kind }) => kind === 'step_started')?.content

describe('the network wait', () => {
    test('a step that fails twice on the network, then works, waits and goes on', async () => {
        const { tracker } = offlineTracker({ failures: 2 })
        const clock = fakeClock()
        const logged: string[] = []
        startRun({ journal, spec_number: 10, config: CONFIG })

        const action = await runEngine({
            journal,
            tracker,
            clock,
            log: (line: string) => logged.push(line),
            stop_before: ['create_run_branch'],
        })

        expect(action.type).toBe('create_run_branch')
        const step = firstStep()
        expect(step).toMatchObject({ step: expect.any(String) })
        const name =
            typeof step === 'object' && step !== null && 'step' in step
                ? step.step
                : null
        expect(waitRecords()).toMatchObject([
            {
                kind: 'network_wait_started',
                content: {
                    step: name,
                    error: expect.stringContaining('error connecting to'),
                },
            },
            { kind: 'network_wait_ended', content: { step: name, tries: 2 } },
        ])
        expect(clock.slept).toEqual([60_000, 60_000])
        expect(logged.filter((line) => line === START_LINE)).toHaveLength(1)
        expect(logged.filter((line) => line === STILL_LINE)).toHaveLength(1)
    })

    test('a step that keeps failing on the network for 15 minutes gives up and throws the last error', async () => {
        const { tracker, tries } = offlineTracker({ failures: 1_000 })
        const clock = fakeClock()
        startRun({ journal, spec_number: 10, config: CONFIG })

        const thrown = await runEngine({
            journal,
            tracker,
            clock,
            log: () => undefined,
            stop_before: ['create_run_branch'],
        }).catch((error: unknown) => error)

        expect(waitRecords().at(-1)).toMatchObject({
            kind: 'network_wait_ended',
            content: { gave_up: true },
        })
        const waited = clock.slept.reduce((sum, ms) => sum + ms, 0)
        // Every minute for about 15 minutes, not a crash at the first error.
        expect(waited).toBeGreaterThanOrEqual(14 * 60_000)
        expect(waited).toBeLessThanOrEqual(16 * 60_000)
        expect(thrown).toBeInstanceOf(Error)
        expect(thrown instanceof Error ? thrown.message : '').toContain(
            `(try ${tries()})`
        )
    })
})

describe('the network wait at the PR step', () => {
    /** Ticket #11 built and the final review passed: the PR opens next. */
    const readyForPullRequest = () => {
        for (const entry of [
            ...intakePassed({ tickets: [TICKET] }),
            ...withInstalls({
                entries: [
                    ...built(),
                    ...lensRound({ round: 1 }),
                    finalReviewPassed(),
                ],
            }),
        ]) {
            journal.append(entry)
        }
    }

    /**
     * A tracker whose first look for the run branch's open PR fails as
     * `gh pr list` does with `stderr`, through the tracker's own retries.
     */
    const failingPrTracker = ({ stderr }: { stderr: string }): Tracker => {
        const base = createInMemoryTracker({
            issues: [specIssue({ number: 10 }), ticketIssue({ number: 11 })],
            sub_tickets: { 10: [11] },
        })
        const failing = createGhCalls({
            run: async () => ({ exit_code: 1, stdout: '', stderr }),
            sleep: async () => undefined,
            log: () => undefined,
        })
        let failed = false
        return {
            ...base,
            findOpenPullRequest: async (args) => {
                if (failed) return base.findOpenPullRequest(args)
                failed = true
                await failing.ok({ args: ['pr', 'list', '--head', args.head] })
                return base.findOpenPullRequest(args)
            },
        }
    }

    /** Runs the engine from the PR step until it would remove the worktrees. */
    const runPullRequestStep = ({ tracker }: { tracker: Tracker }) =>
        runEngine({
            journal,
            tracker,
            git: createGitAdapter({ repo_root: runsDir }),
            launcher: createScriptedLauncher({ turns: [] }),
            clock: fakeClock(),
            log: () => undefined,
            stop_before: ['remove_worktrees', 'wait_for_reply'],
        })

    const stuckReasons = () =>
        journal
            .read()
            .flatMap(({ kind, content }) =>
                kind === 'run_stuck' &&
                typeof content === 'object' &&
                content !== null &&
                'reason' in content
                    ? [content.reason]
                    : []
            )

    test('a PR step that cannot reach GitHub waits for it, not stuck, and opens the PR', async () => {
        readyForPullRequest()

        const action = await runPullRequestStep({
            tracker: failingPrTracker({
                stderr: 'error connecting to api.github.com\n',
            }),
        })

        expect(stuckReasons()).toEqual([])
        expect(waitRecords()).toMatchObject([
            {
                kind: 'network_wait_started',
                content: {
                    step: 'open_pull_request',
                    error: expect.stringContaining('error connecting to'),
                },
            },
            {
                kind: 'network_wait_ended',
                content: { step: 'open_pull_request', tries: 1 },
            },
        ])
        expect(
            journal.read().some(({ kind }) => kind === 'pull_request_opened')
        ).toBe(true)
        expect(action.type).toBe('remove_worktrees')
    })

    test('a PR step whose gh call fails for another reason still leaves the run stuck, with no network wait', async () => {
        readyForPullRequest()

        const action = await runPullRequestStep({
            tracker: failingPrTracker({
                stderr: 'HTTP 422: Validation Failed\n',
            }),
        })

        expect(stuckReasons()).toEqual(['pull_request_failed'])
        expect(waitRecords()).toEqual([])
        expect(action.type).toBe('wait_for_reply')
    })
})
