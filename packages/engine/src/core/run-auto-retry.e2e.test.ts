import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import { RUN_RETRY_TEXT, ofKind } from '../testing/auto-retry-fixtures'
import {
    createPracticeRepo,
    happyTurns,
    practiceTracker,
} from '../testing/practice-repo'
import type { InMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * The engine's own retry of a routine stuck item (#705), end to end on the
 * practice repo with scripted agents and the in-memory tracker: no reply
 * from anyone, and the run still opens its PR.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-auto-retry-e2e-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const AUTO_SUM_TEXT =
    "Luca retried #11 by itself after agent_failed. If it gets stuck the same way again, it'll wait for a reply."

describe('the engine retries a routine stuck item by itself, end to end', () => {
    test('a ticket whose implementer fails three tries is retried once by itself, then builds on to the PR', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()
        const failed: ScriptedTurn = {
            role: 'implementer',
            ticket: 11,
            failure: 'agent',
            error: 'The implementer stopped.',
        }

        const { action, records, tracker } = await practice.run({
            turns: [testWriter, failed, failed, failed, implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(ofKind(records, 'auto_retried')).toMatchObject([
            {
                ticket: 11,
                content: {
                    item: 'ticket',
                    reason: 'agent_failed',
                    body: AUTO_SUM_TEXT,
                },
            },
        ])
        expect(ofKind(records, 'stuck_reported')).toEqual([])
        expect(tracker.commentsOn({ number: 10 })[0]).toStartWith(AUTO_SUM_TEXT)
        expect(tracker.pullRequests()).toHaveLength(1)
    }, 90_000)

    test('a run stuck on pull_request_failed is retried once by itself and opens its PR on the second try', async () => {
        const practice = await createPracticeRepo({ root })
        const base = practiceTracker()
        let tries = 0
        const tracker: InMemoryTracker = {
            ...base,
            openPullRequest: async (request) => {
                tries += 1
                if (tries === 1) throw new Error('HTTP 422: Validation Failed')
                return base.openPullRequest(request)
            },
        }

        const { action, records } = await practice.run({
            tracker,
            turns: Object.values(happyTurns()),
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(ofKind(records, 'run_stuck')).toMatchObject([
            { content: { reason: 'pull_request_failed' } },
        ])
        expect(ofKind(records, 'auto_retried')).toMatchObject([
            {
                ticket: null,
                content: {
                    item: 'run',
                    reason: 'pull_request_failed',
                    body: RUN_RETRY_TEXT,
                },
            },
        ])
        expect(ofKind(records, 'stuck_reported')).toEqual([])
        expect(tracker.pullRequests()).toHaveLength(1)
        expect(tries).toBe(2)
    }, 90_000)
})
