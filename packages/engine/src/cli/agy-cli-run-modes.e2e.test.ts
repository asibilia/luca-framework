import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    resumeRun,
    runSpec,
    type RunLauncher,
    type RunLauncherSource,
} from './run-modes'
import {
    fakeClaudeLauncher,
    recordingBoard,
    recordsOf,
} from './run-modes-helpers'

import type { ProviderId } from '../agents/provider'
import type { JournalRecord } from '../journal/journal-record'
import type { UsageLineDeps } from '../limits/usage-line'
import {
    cleanupDir,
    createTempRoot,
    makeAgyConfig,
} from '../testing/agy-e2e-helpers'
import {
    HAPPY_TURNS,
    PRACTICE_ENGINE_CONFIG,
    VALID_STORY_TURN,
    makePracticeRepo,
    practiceTracker,
} from '../testing/practice-repo'

/**
 * E2E contract tests for Spec #777 Feature F13 (`run-modes.ts`):
 * - Fresh `runSpec` with `provider: 'agy'` and `RunLauncherSource` factory
 *   (`overrideConfigProvider` + Claude usage-line omission)
 * - `resumeRun` / `runSpec` resume reading journaled `provider: 'agy'` even
 *   when `.luca/config.json` specifies `'claude'`
 * - Error-path factory narrowing (`bad` `.luca/config.json`, empty/missing
 *   journal) and backward compatibility with pre-built `RunLauncher` objects.
 */

const roots: string[] = []

afterEach(() => {
    while (roots.length > 0) {
        const dir = roots.pop()
        if (dir !== undefined) cleanupDir({ dir })
    }
})

const makeRoot = (): string => {
    const dir = createTempRoot({ prefix: 'luca-agy-modes-' })
    roots.push(dir)
    return dir
}

const highClaudeUsage = (): {
    usage: UsageLineDeps
    calls: () => number
} => {
    let readCalls = 0
    const futureReset = Math.floor(Date.now() / 1000) + 3600
    const usage: UsageLineDeps = {
        read_lines: async () => {
            readCalls += 1
            return { weekly_line: 80, five_hour_line: 85 }
        },
        read_shared: async () => {
            readCalls += 1
            return [
                {
                    status: 'allowed',
                    rateLimitType: 'seven_day',
                    isUsingOverage: false,
                    overageStatus: 'rejected',
                    unifiedWindows: {
                        seven_day: {
                            utilization: 0.99,
                            resetsAt: futureReset,
                        },
                    },
                    arrived_at: new Date().toISOString(),
                },
            ]
        },
        share: async () => {},
    }
    return { usage, calls: () => readCalls }
}

const crashingOnImplementer = ({
    launcher,
}: {
    launcher: RunLauncher
}): RunLauncher => ({
    ...launcher,
    launch: (args) =>
        args.role === 'implementer'
            ? Promise.reject(new Error('Simulated crash during agy build.'))
            : launcher.launch(args),
})

const runStartedRecord = (
    records: JournalRecord[]
): Extract<JournalRecord, { kind: 'run_started' }> | undefined => {
    const first = records.find((record) => record.kind === 'run_started')
    return first?.kind === 'run_started' ? first : undefined
}

describe('F13: runSpec & resumeRun provider wiring — Tier 1 equivalence classes', () => {
    test('runSpec fresh with provider agy and RunLauncherSource factory overrides floors, writes journal config, omits usage, and calls closeAll', async () => {
        const root = makeRoot()
        const { repo } = await makePracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                models: {
                    provider: 'claude',
                    floors: {
                        'test-writer': 'sonnet',
                        implementer: 'haiku',
                        learner: 'opus',
                    },
                    effort: {
                        'test-writer': 'high',
                        implementer: 'low',
                        learner: 'medium',
                    },
                    confidence_bar: 0.7,
                    trial_share: 0.25,
                },
            },
        })
        const runs_dir = join(root, 'runs')
        const recorder = recordingBoard()
        const fake = fakeClaudeLauncher({
            turns: [...HAPPY_TURNS, VALID_STORY_TURN(10)],
        })
        const factoryProviders: ProviderId[] = []
        const launcher: RunLauncherSource = ({ provider }) => {
            factoryProviders.push(provider)
            return fake.launcher
        }
        const claudeUsage = highClaudeUsage()

        const end = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'agy-fresh-1',
            base_branch: null,
            runs_dir,
            tracker: practiceTracker(),
            launcher,
            provider: 'agy',
            usage: claudeUsage.usage,
            board: recorder.board,
            log: () => {},
        })

        expect(end).toEqual({
            ok: true,
            message: expect.stringContaining('PR opened'),
        })
        expect(factoryProviders).toEqual(['agy'])
        expect(fake.closed()).toBe(1)
        expect(claudeUsage.calls()).toBe(0)

        const records = recordsOf({ runs_dir, run_id: 'agy-fresh-1' })
        const started = runStartedRecord(records)
        expect(started?.content.config.models).toEqual({
            provider: 'agy',
            floors: {
                'test-writer': 'gemini-4-argon-high',
                implementer: 'gemini-3.8-flash-high',
                learner: 'gemini-4-neon-high',
            },
            effort: {
                'test-writer': 'high',
                implementer: 'low',
                learner: 'medium',
            },
            confidence_bar: 0.7,
            trial_share: 0.25,
        })
        expect(
            records.some((record) => record.kind === 'usage_line_wait_started')
        ).toBe(false)
        expect(
            fake
                .launches()
                .some(
                    ({ model }) => model !== null && model.startsWith('gemini-')
                )
        ).toBe(true)
    }, 120_000)

    test('resumeRun & runSpec resume read journaled provider agy even when .luca/config.json specifies claude', async () => {
        const root = makeRoot()
        const { repo } = await makePracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                models: { provider: 'claude' },
            },
        })
        const runs_dir = join(root, 'runs')
        const tracker = practiceTracker()
        const [testWriter, implementer, ...rest] = HAPPY_TURNS
        const crashFake = fakeClaudeLauncher({ turns: HAPPY_TURNS })

        const crashed = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'agy-resume-1',
            base_branch: null,
            runs_dir,
            tracker,
            launcher: ({ provider }) => {
                expect(provider).toBe('agy')
                return crashingOnImplementer({ launcher: crashFake.launcher })
            },
            provider: 'agy',
            board: null,
            log: () => {},
        })
        expect(crashed.ok).toBe(false)
        expect(testWriter?.role).toBe('test-writer')
        expect(implementer?.role).toBe('implementer')

        const resumedProviders: ProviderId[] = []
        const resumeFake = fakeClaudeLauncher({
            turns: [
                ...[implementer, ...rest].flatMap((turn) =>
                    turn === undefined ? [] : [turn]
                ),
                VALID_STORY_TURN(10),
            ],
        })
        const claudeUsage = highClaudeUsage()

        const resumedEnd = await resumeRun({
            run_id: 'agy-resume-1',
            runs_dir,
            repo: null,
            tracker: () => tracker,
            launcher: ({ provider }) => {
                resumedProviders.push(provider)
                return resumeFake.launcher
            },
            usage: claudeUsage.usage,
            board: null,
            log: () => {},
        })

        expect(resumedEnd).toEqual({
            ok: true,
            message: expect.stringContaining('PR opened'),
        })
        expect(resumedProviders).toEqual(['agy'])
        expect(resumeFake.closed()).toBe(1)
        expect(claudeUsage.calls()).toBe(0)

        const records = recordsOf({ runs_dir, run_id: 'agy-resume-1' })
        expect(
            records.some((record) => record.kind === 'config_reload_refused')
        ).toBe(false)
        expect(
            records.some((record) => record.kind === 'usage_line_wait_started')
        ).toBe(false)
    }, 120_000)

    test('runSpec fresh with omitted provider reads models.provider from .luca/config.json', async () => {
        const root = makeRoot()
        const { repo } = await makePracticeRepo({
            root,
            config: makeAgyConfig({ provider: 'agy' }),
        })
        const runs_dir = join(root, 'runs')
        const fake = fakeClaudeLauncher({
            turns: [...HAPPY_TURNS, VALID_STORY_TURN(10)],
        })
        const seenProviders: ProviderId[] = []

        const end = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'agy-from-cfg',
            base_branch: null,
            runs_dir,
            tracker: practiceTracker(),
            launcher: ({ provider }) => {
                seenProviders.push(provider)
                return fake.launcher
            },
            board: null,
            log: () => {},
        })

        expect(end.ok).toBe(true)
        expect(seenProviders).toEqual(['agy'])
        expect(fake.closed()).toBe(1)
    }, 120_000)
})

describe('F13: runSpec & resumeRun factory narrowing & backward compat — Tier 2 negatives', () => {
    test('runSpec with bad .luca/config.json and factory launcher does not invoke factory or throw on closeAll', async () => {
        const root = makeRoot()
        const recorder = recordingBoard()
        let factoryCalls = 0
        const factory: RunLauncherSource = () => {
            factoryCalls += 1
            throw new Error('factory must not be called on bad config')
        }

        const end = await runSpec({
            spec_number: 10,
            repo: root,
            run_id: 'bad-cfg-factory',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker(),
            launcher: factory,
            provider: 'agy',
            board: recorder.board,
            log: () => {},
        })

        expect(end.ok).toBe(false)
        expect(end.message).toContain('No engine config found')
        expect(factoryCalls).toBe(0)
        expect(recorder.endings()).toEqual([end])
    })

    test('resumeRun with missing or empty journal and factory launcher does not invoke factory or closeAll', async () => {
        const root = makeRoot()
        const runs_dir = join(root, 'runs')
        const recorder = recordingBoard()
        let factoryCalls = 0
        const factory: RunLauncherSource = () => {
            factoryCalls += 1
            throw new Error('factory must not be called on missing/empty run')
        }

        const missing = await resumeRun({
            run_id: 'missing-run',
            runs_dir,
            repo: null,
            tracker: () => practiceTracker(),
            launcher: factory,
            board: recorder.board,
            log: () => {},
        })
        expect(missing.ok).toBe(false)
        expect(missing.message).toContain('No run missing-run')

        const emptyFile = join(runs_dir, 'empty-run', 'journal.jsonl')
        mkdirSync(join(runs_dir, 'empty-run'), { recursive: true })
        await writeFile(emptyFile, '')

        const empty = await resumeRun({
            run_id: 'empty-run',
            runs_dir,
            repo: null,
            tracker: () => practiceTracker(),
            launcher: factory,
            board: recorder.board,
            log: () => {},
        })
        expect(empty.ok).toBe(false)
        expect(empty.message).toContain('empty')
        expect(factoryCalls).toBe(0)
        expect(recorder.endings()).toEqual([missing, empty])
    })

    test('pre-built RunLauncher object still works across runSpec bad-config, happy fresh run, and resumeRun error paths', async () => {
        const root = makeRoot()
        const runs_dir = join(root, 'runs')

        const badConfigLauncher = fakeClaudeLauncher({ turns: [] })
        const badConfigEnd = await runSpec({
            spec_number: 10,
            repo: root,
            run_id: 'prebuilt-bad',
            base_branch: null,
            runs_dir,
            tracker: practiceTracker(),
            launcher: badConfigLauncher.launcher,
            provider: 'agy',
            board: null,
            log: () => {},
        })
        expect(badConfigEnd.ok).toBe(false)
        expect(badConfigLauncher.closed()).toBe(1)

        const missingResumeLauncher = fakeClaudeLauncher({ turns: [] })
        const missingResumeEnd = await resumeRun({
            run_id: 'prebuilt-missing',
            runs_dir,
            repo: null,
            tracker: () => practiceTracker(),
            launcher: missingResumeLauncher.launcher,
            board: null,
            log: () => {},
        })
        expect(missingResumeEnd.ok).toBe(false)
        expect(missingResumeLauncher.closed()).toBe(1)

        const repoRoot = makeRoot()
        const { repo } = await makePracticeRepo({
            root: repoRoot,
            config: PRACTICE_ENGINE_CONFIG,
        })
        const happyLauncher = fakeClaudeLauncher({
            turns: [...HAPPY_TURNS, VALID_STORY_TURN(10)],
        })
        const happyEnd = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'prebuilt-happy',
            base_branch: null,
            runs_dir: join(repoRoot, 'runs'),
            tracker: practiceTracker(),
            launcher: happyLauncher.launcher,
            provider: 'agy',
            board: null,
            log: () => {},
        })
        expect(happyEnd.ok).toBe(true)
        expect(happyLauncher.closed()).toBe(1)
    }, 120_000)
})
