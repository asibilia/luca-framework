import { describe, expect, test } from 'bun:test'

import { engineClientId } from './paseo-board-link'

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
