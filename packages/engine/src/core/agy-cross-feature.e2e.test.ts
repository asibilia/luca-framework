import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterEach, describe, expect, test } from 'bun:test'

import { followUpAgent, followUpModel } from './agent-turn'
import { buildContext } from './build-context'
import { recordConfigReload } from './execute'
import { executeFinalReviewAction } from './execute-final-review'
import { executeStoryAction } from './execute-story'

import {
    PROVIDERS,
    mapFloorToProvider,
    providerOf,
    type ProviderId,
} from '../agents/provider'
import {
    createScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import { readRunStart } from '../cli/read-run'
import { runSpec } from '../cli/run-modes'
import { fakeClaudeLauncher, recordsOf } from '../cli/run-modes-helpers'
import { FROZEN_FIELDS, configChanges } from '../config/config-reload'
import {
    EngineConfigSchema,
    ModelsConfigSchema,
    loadEngineConfig,
    modelsOf,
    overrideConfigProvider,
    type EngineConfig,
} from '../config/engine-config'
import { createGitAdapter } from '../git/git-adapter'
import { jevAsksBefore } from '../jev/jev-jobs'
import { launchPick, offeredModels, pickModel } from '../jev/model-pick'
import { createJournal } from '../journal/journal'
import type { JournalEntry } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import { storyAnswer } from '../story/testing/story-fixtures'
import { agentFailed } from '../testing/agent-turn-fixtures'
import { makeAgyConfig } from '../testing/agy-e2e-helpers'
import { finalReviewStarted } from '../testing/final-review-fixtures'
import { recordsFrom, specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    APPROVE,
    HAPPY_TURNS,
    IMPLEMENTER_RESULT,
    VALID_STORY_TURN,
    makePracticeRepo,
    practiceTracker,
} from '../testing/practice-repo'
import {
    practiceTicket,
    pullRequestOpened,
    ticketWorktreeCreated,
    withInstalls,
} from '../testing/run-fixtures'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/** Tier 3 pairwise cross-feature E2E tests for Spec #777 (pairs 1–7). */

const TRIAL_KEY = 'luca-20261028-202119-k6q1:697:test-writer'
const CONTROL_KEY = 'luca-20261028-202119-k6q1:698:implementer'
const roots: string[] = []

afterEach(async () => {
    while (roots.length > 0) {
        const dir = roots.pop()
        if (dir !== undefined) await rm(dir, { recursive: true, force: true })
    }
})

const newRoot = async ({ prefix }: { prefix: string }): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), prefix))
    roots.push(dir)
    return dir
}

const started = ({
    ticket,
    role,
    model,
    effort = 'medium',
}: {
    ticket: number | null
    role: 'test-writer' | 'implementer'
    model: string
    effort?: 'medium' | 'high'
}): JournalEntry => ({
    kind: 'agent_started',
    ticket,
    role,
    content: {
        role,
        prompt: 'p',
        follow_up_of: null,
        model,
        model_reason: 'decision_model',
        effort,
        trial_group: null,
    },
})

const seedEntries = ({
    config,
    repo,
    extra = [],
}: {
    config: EngineConfig
    repo: string
    extra?: JournalEntry[]
}): JournalEntry[] => [
    {
        kind: 'run_started',
        ticket: null,
        role: null,
        content: { spec_number: 10, config, base_branch: 'main' },
    },
    {
        kind: 'spec_snapshot',
        ticket: 10,
        role: null,
        content: {
            spec: specIssue({ number: 10 }),
            ticket_order: [11],
            closed_tickets: [],
        },
    },
    {
        kind: 'ticket_snapshot',
        ticket: 11,
        role: null,
        content: practiceTicket({ number: 11 }),
    },
    {
        kind: 'run_branch_created',
        ticket: null,
        role: null,
        content: { branch: 'main', path: repo, base_sha: 'b0' },
    },
    {
        kind: 'ticket_worktree_created',
        ticket: 11,
        role: null,
        content: { branch: 'main', path: repo, base_sha: 'b0' },
    },
    ...extra,
]

const makeCoreHarness = async ({
    config,
    entries = [],
    turns = [],
}: {
    config: EngineConfig
    entries?: JournalEntry[]
    turns?: ScriptedTurn[]
}) => {
    const root = await newRoot({ prefix: 'luca-agy-t3-core-' })
    const repo = join(root, 'repo')
    await mkdir(repo, { recursive: true })
    await $`git init -b main && git config user.email t@e.com && git config user.name T`
        .cwd(repo)
        .quiet()
    await writeFile(join(repo, 'sum.ts'), 'export const x = 1\n')
    await $`git add . && git commit -m init`.cwd(repo).quiet()
    await $`git update-ref refs/remotes/origin/main HEAD`.cwd(repo).quiet()
    const journal = createJournal({ file: join(root, 'runs/r1/journal.jsonl') })
    for (const e of seedEntries({ config, repo, extra: entries })) {
        journal.append(e)
    }
    const tracker = createInMemoryTracker({
        issues: [specIssue({ number: 10 }), ticketIssue({ number: 11 })],
        sub_tickets: { 10: [11] },
    })
    return {
        journal,
        context: buildContext({
            journal,
            tracker,
            git: createGitAdapter({ repo_root: repo }),
            launcher: createScriptedLauncher({ turns }),
        }),
    }
}

describe('Tier 3 — pairwise config, routing, threading, and replay', () => {
    test('Pair 1 (F1+F2): provider.ts tiers drive ModelsConfigSchema defaults and errors', () => {
        const agy = ModelsConfigSchema.parse({ provider: 'agy' })
        expect(agy.floors).toEqual({
            'test-writer': PROVIDERS.agy.strongest,
            implementer: PROVIDERS.agy.strongest,
            learner: PROVIDERS.agy.strongest,
        })
        const bad = ModelsConfigSchema.safeParse({
            provider: 'agy',
            floors: { implementer: 'sonnet' },
        })
        expect(bad.success).toBe(false)
        if (!bad.success) {
            expect(bad.error.issues[0]?.message).toBe(
                `models.floors.implementer: "sonnet" is not a valid model for provider "agy". Allowed: ${providerOf('agy').tiers.join(', ')}.`
            )
        }
        const badRole = ModelsConfigSchema.safeParse({
            provider: 'agy',
            floors: { 'security-lens': 'gemini-4-neon-high' },
        })
        expect(badRole.success).toBe(false)
        if (!badRole.success) {
            expect(badRole.error.issues[0]?.message).toContain(
                'reviewers always run the strongest model'
            )
        }
    })

    test('Pair 2 (F1+F3): overrideConfigProvider uses mapFloorToProvider and preserves effort', () => {
        const claude = makeAgyConfig({
            provider: 'claude',
            floors: {
                'test-writer': 'opus',
                implementer: 'sonnet',
                learner: 'haiku',
            },
            effort: {
                'test-writer': 'high',
                implementer: 'xhigh',
                learner: 'low',
            },
            confidence_bar: 0.72,
            trial_share: 0.35,
        })
        const snap = structuredClone(claude)
        const agy = overrideConfigProvider({ config: claude, provider: 'agy' })
        expect(claude).toEqual(snap)
        const roles: ('test-writer' | 'implementer' | 'learner')[] = [
            'test-writer',
            'implementer',
            'learner',
        ]
        for (const r of roles) {
            expect(agy.models?.floors?.[r]).toBe(
                mapFloorToProvider({
                    floor: snap.models?.floors?.[r] ?? 'opus',
                    from: 'claude',
                    to: 'agy',
                })
            )
        }
        expect(agy.models?.effort).toEqual(snap.models?.effort)
        expect(agy.models?.confidence_bar).toBe(0.72)
        expect(
            overrideConfigProvider({ config: agy, provider: 'claude' }).models
        ).toEqual(snap.models)
    })

    test('Pair 3 (F2+F4): EngineConfigSchema agy floors drive offeredModels, jevAsksBefore, and pickModel', () => {
        const config = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
            models: {
                provider: 'agy',
                floors: {
                    'test-writer': 'gemini-4-argon-high',
                    learner: 'gemini-3.8-flash-high',
                },
                confidence_bar: 0.6,
                trial_share: 1,
            },
        })
        const models = modelsOf({ config })
        const state = replayRun({
            records: recordsFrom({
                entries: seedEntries({ config, repo: '/tmp/repo' }),
            }),
        })
        const ask = jevAsksBefore({
            action: {
                type: 'launch_agent',
                ticket: 11,
                role: 'test-writer',
                prompt: 'p',
                may_edit_tests: true,
            },
            state,
        }).find((each) => each.job === 'agent_model')
        const offered = offeredModels({
            floor: models.floors['test-writer'],
            provider: 'agy',
        })
        expect(offered).toEqual(['gemini-4-neon-high', 'gemini-4-argon-high'])
        expect(ask?.acted).toBe(true)
        expect(ask?.fixed).toEqual({ model: 'gemini-4-neon-high' })
        expect(
            pickModel({
                role: 'test-writer',
                models,
                failed_cheaper: false,
                answer: {
                    offered,
                    pick: 'gemini-4-argon-high',
                    confidence: 0.85,
                },
                trial_key: TRIAL_KEY,
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'decision_model',
            trial_group: null,
        })
        expect(
            pickModel({
                role: 'learner',
                models,
                failed_cheaper: false,
                answer: {
                    offered: offeredModels({
                        floor: models.floors.learner,
                        provider: 'agy',
                    }),
                    pick: 'sonnet',
                    confidence: 0.99,
                },
                trial_key: CONTROL_KEY,
            })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'unsure',
            trial_group: null,
        })
    })

    test('Pair 4 (F3+F13): runSpec fresh --provider agy overrides config and persists agy tiers', async () => {
        const root = await newRoot({ prefix: 'luca-agy-t3-runspec-' })
        const { repo } = await makePracticeRepo({
            root,
            config: makeAgyConfig({
                provider: 'claude',
                floors: {
                    'test-writer': 'sonnet',
                    implementer: 'haiku',
                    learner: 'opus',
                },
            }),
        })
        const runs_dir = join(root, 'runs')
        const seen: ProviderId[] = []
        const claude = fakeClaudeLauncher({
            turns: [...HAPPY_TURNS, VALID_STORY_TURN(10)],
        })
        const end = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'fresh-agy',
            base_branch: 'main',
            runs_dir,
            tracker: practiceTracker(),
            launcher: ({ provider }) => {
                seen.push(provider)
                return claude.launcher
            },
            provider: 'agy',
            board: null,
            log: () => undefined,
        })
        expect(end.ok).toBe(true)
        expect(seen).toEqual(['agy'])
        const start = readRunStart({ runs_dir, run_id: 'fresh-agy' })
        expect(start.ok && start.start.provider).toBe('agy')
        const first = recordsOf({ runs_dir, run_id: 'fresh-agy' })[0]
        if (first?.kind === 'run_started') {
            expect(first.content.config.models?.floors).toEqual({
                'test-writer': 'gemini-4-argon-high',
                implementer: 'gemini-3.8-flash-high',
                learner: 'gemini-4-neon-high',
            })
        }
    }, 120_000)

    test('Pair 5 (F3+F6): FROZEN_FIELDS models keeps agy across reload so ranCheaper escalates', async () => {
        const root = await newRoot({ prefix: 'luca-agy-t3-frozen-' })
        const { repo } = await makePracticeRepo({
            root,
            config: makeAgyConfig({
                provider: 'claude',
                floors: { 'test-writer': 'sonnet' },
            }),
        })
        const loaded = await loadEngineConfig({ repo_root: repo })
        if (!loaded.ok) throw new Error(loaded.error)
        const cfg = overrideConfigProvider({
            config: loaded.config,
            provider: 'agy',
        })
        expect(FROZEN_FIELDS).toContain('models')
        expect(configChanges({ current: cfg, next: loaded.config })).toEqual([])
        const journal = createJournal({
            file: join(root, 'runs/r-frozen/journal.jsonl'),
        })
        const entries = seedEntries({
            config: cfg,
            repo,
            extra: [
                ...withInstalls({
                    entries: [ticketWorktreeCreated({ ticket: 11 })],
                }),
                started({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-argon-high',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'agent',
                }),
            ],
        })
        for (const e of entries) journal.append(e)
        recordConfigReload({ journal, loaded })
        const records = journal.read()
        const state = replayRun({ records })
        expect(state.config?.models?.provider).toBe('agy')
        expect(state.tickets[11]?.failed_cheaper).toEqual(['test-writer'])
        expect(
            launchPick({
                records,
                state,
                config: state.config ?? cfg,
                run_id: 'r-frozen',
                ticket: 11,
                role: 'test-writer',
                step: { first_seq: 12, redo: false },
            })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'after_failure',
            trial_group: null,
        })
    })

    test('Pair 6 (F4+F5): pickModel gemini-4-argon-high is preserved by followUpModel and followUpAgent', async () => {
        const config = makeAgyConfig({
            provider: 'agy',
            floors: { implementer: 'gemini-4-argon-high' },
            effort: { implementer: 'high' },
        })
        const picked = pickModel({
            role: 'implementer',
            models: modelsOf({ config }),
            failed_cheaper: false,
            answer: {
                offered: ['gemini-4-neon-high', 'gemini-4-argon-high'],
                pick: 'gemini-4-argon-high',
                confidence: 0.91,
            },
            trial_key: TRIAL_KEY,
        })
        const { context, journal } = await makeCoreHarness({
            config,
            entries: [
                started({
                    ticket: 11,
                    role: 'implementer',
                    model: picked.model,
                    effort: 'high',
                }),
                {
                    kind: 'agent_session',
                    ticket: 11,
                    role: 'implementer',
                    content: {
                        role: 'implementer',
                        session: { session_id: 'impl-agy-1' },
                    },
                },
            ],
            turns: [
                { role: 'implementer', ticket: 11, result: IMPLEMENTER_RESULT },
            ],
        })
        expect(
            followUpModel({
                records: journal.read(),
                session_id: 'impl-agy-1',
                provider: 'agy',
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'decision_model',
            effort: 'high',
            trial_group: null,
        })
        for (const [session_id, message] of [
            ['impl-agy-1', 'fix'],
            ['missing-agy', 'retry'],
        ] as const) {
            await followUpAgent({
                context,
                action: {
                    type: 'follow_up_agent',
                    ticket: 11,
                    role: 'implementer',
                    session_id,
                    message,
                },
            })
        }
        const followUps = journal
            .read()
            .filter(
                (r) =>
                    r.kind === 'agent_started' &&
                    r.content.follow_up_of !== null
            )
            .map((r) =>
                r.kind === 'agent_started'
                    ? [r.content.follow_up_of, r.content.model]
                    : []
            )
        expect(followUps).toEqual([
            ['impl-agy-1', 'gemini-4-argon-high'],
            ['missing-agy', 'gemini-4-neon-high'],
        ])
    })

    test('Pair 7 (F5+F6): final-review/story lock gemini-4-neon-high while replayRun escalates cheaper failures', async () => {
        const config = makeAgyConfig({
            provider: 'agy',
            floors: { implementer: 'gemini-4-argon-high' },
        })
        const { context, journal } = await makeCoreHarness({
            config,
            entries: [finalReviewStarted({ round: 1 }), pullRequestOpened()],
            turns: [
                { role: 'security-lens', ticket: 10, result: APPROVE },
                { role: 'story-writer', ticket: 10, result: storyAnswer() },
            ],
        })
        await executeFinalReviewAction({
            action: {
                type: 'launch_lens',
                lens: 'security',
                role: 'security-lens',
                prompt: 'review',
            },
            context,
        })
        await executeStoryAction({
            action: { type: 'launch_story_writer', problems: null },
            context,
        })
        journal.append(
            started({
                ticket: 11,
                role: 'implementer',
                model: 'gemini-4-argon-high',
            })
        )
        journal.append(
            agentFailed({ ticket: 11, role: 'implementer', failure: 'agent' })
        )
        const replayed = replayRun({ records: journal.read() })
        expect(replayed.tickets[11]?.failed_cheaper).toEqual(['implementer'])
        expect(
            launchPick({
                records: journal.read(),
                state: replayed,
                config,
                run_id: 'r1',
                ticket: 11,
                role: 'implementer',
                step: { first_seq: 12, redo: false },
            })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'after_failure',
            trial_group: null,
        })
    })
})
