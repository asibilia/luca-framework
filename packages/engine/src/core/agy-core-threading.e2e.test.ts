import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { followUpAgent, followUpModel } from './agent-turn'
import { buildContext } from './build-context'
import { executeFinalReviewAction } from './execute-final-review'
import { executeStoryAction } from './execute-story'

import {
    createScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import type { EngineConfig } from '../config/engine-config'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal } from '../journal/journal'
import type { JournalEntry } from '../journal/journal-record'
import { storyAnswer } from '../story/testing/story-fixtures'
import {
    cleanupDir,
    createTempRoot,
    makeAgyConfig,
} from '../testing/agy-e2e-helpers'
import { finalReviewStarted } from '../testing/final-review-fixtures'
import { recordsFrom, specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    APPROVE,
    IMPLEMENTER_RESULT,
    PRACTICE_ENGINE_CONFIG,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'
import { practiceTicket, pullRequestOpened } from '../testing/run-fixtures'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * E2E contract tests for Spec #777 Feature F5:
 * Core launch & follow-up provider threading (`agent-turn`,
 * `execute-final-review`, `execute-story`).
 */

const startedEntry = ({
    ticket,
    role,
    model,
    model_reason = 'decision_model',
    effort = 'medium',
    trial_group = null,
    follow_up_of = null,
}: {
    ticket: number | null
    role: JournalEntry extends infer E
        ? E extends { kind: 'agent_started'; content: { role: infer R } }
            ? R
            : never
        : never
    model: string | null
    model_reason?:
        | 'locked'
        | 'after_failure'
        | 'floor'
        | 'no_answer'
        | 'unsure'
        | 'decision_model'
        | 'trial'
        | null
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
    trial_group?: 'trial' | 'control' | null
    follow_up_of?: string | null
}): JournalEntry => ({
    kind: 'agent_started',
    ticket,
    role,
    content: {
        role,
        prompt: 'p',
        follow_up_of,
        model,
        model_reason,
        effort,
        trial_group,
    },
})

describe('F5: Core launch & follow-up provider threading — Tier 1 & Tier 2', () => {
    let root = ''
    let repoDir = ''
    let runCounter = 0

    beforeAll(async () => {
        root = createTempRoot({ prefix: 'luca-agy-f5-' })
        repoDir = join(root, 'repo')
        await mkdir(repoDir, { recursive: true })
        await $`git init -b main`.cwd(repoDir).quiet()
        await $`git config user.email test@example.com`.cwd(repoDir).quiet()
        await $`git config user.name Test`.cwd(repoDir).quiet()
        await writeFile(join(repoDir, 'sum.ts'), 'export const x = 1\n')
        await $`git add . && git commit -m init`.cwd(repoDir).quiet()
        await $`git update-ref refs/remotes/origin/main HEAD`
            .cwd(repoDir)
            .quiet()
    })

    afterAll(() => {
        cleanupDir({ dir: root })
    })

    const makeCoreContext = ({
        config,
        entries = [],
        turns = [],
    }: {
        config: EngineConfig
        entries?: JournalEntry[]
        turns?: ScriptedTurn[]
    }) => {
        runCounter += 1
        const runDir = join(root, `run-${runCounter}`)
        const journal = createJournal({ file: join(runDir, 'journal.jsonl') })
        const seed: JournalEntry[] = [
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
                    spec: {
                        number: 10,
                        title: 'Spec',
                        body: 'Body',
                        labels: ['ready-for-agent'],
                        url: 'https://github.com/acme/app/issues/10',
                        author: 'spec-owner',
                    },
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
                content: {
                    branch: 'main',
                    path: repoDir,
                    base_sha: 'b0',
                },
            },
            {
                kind: 'ticket_worktree_created',
                ticket: 11,
                role: null,
                content: {
                    branch: 'main',
                    path: repoDir,
                    base_sha: 'b0',
                },
            },
            ...entries,
        ]
        for (const entry of seed) journal.append(entry)
        const tracker = createInMemoryTracker({
            issues: [specIssue({ number: 10 }), ticketIssue({ number: 11 })],
            sub_tickets: { 10: [11] },
        })
        const launcher = createScriptedLauncher({ turns })
        const context = buildContext({
            journal,
            tracker,
            git: createGitAdapter({ repo_root: repoDir }),
            launcher,
        })
        return { context, journal, launcher }
    }

    test('T1.1: followUpModel with empty records and provider agy falls back to gemini-4-neon-high', () => {
        expect(
            followUpModel({ records: [], session_id: 's1', provider: 'agy' })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: null,
            effort: null,
            trial_group: null,
        })
    })

    test('T1.2: followUpModel finds prior agent_started Gemini model, reason, effort, and trial_group', () => {
        const records = recordsFrom({
            entries: [
                startedEntry({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-argon-high',
                    model_reason: 'decision_model',
                    effort: 'high',
                    trial_group: null,
                }),
                {
                    kind: 'agent_session',
                    ticket: 11,
                    role: 'test-writer',
                    content: {
                        role: 'test-writer',
                        session: { session_id: 'tw-agy-1' },
                    },
                },
            ],
        })

        expect(
            followUpModel({ records, session_id: 'tw-agy-1', provider: 'agy' })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'decision_model',
            effort: 'high',
            trial_group: null,
        })
    })

    test('T1.3: executeFinalReviewAction launch_lens on agy config journals and launches gemini-4-neon-high', async () => {
        const { context, journal, launcher } = makeCoreContext({
            config: makeAgyConfig({ provider: 'agy' }),
            entries: [finalReviewStarted({ round: 1 })],
            turns: [{ role: 'security-lens', ticket: 10, result: APPROVE }],
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

        const started = journal
            .read()
            .findLast((r) => r.kind === 'agent_started')
        expect(started?.kind === 'agent_started' && started.content.model).toBe(
            'gemini-4-neon-high'
        )
        expect(
            started?.kind === 'agent_started' && started.content.model_reason
        ).toBe('locked')
        expect(launcher.launches()[0]?.model).toBe('gemini-4-neon-high')
    })

    test('T1.4: executeFinalReviewAction launch_final_fixer and follow_up_final_fixer thread agy provider', async () => {
        const { context, journal, launcher } = makeCoreContext({
            config: makeAgyConfig({ provider: 'agy' }),
            turns: [
                {
                    role: 'implementer',
                    ticket: 10,
                    result: IMPLEMENTER_RESULT,
                },
            ],
        })

        await executeFinalReviewAction({
            action: {
                type: 'launch_final_fixer',
                role: 'implementer',
                prompt: 'fix',
                may_edit_tests: false,
            },
            context,
        })
        await executeFinalReviewAction({
            action: {
                type: 'follow_up_final_fixer',
                role: 'implementer',
                session_id: 'missing-fixer-session',
                message: 'fix lint',
            },
            context,
        })

        const starts = journal
            .read()
            .filter((r) => r.kind === 'agent_started')
            .map((r) =>
                r.kind === 'agent_started'
                    ? {
                          model: r.content.model,
                          reason: r.content.model_reason,
                          follow_up_of: r.content.follow_up_of,
                      }
                    : null
            )
        expect(starts).toEqual([
            {
                model: 'gemini-4-neon-high',
                reason: 'locked',
                follow_up_of: null,
            },
            {
                model: 'gemini-4-neon-high',
                reason: null,
                follow_up_of: 'missing-fixer-session',
            },
        ])
        expect(launcher.launches()[0]?.model).toBe('gemini-4-neon-high')
    })

    test('T1.5: executeStoryAction launch_story_writer fresh and follow-up thread agy provider', async () => {
        const { context, journal, launcher } = makeCoreContext({
            config: makeAgyConfig({ provider: 'agy' }),
            entries: [pullRequestOpened()],
            turns: [
                {
                    role: 'story-writer',
                    ticket: 10,
                    result: storyAnswer(),
                },
            ],
        })

        await executeStoryAction({
            action: { type: 'launch_story_writer', problems: null },
            context,
        })
        await executeStoryAction({
            action: {
                type: 'launch_story_writer',
                session_id: 'missing-story-session',
                message: 'fix story',
            },
            context,
        })

        const starts = journal
            .read()
            .filter((r) => r.kind === 'agent_started')
            .map((r) =>
                r.kind === 'agent_started'
                    ? {
                          model: r.content.model,
                          reason: r.content.model_reason,
                          follow_up_of: r.content.follow_up_of,
                      }
                    : null
            )
        expect(starts).toEqual([
            {
                model: 'gemini-4-neon-high',
                reason: 'locked',
                follow_up_of: null,
            },
            {
                model: 'gemini-4-neon-high',
                reason: null,
                follow_up_of: 'missing-story-session',
            },
        ])
        expect(launcher.launches()[0]?.model).toBe('gemini-4-neon-high')
    })

    test('T1.6: followUpAgent on agy config falls back to gemini-4-neon-high when session has no prior start', async () => {
        const { context, journal } = makeCoreContext({
            config: makeAgyConfig({ provider: 'agy' }),
        })

        await followUpAgent({
            context,
            action: {
                type: 'follow_up_agent',
                ticket: 11,
                role: 'test-writer',
                session_id: 'unknown-session',
                message: 'retry',
            },
        })

        const started = journal
            .read()
            .findLast((r) => r.kind === 'agent_started')
        expect(started?.kind === 'agent_started' && started.content.model).toBe(
            'gemini-4-neon-high'
        )
    })

    test('T2.1: followUpModel with omitted provider defaults to claude opus fallback', () => {
        expect(followUpModel({ records: [], session_id: 'missing' })).toEqual({
            model: 'opus',
            model_reason: null,
            effort: null,
            trial_group: null,
        })
    })

    test('T2.2: followUpModel falls back to provider strongest when prior agent_started has model null', () => {
        const records = recordsFrom({
            entries: [
                startedEntry({
                    ticket: 11,
                    role: 'implementer',
                    model: null,
                    model_reason: null,
                    effort: null,
                }),
                {
                    kind: 'agent_session',
                    ticket: 11,
                    role: 'implementer',
                    content: {
                        role: 'implementer',
                        session: { session_id: 'legacy-1' },
                    },
                },
            ],
        })

        expect(
            followUpModel({ records, session_id: 'legacy-1', provider: 'agy' })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: null,
            effort: null,
            trial_group: null,
        })
    })

    test('T2.3: followUpAgent preserves decision-model gemini-4-argon-high across follow-ups', async () => {
        const { context, journal } = makeCoreContext({
            config: makeAgyConfig({
                provider: 'agy',
                floors: { 'test-writer': 'gemini-4-argon-high' },
            }),
            entries: [
                startedEntry({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-argon-high',
                    model_reason: 'decision_model',
                    effort: 'high',
                }),
                {
                    kind: 'agent_session',
                    ticket: 11,
                    role: 'test-writer',
                    content: {
                        role: 'test-writer',
                        session: { session_id: 'tw-1' },
                    },
                },
            ],
            turns: [
                { role: 'test-writer', ticket: 11, result: TEST_WRITER_RESULT },
            ],
        })

        await followUpAgent({
            context,
            action: {
                type: 'follow_up_agent',
                ticket: 11,
                role: 'test-writer',
                session_id: 'tw-1',
                message: 'fix red check',
            },
        })

        const followStart = journal
            .read()
            .findLast((r) => r.kind === 'agent_started')
        expect(
            followStart?.kind === 'agent_started' && followStart.content
        ).toMatchObject({
            follow_up_of: 'tw-1',
            model: 'gemini-4-argon-high',
            model_reason: 'decision_model',
            effort: 'high',
        })
    })

    test('T2.4: followUpModel prefers an earlier follow_up_of record over the initial launch record', () => {
        const records = recordsFrom({
            entries: [
                startedEntry({
                    ticket: 11,
                    role: 'implementer',
                    model: 'gemini-4-argon-high',
                    model_reason: 'decision_model',
                    effort: 'medium',
                }),
                {
                    kind: 'agent_session',
                    ticket: 11,
                    role: 'implementer',
                    content: {
                        role: 'implementer',
                        session: { session_id: 'impl-s1' },
                    },
                },
                startedEntry({
                    ticket: 11,
                    role: 'implementer',
                    model: 'gemini-3.8-flash-high',
                    model_reason: 'trial',
                    effort: 'high',
                    trial_group: 'trial',
                    follow_up_of: 'impl-s1',
                }),
            ],
        })

        expect(
            followUpModel({ records, session_id: 'impl-s1', provider: 'agy' })
        ).toEqual({
            model: 'gemini-3.8-flash-high',
            model_reason: 'trial',
            effort: 'high',
            trial_group: 'trial',
        })
    })

    test('T2.5: executeFinalReviewAction and executeStoryAction on claude config keep opus locked', async () => {
        const config = makeAgyConfig({ provider: 'claude' })
        const { context, launcher } = makeCoreContext({
            config: { ...PRACTICE_ENGINE_CONFIG, models: config.models },
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

        expect(launcher.launches().map((c) => c.model)).toEqual([
            'opus',
            'opus',
        ])
    })
})
