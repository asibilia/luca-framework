import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    baselineTests,
    intakeOfThree,
    redCheck,
    stamp,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

import type { EngineRecord } from '../shared/board-rpc'

/**
 * A reused baseline on the board (#404 through #403): the engine's
 * `baseline_reused { from_ticket, base_sha }` says a ticket took another
 * ticket's baseline from the same run-branch commit instead of running the
 * suite again, and the card shows it with that ticket's own baseline counts.
 */

let harness: Harness
const extra: Harness[] = []
const dirs: string[] = []

afterEach(async () => {
    await harness.cleanup()
    for (const other of extra.splice(0)) await other.cleanup()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

/** `baseline_reused` as the engine journals it. */
const baselineReused = ({
    ticket,
    from_ticket,
}: {
    ticket: number
    from_ticket: number
}): Entry => ({
    kind: 'baseline_reused',
    ticket,
    role: null,
    content: { from_ticket, base_sha: 'abc123' },
})

/** The journal: three tickets through intake, then `entries`. */
const journalWith = ({ entries }: { entries: Entry[] }): EngineRecord[] =>
    stamp({ entries: [...intakeOfThree(), ...entries] })

const runWith = async ({ records }: { records: EngineRecord[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    await harness.send({ run_id, token, records })
    return { run_id, token }
}

/** #11's baseline (4 passing), then its red check (2 failing of 6). */
const lenderWithRedCheck = (): Entry[] => [
    ticketWorktreeCreated({ ticket: 11 }),
    baselineTests({ ticket: 11, passed: 4 }),
    redCheck({ ticket: 11, ok: true, failing: 2, passing: 4 }),
]

describe('a reused baseline on the panel', () => {
    test("a ticket that reuses another's baseline shows it, with that ticket's baseline counts", async () => {
        await runWith({
            records: journalWith({
                entries: [
                    ...lenderWithRedCheck(),
                    ticketWorktreeCreated({ ticket: 13 }),
                    baselineReused({ ticket: 13, from_ticket: 11 }),
                ],
            }),
        })

        const card = await harness.ticket({ number: 13 })
        expect(card.started).toBe(true)
        expect(card.activity).toBe('baseline tests (reused from #11)')
        expect(card.tests).toEqual({ failing: 0, total: 4 })
        expect((await harness.ticket({ number: 11 })).tests).toEqual({
            failing: 2,
            total: 6,
        })
    })

    test("a chain of reuses gives the last ticket the first one's baseline counts", async () => {
        await runWith({
            records: journalWith({
                entries: [
                    ...lenderWithRedCheck(),
                    ticketWorktreeCreated({ ticket: 12 }),
                    baselineReused({ ticket: 12, from_ticket: 11 }),
                    redCheck({ ticket: 12, ok: true, failing: 3, passing: 4 }),
                    ticketWorktreeCreated({ ticket: 13 }),
                    baselineReused({ ticket: 13, from_ticket: 12 }),
                ],
            }),
        })

        const card = await harness.ticket({ number: 13 })
        expect(card.activity).toBe('baseline tests (reused from #12)')
        expect(card.tests).toEqual({ failing: 0, total: 4 })
    })
})

describe('a reused baseline in the chat rows', () => {
    test('a reused baseline adds no chat row', async () => {
        const { run_id, token } = await runWith({
            records: journalWith({
                entries: [
                    ...lenderWithRedCheck(),
                    ticketWorktreeCreated({ ticket: 13 }),
                ],
            }),
        })
        const before = harness.latestRows().map(({ row }) => row.id)
        const first_seq = (await harness.state()).event_count + 1

        await harness.send({
            run_id,
            token,
            first_seq,
            entries: [baselineReused({ ticket: 13, from_ticket: 11 })],
        })

        expect((await harness.ticket({ number: 13 })).activity).toBe(
            'baseline tests (reused from #11)'
        )
        expect(harness.latestRows().map(({ row }) => row.id)).toEqual(before)
    })
})

describe('a reused baseline after a restart', () => {
    test('after a plugin restart, a replayed journal shows the same reused baseline', async () => {
        const registry_dir = await mkdtemp(join(tmpdir(), 'luca-board-reg-'))
        dirs.push(registry_dir)
        harness = await createHarness({ registry_dir })
        const { run_id, token } = await harness.start()
        const records = journalWith({
            entries: [
                ...lenderWithRedCheck(),
                ticketWorktreeCreated({ ticket: 12 }),
                baselineReused({ ticket: 12, from_ticket: 11 }),
                ticketWorktreeCreated({ ticket: 13 }),
                baselineReused({ ticket: 13, from_ticket: 12 }),
            ],
        })
        await harness.send({ run_id, token, records })
        const before = await harness.state()

        const restarted = await createHarness({ registry_dir })
        extra.push(restarted)
        await restarted.send({ run_id, token, records })

        const after = await restarted.state()
        expect(after.tickets).toEqual(before.tickets)
        const card = after.tickets.find(({ number }) => number === 13)
        expect(card?.activity).toBe('baseline tests (reused from #12)')
        expect(card?.tests).toEqual({ failing: 0, total: 4 })
    })
})
