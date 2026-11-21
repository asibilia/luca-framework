import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { followUpAgent, followUpModel, launchAgent } from './agent-turn'
import type { BuildContext } from './build-context'

import {
    createScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import { EngineConfigSchema } from '../config/engine-config'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal } from '../journal/journal'
import {
    JournalRecordSchema,
    type JournalEntry,
    type JournalRecord,
} from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import { intakePassed, practiceTicket } from '../testing/build-fixtures'
import { git, PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Provider-aware follow-up model lookups (#778 AC7): `followUpModel` and
 * `followUpAgent` fall back to the active provider's strongest model when no
 * prior `agent_started.content.model` is present, and preserve recorded models.
 */

const stamp = (entries: JournalEntry[]): JournalRecord[] =>
    entries.map((entry, index) =>
        JournalRecordSchema.parse({
            ...entry,
            seq: index + 1,
            time: new Date(0).toISOString(),
        })
    )

describe('followUpModel (#778 AC7)', () => {
    test('falls back to opus by default and gemini-4-neon-high under agy when no prior model exists', () => {
        const legacy = stamp([
            {
                kind: 'agent_started',
                ticket: 11,
                role: 'implementer',
                content: {
                    role: 'implementer',
                    prompt: 'Implement it.',
                    follow_up_of: null,
                },
            },
            {
                kind: 'agent_failed',
                ticket: 11,
                role: 'implementer',
                content: {
                    role: 'implementer',
                    failure: 'agent',
                    error: 'Gates failed.',
                    session_id: 'impl-legacy',
                },
            },
        ])

        expect(
            followUpModel({ records: legacy, session_id: 'impl-legacy' })
        ).toEqual({
            model: 'opus',
            model_reason: null,
            effort: null,
            trial_group: null,
        })
        expect(
            followUpModel({
                records: legacy,
                session_id: 'impl-legacy',
                provider: 'agy',
            })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: null,
            effort: null,
            trial_group: null,
        })
    })

    test('preserves the recorded prior agent_started model under agy', () => {
        const records = stamp([
            {
                kind: 'agent_started',
                ticket: 11,
                role: 'implementer',
                content: {
                    role: 'implementer',
                    prompt: 'Implement it.',
                    follow_up_of: null,
                    model: 'gemini-4-argon-high',
                    model_reason: 'decision_model',
                    effort: 'medium',
                    trial_group: null,
                },
            },
            {
                kind: 'agent_failed',
                ticket: 11,
                role: 'implementer',
                content: {
                    role: 'implementer',
                    failure: 'agent',
                    error: 'Gates failed.',
                    session_id: 'impl-agy',
                },
            },
        ])

        expect(
            followUpModel({
                records,
                session_id: 'impl-agy',
                provider: 'agy',
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'decision_model',
            effort: 'medium',
            trial_group: null,
        })
    })
})

describe('followUpAgent under agy (#778 AC7)', () => {
    let root = ''
    let repo = ''

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-agent-turn-provider-'))
        repo = join(root, 'repo')
        await mkdir(join(repo, 'src'), { recursive: true })
        await git(repo, 'init', '-q', '-b', 'main')
        await git(repo, 'config', 'user.email', 'luca@example.com')
        await git(repo, 'config', 'user.name', 'Luca')
        await Bun.write(join(repo, 'src', 'index.ts'), 'export {}\n')
        await git(repo, 'add', '-A')
        await git(repo, 'commit', '-q', '-m', 'first')
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('journals gemini-4-neon-high on fallback when prior agent_started had model null', async () => {
        const journal = createJournal({ file: join(root, 'journal.jsonl') })
        const config = EngineConfigSchema.parse({
            ...PRACTICE_ENGINE_CONFIG,
            models: { provider: 'agy' },
        })
        for (const entry of intakePassed({
            tickets: [practiceTicket({ number: 11 })],
        })) {
            journal.append(entry)
        }
        journal.append({
            kind: 'ticket_worktree_created',
            ticket: 11,
            role: null,
            content: {
                branch: 'luca/ticket-11',
                path: repo,
                base_sha: (await git(repo, 'rev-parse', 'HEAD')).trim(),
            },
        })
        const launcher = createScriptedLauncher({
            turns: [
                {
                    role: 'implementer',
                    ticket: 11,
                    failure: 'agent',
                    error: 'Needs follow-up.',
                } satisfies ScriptedTurn,
                {
                    role: 'implementer',
                    ticket: 11,
                    result: {
                        outcome: 'done',
                        bad_test: null,
                        summary: 'Done.',
                        assumptions: [],
                        run_notes: [],
                    },
                } satisfies ScriptedTurn,
            ],
        })
        const launched = await launcher.launch({
            role: 'implementer',
            ticket: 11,
            prompt: 'Start.',
            cwd: repo,
            may_edit_tests: false,
            config,
            messaging: null,
            model: 'gemini-4-argon-high',
            effort: 'medium',
        })
        if (!launched.session_id) throw new Error('missing session_id')
        journal.append({
            kind: 'agent_started',
            ticket: 11,
            role: 'implementer',
            content: {
                role: 'implementer',
                prompt: 'Start.',
                follow_up_of: null,
                model: null,
                model_reason: null,
                effort: null,
                trial_group: null,
            },
        })
        journal.append({
            kind: 'agent_failed',
            ticket: 11,
            role: 'implementer',
            content: {
                role: 'implementer',
                failure: 'agent',
                error: 'Needs follow-up.',
                session_id: launched.session_id,
            },
        })
        const state = replayRun({ records: journal.read() })
        const context: BuildContext = {
            git: createGitAdapter({ repo_root: repo }),
            launcher,
            journal,
            tracker: createInMemoryTracker({ issues: [], sub_tickets: {} }),
            state,
            config,
            run_dir: join(root, 'run-1'),
            step: { run_id: 'run-1', first_seq: 1, redo: false },
        }

        await followUpAgent({
            context,
            action: {
                type: 'follow_up_agent',
                ticket: 11,
                role: 'implementer',
                session_id: launched.session_id,
                message: 'Fix it.',
            },
        })

        const lastStarted = journal
            .read()
            .findLast((record) => record.kind === 'agent_started')
        expect(lastStarted?.kind).toBe('agent_started')
        if (lastStarted?.kind === 'agent_started') {
            expect(lastStarted.content.follow_up_of).toBe(launched.session_id)
            expect(lastStarted.content.model).toBe('gemini-4-neon-high')
        }
    })

    test('launchAgent under agy journals routed model and passes model and effort to launcher.launch', async () => {
        const journal = createJournal({
            file: join(root, 'journal-launch.jsonl'),
        })
        const config = EngineConfigSchema.parse({
            ...PRACTICE_ENGINE_CONFIG,
            models: {
                provider: 'agy',
                floors: { 'test-writer': 'gemini-4-argon-high' },
                effort: { 'test-writer': 'high' },
            },
        })
        for (const entry of intakePassed({
            tickets: [practiceTicket({ number: 11 })],
        })) {
            journal.append(entry)
        }
        journal.append({
            kind: 'ticket_worktree_created',
            ticket: 11,
            role: null,
            content: {
                branch: 'luca/ticket-11',
                path: repo,
                base_sha: (await git(repo, 'rev-parse', 'HEAD')).trim(),
            },
        })
        const asked = journal.append({
            kind: 'jev_asked',
            ticket: 11,
            role: 'test-writer',
            content: {
                job: 'agent_model',
                model: '@cf/cloudflare/clef',
                request: {
                    state: {},
                    questions: {
                        model: {
                            type: 'choice',
                            instructions: 'Which model?',
                            criteria: {
                                'gemini-4-neon-high': null,
                                'gemini-4-argon-high': null,
                            },
                        },
                    },
                },
                fixed: { model: 'gemini-4-neon-high' },
            },
        })
        journal.append({
            kind: 'jev_answered',
            ticket: 11,
            role: 'test-writer',
            content: {
                job: 'agent_model',
                asked_seq: asked.seq,
                model: '@cf/cloudflare/clef',
                ms: 10,
                answers: {
                    model: {
                        value: 'gemini-4-argon-high',
                        confidence: 0.9,
                        raw: {},
                    },
                },
            },
        })
        const launcher = createScriptedLauncher({
            turns: [
                {
                    role: 'test-writer',
                    ticket: 11,
                    result: {
                        outcome: 'done',
                        bad_test: null,
                        tests: ['src/index.test.ts'],
                        criteria: [{ criterion: 'one', tests: ['test_one'] }],
                    },
                } satisfies ScriptedTurn,
            ],
        })
        const state = replayRun({ records: journal.read() })
        const context: BuildContext = {
            git: createGitAdapter({ repo_root: repo }),
            launcher,
            journal,
            tracker: createInMemoryTracker({ issues: [], sub_tickets: {} }),
            state,
            config,
            run_dir: join(root, 'run-1'),
            step: { run_id: 'run-1', first_seq: 1, redo: false },
        }

        await launchAgent({
            context,
            action: {
                type: 'launch_agent',
                ticket: 11,
                role: 'test-writer',
                prompt: 'Write tests.',
                may_edit_tests: true,
            },
        })

        const started = journal
            .read()
            .findLast((record) => record.kind === 'agent_started')
        expect(started?.kind).toBe('agent_started')
        if (started?.kind === 'agent_started') {
            expect(started.content.model).toBe('gemini-4-argon-high')
            expect(started.content.model_reason).toBe('decision_model')
            expect(started.content.effort).toBe('high')
        }
        expect(launcher.launches()).toEqual([
            expect.objectContaining({
                kind: 'launch',
                role: 'test-writer',
                model: 'gemini-4-argon-high',
                effort: 'high',
            }),
        ])
    })
})
