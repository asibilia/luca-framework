import { describe, expect, test } from 'bun:test'

import { AGY_CONFIG } from './agy-launcher-helpers'
import { createProviderLauncher } from './provider-launcher'

describe('createProviderLauncher (AC8)', () => {
    test('returns Claude launcher for claude and Antigravity launcher for agy', async () => {
        const claude = createProviderLauncher({ provider: 'claude' })
        const agy = createProviderLauncher({ provider: 'agy' })

        expect(typeof claude.launch).toBe('function')
        expect(typeof claude.followUp).toBe('function')
        expect(typeof claude.closeSession).toBe('function')
        expect(typeof claude.closeAll).toBe('function')

        expect(typeof agy.launch).toBe('function')
        expect(typeof agy.followUp).toBe('function')
        expect(typeof agy.closeSession).toBe('function')
        expect(typeof agy.closeAll).toBe('function')

        // Cross-provider model refusal proves which launcher each provider returns
        // without spawning any live CLI process.
        const claude_refused = await claude.launch({
            role: 'implementer',
            ticket: 1,
            prompt: 'Hi',
            cwd: process.cwd(),
            may_edit_tests: false,
            config: AGY_CONFIG,
            messaging: null,
            model: 'gemini-4-neon-high',
            effort: 'medium',
        })
        expect(claude_refused).toMatchObject({
            ok: false,
            failure: 'stop',
            error: expect.stringContaining('opus, sonnet, haiku'),
        })

        const agy_refused = await agy.launch({
            role: 'implementer',
            ticket: 1,
            prompt: 'Hi',
            cwd: process.cwd(),
            may_edit_tests: false,
            config: AGY_CONFIG,
            messaging: null,
            model: 'opus',
            effort: 'medium',
        })
        expect(agy_refused).toMatchObject({
            ok: false,
            failure: 'stop',
            error: expect.stringContaining(
                'gemini-4-neon-high, gemini-4-argon-high, gemini-3.8-flash-high'
            ),
        })

        await claude.closeAll?.()
        await agy.closeAll?.()
    })
})
