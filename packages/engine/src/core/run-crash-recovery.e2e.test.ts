import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { ofKind } from './run-crash-recovery-helpers'

import type { AgentLauncher } from '../agents/agent-launcher'
import { createScriptedLauncher } from '../agents/scripted-launcher'
import { replayRun } from '../journal/replay'
import {
    createPracticeRepo,
    happyTurns,
    practiceTracker,
} from '../testing/practice-repo'
import type { InMemoryTracker } from '../tracker/in-memory-tracker'
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
    closeSession: (args) => launcher.closeSession(args),
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

describe('crash recovery, end to end', () => {
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
    }, 60_000)

    test("a stuck report cut off between posting and journaling is posted once, and the engine's own comments, even ones a crash orphaned, are never taken as replies", async () => {
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
        // Then the engine dies right after posting its stuck report.
        await expect(
            practice.run({
                resume: true,
                tracker: crashAfterComment({ tracker, number: 10 }),
                launcher: crashingLauncher,
            })
        ).rejects.toThrow('The engine crashed.')
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

        // The report, once, and the orphaned comment.
        expect(
            tracker.commentsOn({ number: 10 }).filter(hasLucaMarker)
        ).toHaveLength(2)
        expect(tracker.commentsOn({ number: 10 })[0]).toContain(
            'Ticket #11 is stuck'
        )
        const reports = ofKind(records, 'stuck_reported')
        expect(reports).toHaveLength(1)
        const state = replayRun({ records })
        expect(state.tickets[11]?.stuck?.reason).toBe('crashed')
        expect(state.engine_comments).toEqual([
            reports[0]?.content.comment_id ?? -1,
        ])
        expect(
            ofKind(records, 'comment_read').map(({ content }) => content.body)
        ).toEqual(['stop'])
    }, 60_000)

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
    }, 60_000)
})
