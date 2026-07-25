import { describe, expect, test } from 'bun:test'

import { createRemoteTransport } from './create-remote-transport.ts'

describe('createRemoteTransport', () => {
    test('every method resolves not-implemented and never throws', async () => {
        const transport = createRemoteTransport()

        const results = [
            await transport.send({ id: 'x_1' }),
            await transport.list(),
            await transport.read('x_1'),
            await transport.updateStatus('x_1', 'accepted', {
                expectedUpdatedAt: '2026-07-21T10:00:00.000Z',
            }),
        ]

        for (const result of results) {
            expect(result.ok).toBe(false)
            if (result.ok) continue
            expect(result.reason).toBe('not-implemented')
            expect(result.message.length).toBeGreaterThan(0)
        }
    })

    test('rejection is a resolved value, not a thrown error', async () => {
        const transport = createRemoteTransport({ address: 'wss://example' })
        // If any method threw, this would reject rather than resolve.
        await expect(transport.list()).resolves.toMatchObject({
            ok: false,
            reason: 'not-implemented',
        })
    })

    test('shares the local transport factory shape', () => {
        const transport = createRemoteTransport()
        expect(typeof transport.send).toBe('function')
        expect(typeof transport.list).toBe('function')
        expect(typeof transport.read).toBe('function')
        expect(typeof transport.updateStatus).toBe('function')
    })
})
