import { describe, expect, test } from 'bun:test'

import { safeMemory } from './memory-client'

import { createFakeMuninn } from '../testing/fake-muninn'

const ASK = { vault: 'default', query: 'q', limit: 5, threshold: 0.5 }

describe('safeMemory', () => {
    test('gives back what MuninnDB found', async () => {
        const memory = safeMemory({
            deps: {
                client: createFakeMuninn({
                    vaults: {
                        default: [
                            {
                                id: 'm1',
                                concept: 'c',
                                content: 'x',
                                score: 0.7,
                            },
                        ],
                    },
                }),
            },
        })
        expect(await memory.recall(ASK)).toEqual({
            ok: true,
            value: [
                {
                    id: 'm1',
                    concept: 'c',
                    content: 'x',
                    score: 0.7,
                    vector_score: null,
                },
            ],
        })
    })

    test('a throw becomes an error value', async () => {
        const memory = safeMemory({
            deps: { client: createFakeMuninn({ fail: [{ op: 'recall' }] }) },
        })
        expect(await memory.recall(ASK)).toEqual({
            ok: false,
            error: "MuninnDB's recall failed: The fake MuninnDB fails recall in default.",
        })
    })

    test('a call that hangs times out as an error value', async () => {
        const memory = safeMemory({
            deps: {
                client: createFakeMuninn({ hang: [{ vault: 'default' }] }),
                timeout_ms: 20,
            },
        })
        expect(
            await memory.feedback({ vault: 'default', id: 'm1', useful: true })
        ).toEqual({
            ok: false,
            error: "MuninnDB's feedback did not answer within 20 ms.",
        })
    })

    test('with no client, every call fails with a clear error', async () => {
        expect(await safeMemory({ deps: undefined }).recall(ASK)).toEqual({
            ok: false,
            error: 'The engine has no memory client for this run.',
        })
    })
})
