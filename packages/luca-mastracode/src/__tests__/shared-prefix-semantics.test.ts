import { describe, expect, test } from 'bun:test'

/**
 * Runtime invariants on SUBAGENT_SHARED_PREFIX content.
 *
 * Why this file exists: prose drift in shared-prefix.ts cascades 9× across
 * every subagent batch. The Luca Reminders block must consistently
 * communicate: (1) field-completeness via omit-on-unknown, (2) success
 * outcome mapping, (3) durationMs computation. If any of these directives
 * regress, agents produce telemetry with `model: null`, `tokens: 0`, or
 * `success: null`.
 */

describe('SUBAGENT_SHARED_PREFIX semantics', () => {
    test('contains omit-on-unknown directive', async () => {
        const { SUBAGENT_SHARED_PREFIX } =
            await import('../subagents/shared-prefix.js')
        expect(SUBAGENT_SHARED_PREFIX).toContain('omit')
    })

    test('contains never-emit-placeholder directive', async () => {
        const { SUBAGENT_SHARED_PREFIX } =
            await import('../subagents/shared-prefix.js')
        expect(SUBAGENT_SHARED_PREFIX).toContain('never emit')
    })

    test('contains completed* outcome mapping', async () => {
        const { SUBAGENT_SHARED_PREFIX } =
            await import('../subagents/shared-prefix.js')
        expect(SUBAGENT_SHARED_PREFIX).toContain('completed*')
    })

    test('contains Date.now() - ts durationMs directive', async () => {
        const { SUBAGENT_SHARED_PREFIX } =
            await import('../subagents/shared-prefix.js')
        expect(SUBAGENT_SHARED_PREFIX).toContain('Date.now() - ts')
    })

    test('total size stays under 2900 chars (tighter than existing 3000 guard)', async () => {
        const { SUBAGENT_SHARED_PREFIX } =
            await import('../subagents/shared-prefix.js')
        expect(SUBAGENT_SHARED_PREFIX.length).toBeLessThan(2900)
    })
})
