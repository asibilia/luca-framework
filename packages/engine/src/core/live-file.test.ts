import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createLiveFile } from './live-file'

import type { AgentLauncher } from '../agents/agent-launcher'
import { CONFIG } from '../agents/claude-launcher-helpers'
import type { AgentRole } from '../agents/role-results'
import type { TurnProgress } from '../agents/turn-progress'
import { waitForLive, type LiveFile } from '../testing/live-file-fixtures'

/**
 * The live feed in the live file (#634): besides each agent in a turn,
 * `live.json` keeps the run's last 50 actions, across tickets, oldest
 * first, each with its time, ticket, role, model and action. The file is
 * made by `createLiveFile`, its launcher wrapped around a stand-in whose
 * turns report progress (`on_progress`) as the real launcher's do.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-live-feed-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const BASE = Date.parse('2026-10-19T12:00:00.000Z')

/** Ticket `ticket`'s action number `n`: a read of its own file. */
const actionOf = ({ ticket, n }: { ticket: number; n: number }) => ({
    tool: 'Read',
    target: `src/t${ticket}-${n}.ts`,
    at: new Date(BASE + ticket * 100_000 + n * 1000).toISOString(),
})

/**
 * A launcher whose turn on each ticket reports `count` actions, each twice
 * (a second message of the same action only adds tokens), then runs
 * `after`.
 */
const reporting = ({
    count,
    after,
}: {
    count: number
    after: (ticket: number) => Promise<void>
}): AgentLauncher => ({
    launch: async ({ ticket, on_progress }) => {
        for (let n = 1; n <= count; n += 1) {
            const action = actionOf({ ticket, n })
            const progress: TurnProgress = {
                tokens: n * 100,
                action,
                open_call: null,
                rate_limit_events: [],
            }
            on_progress?.(progress)
            on_progress?.({ ...progress, tokens: n * 100 + 50 })
        }
        await after(ticket)
        return { ok: true, session_id: `s-${ticket}`, structured_output: {} }
    },
    followUp: async () => ({ ok: false, failure: 'engine', error: 'none' }),
    closeSession: async () => undefined,
})

const launchArgs = ({
    ticket,
    role,
    model,
}: {
    ticket: number
    role: AgentRole
    model: string
}) => ({
    role,
    ticket,
    prompt: 'the sum of no numbers is zero',
    cwd: root,
    may_edit_tests: role === 'test-writer',
    config: CONFIG,
    messaging: null,
    model,
    effort: 'medium' as const,
})

describe('the live feed in the live file (#634)', () => {
    test("the live file holds the run's last 50 actions across tickets, oldest first, each with its time, ticket, role, model and action, and never more", async () => {
        const file = join(root, 'run-1', 'live.json')
        const live = createLiveFile({ file })
        const seen: { live: LiveFile | null } = { live: null }
        const launcher = live.launcher(
            reporting({
                count: 30,
                after: async (ticket) => {
                    if (ticket !== 12) return
                    seen.live = await waitForLive({
                        file,
                        until: (found) =>
                            found.feed.at(-1)?.target === 'src/t12-30.ts',
                    })
                },
            })
        )

        await launcher.launch(
            launchArgs({ ticket: 11, role: 'test-writer', model: 'sonnet' })
        )
        await launcher.launch(
            launchArgs({ ticket: 12, role: 'implementer', model: 'opus' })
        )
        live.close()

        expect(seen.live).not.toBeNull()
        const feed = seen.live?.feed ?? []
        const expected = [
            ...Array.from({ length: 20 }, (_, index) => ({
                ...actionOf({ ticket: 11, n: index + 11 }),
                ticket: 11,
                role: 'test-writer',
                model: 'sonnet',
            })),
            ...Array.from({ length: 30 }, (_, index) => ({
                ...actionOf({ ticket: 12, n: index + 1 }),
                ticket: 12,
                role: 'implementer',
                model: 'opus',
            })),
        ]
        expect(feed.length).toBe(50)
        expect(feed).toMatchObject(expected)
    })
})
