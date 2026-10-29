import { describe, expect, test } from 'bun:test'

import { BoardReplySchema } from './board-sync'
import { engineClientId } from './paseo-board-link'

/**
 * The link checks the board's `engine.event` answer with `BoardReplySchema`
 * (#701): a refusal the board sends with `next_seq` 0 reads as a reply, so
 * its message is logged, not an "unexpected shape" error.
 */
describe("the board's reply to the link", () => {
    test('a refusal with next_seq 0 reads as a reply', () => {
        const parsed = BoardReplySchema.safeParse({
            ok: false,
            next_seq: 0,
            message: 'Unknown run',
        })

        expect(parsed.data).toEqual({
            ok: false,
            next_seq: 0,
            message: 'Unknown run',
        })
    })
})

/**
 * Each engine connects to Paseo with its own client id (#431), so two runs
 * at once never share one Paseo session.
 */
describe("the engine's Paseo client id", () => {
    test("is luca-engine- followed by the run's id", () => {
        expect(engineClientId({ run_id: 'luca-20260925-101500-aaaa' })).toBe(
            'luca-engine-luca-20260925-101500-aaaa'
        )
    })

    test('differs for two runs going at once', () => {
        const first = engineClientId({ run_id: 'luca-20260925-101500-aaaa' })
        const second = engineClientId({ run_id: 'luca-20260925-101700-bbbb' })

        expect(first).toContain('luca-20260925-101500-aaaa')
        expect(second).toContain('luca-20260925-101700-bbbb')
        expect(first).not.toBe(second)
    })
})
