import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runEngine, startRun } from './execute'
import { CRASH_SECTION } from './fix-loop-text'

import type { AgentLauncher } from '../agents/agent-launcher'
import {
    createScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import type { EngineConfig } from '../config/engine-config'
import type { GitAdapter } from '../git/git-adapter'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import { SPEC_OWNER, specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    git,
    happyTurns,
    IMPLEMENTER_RESULT,
    practiceTracker,
} from '../testing/practice-repo'
import {
    createInMemoryTracker,
    type InMemoryTracker,
} from '../tracker/in-memory-tracker'
import { hasLucaMarker } from '../tracker/post-comment-once'

/**
 * Seam 2 for crash recovery (#369): the scheduler journals each step it
 * starts between `step_started` and `step_ended`. An engine started again
 * on a journal with a step left open appends one `run_resumed`, then takes
 * the step again, an agent's turn in a fresh session.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-crash-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** An implementer whose code fails the tests, so the gates fail. */
const WRONG: ScriptedTurn = {
    role: 'implementer',
    ticket: 11,
    files: {
        'src/sum.ts': 'export const sum = (): number => 42\n',
        'src/index.ts': "export { sum } from './sum'\n",
    },
    result: IMPLEMENTER_RESULT,
}

/** A launcher whose calls throw, as if the engine died mid-turn. */
const crashingOn = ({
    launcher,
    kind,
}: {
    launcher: AgentLauncher
    kind: 'launch' | 'follow_up'
}): AgentLauncher => ({
    launch: (args) =>
        kind === 'launch'
            ? Promise.reject(new Error('The engine crashed.'))
            : launcher.launch(args),
    followUp: (args) =>
        kind === 'follow_up'
            ? Promise.reject(new Error('The engine crashed.'))
            : launcher.followUp(args),
})

/**
 * A tracker whose `comment` on issue `number` posts for real, then throws
 * once, as if the engine died before journaling the comment.
 */
const crashAfterComment = ({
    tracker,
    number,
}: {
    tracker: InMemoryTracker
    number: number
}): InMemoryTracker => {
    let crashed = false
    return {
        ...tracker,
        comment: async (args) => {
            const posted = await tracker.comment(args)
            if (!crashed && args.number === number) {
                crashed = true
                throw new Error('The engine crashed.')
            }
            return posted
        },
    }
}

const ofKind = <Kind extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: Kind
): Extract<JournalRecord, { kind: Kind }>[] =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: Kind }> =>
            record.kind === kind
    )

describe('crash recovery, end to end', () => {
    test('a follow-up cut off by a crash is taken again by a fresh agent carrying its message', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()

        const crashed = practice.run({
            launcher: crashingOn({
                launcher: createScriptedLauncher({
                    turns: [testWriter, WRONG],
                }),
                kind: 'follow_up',
            }),
        })
        await expect(crashed).rejects.toThrow('The engine crashed.')
        const before = practice.journal.read()
        const open = ofKind(before, 'step_started').at(-1)
        expect(open?.content).toEqual({
            key: '11',
            step: 'follow_up_agent:implementer',
            first_seq: null,
        })
        expect(ofKind(before, 'step_ended').at(-1)?.seq ?? 0).toBeLessThan(
            open?.seq ?? 0
        )

        const { action, launches } = await practice.run({
            resume: true,
            turns: [implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const after = practice.journal.read()
        expect(ofKind(after, 'run_resumed')).toEqual([
            expect.objectContaining({
                seq: before.length + 1,
                content: {
                    interrupted: [
                        {
                            key: '11',
                            step: 'follow_up_agent:implementer',
                            ticket: 11,
                            role: 'implementer',
                            started_seq: open?.seq,
                            first_seq: null,
                        },
                    ],
                },
            }),
        ])
        const redo = launches.find(({ role }) => role === 'implementer')
        expect(redo).toMatchObject({ kind: 'launch', role: 'implementer' })
        expect(redo?.prompt).toContain('The gates failed.')
        expect(redo?.prompt).toContain(CRASH_SECTION)
        expect(launches.some(({ kind }) => kind === 'follow_up')).toBe(false)
        // Every step the resumed engine started, it saw end.
        const resumed = after.slice(before.length)
        expect(ofKind(resumed, 'step_started')).toHaveLength(
            ofKind(resumed, 'step_ended').length
        )
    })

    test("a redone step's step_started names its first try", async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()

        await practice
            .run({
                launcher: crashingOn({
                    launcher: createScriptedLauncher({ turns: [] }),
                    kind: 'launch',
                }),
            })
            .catch(() => undefined)
        const first = ofKind(practice.journal.read(), 'step_started').at(-1)
        expect(first?.content.step).toBe('launch_agent:test-writer')

        const { action } = await practice.run({
            resume: true,
            turns: [testWriter, implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const starts = ofKind(practice.journal.read(), 'step_started').filter(
            ({ content }) => content.step === 'launch_agent:test-writer'
        )
        expect(starts.map(({ content }) => content.first_seq)).toEqual([
            null,
            first?.seq ?? -1,
        ])
    })

    test('intake refusal comments are posted once when a crash cut the refusal off', async () => {
        const journal = createJournal({
            file: runJournalPath({ runs_dir: root, run_id: 'run-1' }),
        })
        const config: EngineConfig = {
            checks: { test: 'bun test' },
            test_file_patterns: ['**/*.test.ts'],
            test_setup_files: [],
            rule_files: [],
        }
        const tracker = createInMemoryTracker({
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 12, criteria: [] }),
                ticketIssue({ number: 13, labels: ['enhancement'] }),
            ],
            sub_tickets: { 10: [12, 13] },
        })
        startRun({ journal, spec_number: 10, config })

        await expect(
            runEngine({
                journal,
                tracker: crashAfterComment({ tracker, number: 13 }),
            })
        ).rejects.toThrow('The engine crashed.')
        const action = await runEngine({ journal, tracker })

        expect(action).toEqual({ type: 'done', outcome: 'refused' })
        for (const number of [12, 13]) {
            const comments = tracker.commentsOn({ number })
            expect(comments).toHaveLength(1)
            expect(comments[0]).toStartWith('Luca intake refused the run')
            expect(tracker.labelsOf({ number })).toContain('needs-info')
        }
        expect(ofKind(journal.read(), 'intake_refused')).toHaveLength(1)
    })

    test('a stuck report is posted once when a crash came between posting and journaling it', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = practiceTracker()
        const crashingLauncher = crashingOn({
            launcher: createScriptedLauncher({ turns: [] }),
            kind: 'launch',
        })
        // The test-writer's launch is cut off three times: the ticket is stuck.
        for (const resume of [false, true, true]) {
            await expect(
                practice.run({ tracker, resume, launcher: crashingLauncher })
            ).rejects.toThrow('The engine crashed.')
        }

        await expect(
            practice.run({
                resume: true,
                tracker: crashAfterComment({ tracker, number: 10 }),
                launcher: crashingLauncher,
            })
        ).rejects.toThrow('The engine crashed.')
        const { action, records } = await practice.run({
            resume: true,
            tracker,
            launcher: crashingLauncher,
        })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        const comments = tracker.commentsOn({ number: 10 })
        expect(comments).toHaveLength(1)
        expect(comments[0]).toContain('Ticket #11 is stuck')
        const reports = ofKind(records, 'stuck_reported')
        expect(reports).toHaveLength(1)
        const state = replayRun({ records })
        expect(state.tickets[11]?.stuck?.reason).toBe('crashed')
        expect(state.engine_comments).toEqual([
            reports[0]?.content.comment_id ?? -1,
        ])
    })

    test("the engine's own comments, even ones a crash orphaned, are never taken as replies", async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = practiceTracker()
        const crashingLauncher = crashingOn({
            launcher: createScriptedLauncher({ turns: [] }),
            kind: 'launch',
        })
        for (const resume of [false, true, true]) {
            await practice
                .run({ tracker, resume, launcher: crashingLauncher })
                .catch(() => undefined)
        }
        let polls = 0
        const { records } = await practice.run({
            resume: true,
            tracker,
            launcher: crashingLauncher,
            stop_before: [],
            clock: {
                now: () => Date.now(),
                sleep: async () => {
                    polls += 1
                    // An engine comment a crash orphaned: it reads like a
                    // reply from the owner.
                    if (polls === 1) {
                        tracker.addComment({
                            number: 10,
                            author: 'spec-owner',
                            body: 'skip\n\n<!-- luca:old-run:5:0 -->',
                        })
                    }
                    if (polls === 3) {
                        tracker.addComment({
                            number: 10,
                            author: 'spec-owner',
                            body: 'stop',
                        })
                    }
                },
            },
        })

        expect(
            tracker.commentsOn({ number: 10 }).filter(hasLucaMarker)
        ).toHaveLength(2)
        expect(
            ofKind(records, 'comment_read').map(({ content }) => content.body)
        ).toEqual(['stop'])
    })

    test('a PR opened just before a crash is adopted, not opened again', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = practiceTracker()
        let crashed = false
        const crashing: InMemoryTracker = {
            ...tracker,
            openPullRequest: async (request) => {
                const opened = await tracker.openPullRequest(request)
                if (!crashed) {
                    crashed = true
                    throw new Error('The engine crashed.')
                }
                return opened
            },
        }
        await expect(
            practice.run({
                tracker: crashing,
                turns: Object.values(happyTurns()),
            })
        ).rejects.toThrow('The engine crashed.')

        const { action, records } = await practice.run({
            resume: true,
            tracker,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [pull, ...others] = tracker.pullRequests()
        expect(others).toEqual([])
        expect(ofKind(records, 'pull_request_opened')).toEqual([
            expect.objectContaining({
                content: expect.objectContaining({
                    number: pull?.number,
                    url: pull?.url,
                }),
            }),
        ])
    })
})

/**
 * Wraps the real git adapter so its `method` crashes once: it does `effect`
 * (by default the real call), then throws, as if the engine died before
 * journaling what git did. Calls `when` turns down go through untouched.
 */
const crashGitOnce =
    <Method extends keyof GitAdapter>({
        method,
        effect,
        when,
    }: {
        method: Method
        effect?: (args: {
            real: GitAdapter
            args: Parameters<GitAdapter[Method]>[0]
        }) => Promise<unknown>
        when?: (args: Parameters<GitAdapter[Method]>[0]) => boolean
    }) =>
    (real: GitAdapter): GitAdapter => {
        let crashed = false
        const call = real[method] as (args: unknown) => Promise<unknown>
        const crashing = async (args: Parameters<GitAdapter[Method]>[0]) => {
            if (crashed || !(when?.(args) ?? true)) return call(args)
            crashed = true
            await (effect === undefined ? call(args) : effect({ real, args }))
            throw new Error('The engine crashed.')
        }
        return { ...real, [method]: crashing }
    }

/** The subjects of the commits on a PR's head branch in origin, newest first. */
const prSubjects = async ({
    origin,
    tracker,
}: {
    origin: string
    tracker: InMemoryTracker
}): Promise<string[]> => {
    const [pr] = tracker.pullRequests()
    const log = await git(origin, 'log', '--format=%s', pr?.head ?? 'none')
    return log.split('\n').filter((line) => line !== '')
}

describe('git steps redone after a crash', () => {
    test('a run branch made just before a crash is adopted', async () => {
        const practice = await createPracticeRepo({ root })
        await expect(
            practice.run({ git: crashGitOnce({ method: 'createRunBranch' }) })
        ).rejects.toThrow('The engine crashed.')

        const { action, records } = await practice.run({
            resume: true,
            turns: Object.values(happyTurns()),
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(ofKind(records, 'run_branch_created')).toHaveLength(1)
    }, 60_000)

    test('a ticket worktree made just before a crash is adopted', async () => {
        const practice = await createPracticeRepo({ root })
        await expect(
            practice.run({ git: crashGitOnce({ method: 'createWorktree' }) })
        ).rejects.toThrow('The engine crashed.')

        const { action, records } = await practice.run({
            resume: true,
            turns: Object.values(happyTurns()),
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(ofKind(records, 'ticket_worktree_created')).toHaveLength(1)
    }, 60_000)

    test("a half-made worktree folder git doesn't know is cleaned up first", async () => {
        const practice = await createPracticeRepo({ root })
        await expect(
            practice.run({
                git: crashGitOnce({
                    method: 'createWorktree',
                    effect: async ({ args }) => {
                        await mkdir(args.path, { recursive: true })
                        await Bun.write(join(args.path, 'half.txt'), 'half\n')
                    },
                }),
            })
        ).rejects.toThrow('The engine crashed.')

        const { action } = await practice.run({
            resume: true,
            turns: Object.values(happyTurns()),
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
    }, 60_000)

    test('a ticket branch left without its worktree is checked out again', async () => {
        const practice = await createPracticeRepo({ root })
        await expect(
            practice.run({
                git: crashGitOnce({
                    method: 'createWorktree',
                    effect: async ({ real, args }) => {
                        await real.createWorktree(args)
                        await real.removeWorktree({ path: args.path })
                    },
                }),
            })
        ).rejects.toThrow('The engine crashed.')

        const { action, records } = await practice.run({
            resume: true,
            turns: Object.values(happyTurns()),
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(ofKind(records, 'ticket_worktree_created')).toHaveLength(1)
    }, 60_000)

    test('a ticket commit made just before a crash is adopted, not made again', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()
        let crashSha = ''
        await expect(
            practice.run({
                turns: [testWriter],
                git: crashGitOnce({
                    method: 'commitAll',
                    effect: async ({ real, args }) => {
                        crashSha = (await real.commitAll(args)).sha
                    },
                }),
            })
        ).rejects.toThrow('The engine crashed.')

        const { action, records, tracker } = await practice.run({
            resume: true,
            turns: [implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const red = ofKind(records, 'commit_made').filter(
            ({ content }) => content.stage === 'red'
        )
        expect(red.map(({ content }) => content.sha)).toEqual([crashSha])
        expect(red[0]?.content.files).toEqual(['src/sum.test.ts'])
        const subjects = await prSubjects({ origin: practice.origin, tracker })
        expect(
            subjects.filter((subject) => subject.startsWith('test:'))
        ).toHaveLength(1)
    }, 60_000)

    test("the final review's fix commit made just before a crash is adopted", async () => {
        const practice = await createPracticeRepo({ root })
        const finding = {
            id: 'S1',
            severity: 'should_fix',
            kind: 'code',
            file: 'src/sum.ts',
            title: 'Name the accumulator for what it holds',
            detail: 'total reads like the result.',
        }
        await expect(
            practice.run({
                turns: [
                    ...Object.values(happyTurns()),
                    {
                        role: 'security-lens',
                        ticket: 10,
                        result: {
                            verdict: 'changes_requested',
                            findings: [finding],
                            rulings: [],
                            summary: 'The security lens looked.',
                            assumptions: [],
                        },
                    },
                    {
                        role: 'implementer',
                        ticket: 10,
                        files: {
                            'src/sum.ts':
                                'export const sum = ({ numbers }: { numbers: number[] }): number =>\n    numbers.reduce((running, each) => running + each, 0)\n',
                        },
                        result: {
                            ...IMPLEMENTER_RESULT,
                            finding_responses: [
                                {
                                    finding_id: 'security-S1',
                                    response: 'fixed',
                                    reason: '',
                                },
                            ],
                        },
                    },
                ],
                git: crashGitOnce({
                    method: 'commitAll',
                    when: ({ message }) =>
                        message.startsWith('fix: final review'),
                }),
            })
        ).rejects.toThrow('The engine crashed.')

        const { action, records, tracker } = await practice.run({
            resume: true,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const fixes = ofKind(records, 'commit_made').filter(
            ({ ticket }) => ticket === null
        )
        expect(fixes).toHaveLength(1)
        expect(fixes[0]?.content.files).toEqual(['src/sum.ts'])
        const subjects = await prSubjects({ origin: practice.origin, tracker })
        expect(
            subjects.filter((subject) =>
                subject.startsWith('fix: final review')
            )
        ).toEqual(['fix: final review round 1 for spec #10'])
    }, 60_000)

    test('a join replayed in full just before a crash is redone from where the run branch stood', async () => {
        const practice = await createPracticeRepo({ root })
        await expect(
            practice.run({
                turns: Object.values(happyTurns()),
                git: crashGitOnce({ method: 'replay' }),
            })
        ).rejects.toThrow('The engine crashed.')

        const { action, records, tracker } = await practice.run({
            resume: true,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(ofKind(records, 'ticket_joined')).toHaveLength(1)
        expect(await prSubjects({ origin: practice.origin, tracker })).toEqual([
            'feat: build #11 Add sum',
            'test: add failing tests for #11 Add sum',
            'initial',
        ])
    }, 60_000)

    test('a join a crash cut off half-way is redone from where the run branch stood', async () => {
        const practice = await createPracticeRepo({ root })
        await expect(
            practice.run({
                turns: Object.values(happyTurns()),
                git: crashGitOnce({
                    method: 'replay',
                    effect: ({ real, args }) =>
                        real.replay({
                            ...args,
                            commits: args.commits.slice(0, 1),
                        }),
                }),
            })
        ).rejects.toThrow('The engine crashed.')

        const { action, tracker } = await practice.run({ resume: true })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(await prSubjects({ origin: practice.origin, tracker })).toEqual([
            'feat: build #11 Add sum',
            'test: add failing tests for #11 Add sum',
            'initial',
        ])
    }, 60_000)

    test('a join cut off by crashes too often leaves the run branch where it stood, and the ticket stuck', async () => {
        const practice = await createPracticeRepo({ root })
        const halfJoin = () =>
            crashGitOnce({
                method: 'replay',
                effect: ({ real, args }) =>
                    real.replay({ ...args, commits: args.commits.slice(0, 1) }),
            })
        await expect(
            practice.run({
                turns: Object.values(happyTurns()),
                git: halfJoin(),
            })
        ).rejects.toThrow('The engine crashed.')
        for (const _ of [1, 2]) {
            await expect(
                practice.run({ resume: true, git: halfJoin() })
            ).rejects.toThrow('The engine crashed.')
        }

        const { action, records } = await practice.run({ resume: true })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        const state = replayRun({ records })
        expect(state.tickets[11]?.stuck?.reason).toBe('crashed')
        const runBranch = ofKind(records, 'run_branch_created')[0]?.content
        expect(
            (await git(runBranch?.path ?? root, 'rev-parse', 'HEAD')).trim()
        ).toBe(runBranch?.base_sha ?? '')
    }, 60_000)

    test('a retry cut off after journaling the new copy of the ticket still starts it over', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = createInMemoryTracker({
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({
                    number: 11,
                    title: 'Add sum',
                    criteria: [
                        'sum adds two numbers',
                        'sum of no numbers is zero',
                    ],
                }),
            ],
            sub_tickets: { 10: [11] },
            engine_login: SPEC_OWNER,
        })
        let acted = false
        const clock = {
            now: () => Date.now(),
            sleep: async () => {
                await Bun.sleep(5)
                const state = replayRun({ records: practice.journal.read() })
                if (acted || (state.tickets[11]?.stuck_report ?? null) === null)
                    return
                acted = true
                tracker.updateIssue({
                    number: 11,
                    changes: { labels: ['ready-for-agent', 'refactor'] },
                })
                tracker.addComment({
                    number: 10,
                    author: SPEC_OWNER,
                    body: 'retry #11',
                })
            },
        }
        const { implementer, reviewer } = happyTurns()
        let crashed = false
        await expect(
            practice.run({
                tracker,
                clock,
                stop_before: [],
                turns: [
                    {
                        role: 'test-writer',
                        ticket: 11,
                        result: {
                            outcome: 'nothing_new_to_test',
                            summary: 'It only moves code.',
                        },
                    },
                ],
                // Dies right after the new copy of #11 is journaled.
                journal: (real) => ({
                    ...real,
                    append: (entry) => {
                        if (!crashed && entry.kind === 'ticket_retried') {
                            crashed = true
                            throw new Error('The engine crashed.')
                        }
                        return real.append(entry)
                    },
                }),
            })
        ).rejects.toThrow('The engine crashed.')

        const { action, records } = await practice.run({
            resume: true,
            tracker,
            clock,
            stop_before: [],
            turns: [implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(
            ofKind(records, 'ticket_retried').map(({ content }) => content.mode)
        ).toEqual(['restart'])
    }, 60_000)
})
