import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { BuildContext } from './build-context'
import { executeFinalReviewAction, rulePath } from './execute-final-review'

import { roleInstructions } from '../agents/role-instructions'
import { createScriptedLauncher } from '../agents/scripted-launcher'
import { EngineConfigSchema } from '../config/engine-config'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal } from '../journal/journal'
import { replayRun } from '../journal/replay'
import { intakePassed, practiceTicket } from '../testing/build-fixtures'
import { git, PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Final review pieces that need no practice repo, so they run with the fast
 * tests (#568). The review itself, end to end, is in
 * `final-review.e2e.test.ts`.
 */

describe('where a rule file is read', () => {
    test('in the run branch worktree, under home for ~/, and as is when absolute', () => {
        const where = (path: string) =>
            rulePath({ path, worktree: '/run/branch', home: '/home/me' })

        expect(where('AGENTS.md')).toBe('/run/branch/AGENTS.md')
        expect(where('docs/rules.md')).toBe('/run/branch/docs/rules.md')
        expect(where('~/.claude/rules/no-classes.md')).toBe(
            '/home/me/.claude/rules/no-classes.md'
        )
        expect(where('/etc/luca/rules.md')).toBe('/etc/luca/rules.md')
    })
})

describe("final review agents' instructions", () => {
    test('a fixer with no messaging is not told about agent messages', () => {
        const config = { ...PRACTICE_ENGINE_CONFIG, muninn: undefined }
        const told = (messaging?: boolean) =>
            roleInstructions({
                role: 'implementer',
                may_edit_tests: false,
                config,
                messaging,
            }).includes('## Agent messages')

        expect(told()).toBe(true)
        expect(told(false)).toBe(false)
        expect(
            roleInstructions({
                role: 'security-lens',
                may_edit_tests: false,
                config,
            }).includes('## Agent messages')
        ).toBe(false)
    })
})

describe('executeFinalReviewAction provider routing (#778 AC6–AC7)', () => {
    let root = ''
    let repo = ''

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-final-review-provider-'))
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

    const reviewContext = ({
        provider,
        launcher,
        journal,
    }: {
        provider: 'claude' | 'agy'
        launcher: ReturnType<typeof createScriptedLauncher>
        journal: ReturnType<typeof createJournal>
    }): BuildContext => {
        const config = EngineConfigSchema.parse({
            ...PRACTICE_ENGINE_CONFIG,
            models: { provider },
        })
        for (const entry of intakePassed({
            tickets: [practiceTicket({ number: 11 })],
        })) {
            journal.append(entry)
        }
        journal.append({
            kind: 'run_branch_created',
            ticket: null,
            role: null,
            content: {
                branch: 'luca/spec-10-run',
                path: repo,
                base_sha: 'b0',
            },
        })
        journal.append({
            kind: 'final_review_started',
            ticket: null,
            role: null,
            content: {
                round: 1,
                from_sha: 'b0',
                head_sha: 'h0',
                lenses: ['security'],
                files: [],
                rules: [],
                fresh: false,
            },
        })
        return {
            git: createGitAdapter({ repo_root: repo }),
            launcher,
            journal,
            tracker: createInMemoryTracker({ issues: [], sub_tickets: {} }),
            state: replayRun({ records: journal.read() }),
            config,
            run_dir: join(root, 'run-1'),
            step: { run_id: 'run-1', first_seq: 1, redo: false },
        }
    }

    test('launch_lens and launch_final_fixer launch and journal gemini-4-neon-high as locked under agy', async () => {
        const journal = createJournal({ file: join(root, 'journal.jsonl') })
        const launcher = createScriptedLauncher({
            turns: [
                {
                    role: 'security-lens',
                    ticket: 10,
                    result: {
                        verdict: 'approve',
                        findings: [],
                        summary: 'Clean.',
                        assumptions: [],
                    },
                },
                {
                    role: 'implementer',
                    ticket: 10,
                    result: {
                        outcome: 'done',
                        bad_test: null,
                        summary: 'Fixed.',
                        assumptions: [],
                        run_notes: [],
                    },
                },
            ],
        })
        const context = reviewContext({
            provider: 'agy',
            launcher,
            journal,
        })

        await executeFinalReviewAction({
            action: {
                type: 'launch_lens',
                lens: 'security',
                role: 'security-lens',
                prompt: 'Review security.',
            },
            context,
        })
        await executeFinalReviewAction({
            action: {
                type: 'launch_final_fixer',
                role: 'implementer',
                prompt: 'Fix findings.',
                may_edit_tests: false,
            },
            context,
        })

        const launched = launcher.launches()
        expect(launched).toHaveLength(2)
        expect(launched.map((call) => call.model)).toEqual([
            'gemini-4-neon-high',
            'gemini-4-neon-high',
        ])
        const started = journal
            .read()
            .filter((record) => record.kind === 'agent_started')
        expect(started).toHaveLength(2)
        for (const record of started) {
            if (record.kind === 'agent_started') {
                expect(record.content.model).toBe('gemini-4-neon-high')
                expect(record.content.model_reason).toBe('locked')
                expect(record.content.trial_group).toBeNull()
            }
        }
    })

    test('follow_up_final_fixer falls back to gemini-4-neon-high under agy and opus under claude when prior model is null', async () => {
        for (const [provider, expected] of [
            ['agy', 'gemini-4-neon-high'],
            ['claude', 'opus'],
        ] as const) {
            const journal = createJournal({
                file: join(root, `journal-${provider}.jsonl`),
            })
            const launcher = createScriptedLauncher({
                turns: [
                    {
                        role: 'implementer',
                        ticket: 10,
                        result: {
                            outcome: 'done',
                            bad_test: null,
                            summary: 'Fixed.',
                            assumptions: [],
                            run_notes: [],
                        },
                    },
                    {
                        role: 'implementer',
                        ticket: 10,
                        result: {
                            outcome: 'done',
                            bad_test: null,
                            summary: 'Fixed again.',
                            assumptions: [],
                            run_notes: [],
                        },
                    },
                ],
            })
            const context = reviewContext({ provider, launcher, journal })
            const first = await launcher.launch({
                role: 'implementer',
                ticket: 10,
                prompt: 'Fix.',
                cwd: repo,
                may_edit_tests: false,
                config: context.config,
                messaging: null,
                model: expected,
                effort: 'xhigh',
            })
            if (!first.session_id) throw new Error('missing session_id')
            journal.append({
                kind: 'agent_started',
                ticket: null,
                role: 'implementer',
                content: {
                    role: 'implementer',
                    prompt: 'Fix.',
                    follow_up_of: null,
                    model: null,
                    model_reason: null,
                    effort: null,
                    trial_group: null,
                },
            })
            journal.append({
                kind: 'agent_failed',
                ticket: null,
                role: 'implementer',
                content: {
                    role: 'implementer',
                    failure: 'agent',
                    error: 'Gates failed.',
                    session_id: first.session_id,
                },
            })
            context.state = replayRun({ records: journal.read() })

            await executeFinalReviewAction({
                action: {
                    type: 'follow_up_final_fixer',
                    role: 'implementer',
                    session_id: first.session_id,
                    message: 'Fix gates.',
                },
                context,
            })

            const followUp = journal
                .read()
                .findLast((record) => record.kind === 'agent_started')
            expect(followUp?.kind).toBe('agent_started')
            if (followUp?.kind === 'agent_started') {
                expect(followUp.content.follow_up_of).toBe(first.session_id)
                expect(followUp.content.model).toBe(expected)
            }
        }
    })
})
