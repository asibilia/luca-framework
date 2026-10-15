import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import type { JournalRecord } from '../journal/journal-record'
import type { EngineClock } from '../limits/limit-wait'
import {
    LIMIT_HIT,
    LIMIT_HIT_RESET,
    runManyTickets,
} from '../testing/many-tickets'

/**
 * Seam 2, a plan limit with many tickets in flight: #11's and #12's
 * test-writers are both working when the plan turns them away. The run
 * waits once (by a fake clock), then both take the same step again and the
 * run builds to its PR. Real git, gates, journal; scripted agents.
 */

let root = ''

afterAll(async () => {
    if (root !== '') await rm(root, { recursive: true, force: true })
})

/** A clock that starts at `start` and moves only when slept. */
const fakeClock = ({ start }: { start: string }) => {
    let now = Date.parse(start)
    const clock: EngineClock = {
        now: () => now,
        sleep: async (ms) => {
            now += ms
        },
    }
    return { clock, now: () => new Date(now).toISOString() }
}

const ofKind = <K extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: K
) =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: K }> =>
            record.kind === kind
    )

describe('a plan limit with two tickets in flight, end to end', () => {
    test('the run waits once, then both tickets take their cut-off step again and it builds to its PR', async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-limit-many-'))
        const time = fakeClock({ start: '2026-09-23T12:00:00.000Z' })
        const { action, records, tracker, launches } = await runManyTickets({
            root,
            scenario: LIMIT_HIT,
            clock: time.clock,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(tracker.pullRequests()).toHaveLength(1)
        expect(time.now()).toBe('2026-09-23T14:01:00.000Z')

        // One wait for the whole run, after both cut-off turns settled.
        const [waitStarted, ...otherWaits] = ofKind(
            records,
            'limit_wait_started'
        )
        const [waitEnded] = ofKind(records, 'limit_wait_ended')
        expect(otherWaits).toEqual([])
        expect(waitStarted?.content).toMatchObject({
            resets_at: LIMIT_HIT_RESET,
            until: '2026-09-23T14:01:00.000Z',
        })
        const cutSessions = ofKind(records, 'agent_session').filter(
            ({ content }) =>
                (content.session.session_id ?? '').startsWith('cut-')
        )
        expect(cutSessions.map(({ ticket }) => ticket)).toEqual([11, 12])
        for (const session of cutSessions) {
            expect(session.seq).toBeLessThan(waitStarted?.seq ?? 0)
        }

        // Nothing started during the wait.
        expect(
            records.filter(
                ({ seq, kind }) =>
                    kind === 'agent_started' &&
                    seq > (waitStarted?.seq ?? 0) &&
                    seq < (waitEnded?.seq ?? 0)
            )
        ).toEqual([])

        // Each ticket's cut-off step, the test-writer's launch, was taken
        // again after the wait, with the same prompt; no try was used.
        for (const ticket of [11, 12]) {
            const writers = launches.filter(
                (call) => call.ticket === ticket && call.role === 'test-writer'
            )
            expect(writers.map(({ kind }) => kind)).toEqual([
                'launch',
                'launch',
            ])
            expect(writers[1]?.prompt).toBe(writers[0]?.prompt ?? '')
            const starts = ofKind(records, 'agent_started').filter(
                (record) =>
                    record.ticket === ticket &&
                    record.content.role === 'test-writer'
            )
            expect(starts[1]?.seq ?? 0).toBeGreaterThan(waitEnded?.seq ?? 0)
        }
        expect(ofKind(records, 'agent_failed')).toEqual([])

        // Usage is still recorded per ticket as it pushes (#12 first), then
        // for the run. #13's scripted turns carry no session, so it has none.
        expect(
            ofKind(records, 'usage_recorded').map(({ content }) =>
                content.scope === 'run' ? 'run' : content.ticket
            )
        ).toEqual([12, 11, 'run'])
        expect(records.at(-2)?.kind).toBe('worktrees_removed')
        expect(records.at(-1)?.kind).toBe('usage_recorded')
    }, 120_000)
})
