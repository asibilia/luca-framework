import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { readRunStart, resumeRun, runSpec, type RunLauncher } from './run-modes'

import type { ProviderId } from '../agents/provider'
import { createScriptedLauncher } from '../agents/scripted-launcher'
import { startRun } from '../core/execute'
import { createJournal, runJournalPath } from '../journal/journal'
import type { UsageLineDeps } from '../limits/usage-line'
import { specIssue } from '../testing/intake-fixtures'
import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

let root = ''
const log = () => undefined

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-run-modes-provider-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const makeRecordingLauncher = () => {
    const scripted = createScriptedLauncher({ turns: [] })
    let closed = 0
    const launcher: RunLauncher = {
        launch: scripted.launch,
        followUp: scripted.followUp,
        closeSession: scripted.closeSession,
        closeAll: async () => {
            closed += 1
        },
    }
    return { launcher, closed: () => closed }
}

const makeFactory = () => {
    const requested: ProviderId[] = []
    const recorded = makeRecordingLauncher()
    const factory = ({ provider }: { provider: ProviderId }): RunLauncher => {
        requested.push(provider)
        return recorded.launcher
    }
    return { factory, requested, closed: recorded.closed }
}

const makeUsageSpy = () => {
    const calls: string[] = []
    const usage: UsageLineDeps = {
        read_lines: async () => {
            calls.push('read_lines')
            return { weekly_line: 80, five_hour_line: 85 }
        },
        read_shared: async () => {
            calls.push('read_shared')
            return []
        },
        share: async () => {
            calls.push('share')
        },
    }
    return { usage, calls }
}

const emptySpecTracker = () =>
    createInMemoryTracker({
        issues: [specIssue({ number: 10, title: 'Empty spec' })],
        sub_tickets: {},
    })

describe('readRunStart provider', () => {
    test('reads provider from run_started config and defaults older journals to claude', () => {
        const runs_dir = join(root, 'runs')

        const agyJournal = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'agy-run' }),
        })
        startRun({
            journal: agyJournal,
            spec_number: 10,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                models: {
                    provider: 'agy',
                    floors: {
                        'test-writer': 'gemini-4-neon-high',
                        implementer: 'gemini-4-argon-high',
                        learner: 'gemini-3.8-flash-high',
                    },
                    effort: {
                        'test-writer': 'medium',
                        implementer: 'medium',
                        learner: 'medium',
                    },
                    confidence_bar: 0.5,
                    trial_share: 0,
                },
            },
            repo: '/code/app',
        })

        const legacyJournal = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'legacy-run' }),
        })
        startRun({
            journal: legacyJournal,
            spec_number: 10,
            config: PRACTICE_ENGINE_CONFIG,
            repo: '/code/app',
        })

        expect(readRunStart({ runs_dir, run_id: 'agy-run' })).toMatchObject({
            ok: true,
            start: { provider: 'agy' },
        })
        expect(readRunStart({ runs_dir, run_id: 'legacy-run' })).toMatchObject({
            ok: true,
            start: { provider: 'claude' },
        })
    })
})

describe('runSpec and resumeRun provider launcher & usage isolation', () => {
    test('narrows factory functions out of closeAll on early stop in runSpec and resumeRun', async () => {
        const specFactory = makeFactory()
        const specEnd = await runSpec({
            spec_number: 10,
            repo: root,
            run_id: 'bad-config',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: emptySpecTracker(),
            launcher: specFactory.factory,
            provider: 'agy',
            board: null,
            log,
        })

        expect(specEnd.ok).toBe(false)
        expect(specFactory.requested).toEqual([])
        expect(specFactory.closed()).toBe(0)

        const resumeFactory = makeFactory()
        const resumeEnd = await resumeRun({
            run_id: 'missing-run',
            runs_dir: join(root, 'runs'),
            repo: null,
            tracker: emptySpecTracker,
            launcher: resumeFactory.factory,
            board: null,
            log,
        })

        expect(resumeEnd.ok).toBe(false)
        expect(resumeFactory.requested).toEqual([])
        expect(resumeFactory.closed()).toBe(0)
    })

    test('runSpec applies overrideConfigProvider before startRun, resolves launcher factory, and omits usage for agy', async () => {
        const repo = join(root, 'repo')
        const runs_dir = join(root, 'runs')
        await Bun.write(
            join(repo, '.luca', 'config.json'),
            JSON.stringify({
                ...PRACTICE_ENGINE_CONFIG,
                models: {
                    provider: 'claude',
                    floors: {
                        'test-writer': 'sonnet',
                        implementer: 'haiku',
                        learner: 'opus',
                    },
                },
            })
        )
        const factory = makeFactory()
        const usageSpy = makeUsageSpy()

        const end = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'agy-fresh',
            base_branch: null,
            runs_dir,
            tracker: emptySpecTracker(),
            launcher: factory.factory,
            provider: 'agy',
            usage: usageSpy.usage,
            board: null,
            log,
        })

        expect(end.ok).toBe(true)
        expect(factory.requested).toEqual(['agy'])
        expect(factory.closed()).toBe(1)
        expect(usageSpy.calls).toEqual([])
        const started = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'agy-fresh' }),
        }).read()[0]
        expect(started?.kind).toBe('run_started')
        if (started?.kind === 'run_started') {
            expect(started.content.config.models?.provider).toBe('agy')
            expect(started.content.config.models?.floors).toEqual({
                'test-writer': 'gemini-4-argon-high',
                implementer: 'gemini-3.8-flash-high',
                learner: 'gemini-4-neon-high',
            })
        }
    })

    test('resumeRun resolves launcher factory from journaled run_started provider and omits usage for agy even if repo config says claude', async () => {
        const repo = join(root, 'repo')
        const runs_dir = join(root, 'runs')
        await Bun.write(
            join(repo, '.luca', 'config.json'),
            JSON.stringify({
                ...PRACTICE_ENGINE_CONFIG,
                models: { provider: 'claude' },
            })
        )
        const journal = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'agy-resume' }),
        })
        startRun({
            journal,
            spec_number: 10,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                models: {
                    provider: 'agy',
                    floors: {
                        'test-writer': 'gemini-4-neon-high',
                        implementer: 'gemini-4-argon-high',
                        learner: 'gemini-3.8-flash-high',
                    },
                    effort: {
                        'test-writer': 'medium',
                        implementer: 'medium',
                        learner: 'medium',
                    },
                    confidence_bar: 0.5,
                    trial_share: 0,
                },
            },
            repo,
        })
        const factory = makeFactory()
        const usageSpy = makeUsageSpy()

        const end = await resumeRun({
            run_id: 'agy-resume',
            runs_dir,
            repo: null,
            tracker: emptySpecTracker,
            launcher: factory.factory,
            usage: usageSpy.usage,
            board: null,
            log,
        })

        expect(end.ok).toBe(true)
        expect(factory.requested).toEqual(['agy'])
        expect(factory.closed()).toBe(1)
        expect(usageSpy.calls).toEqual([])
    })
})
