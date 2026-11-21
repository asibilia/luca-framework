import { describe, expect, test } from 'bun:test'

import { limitWaitComment, windowName } from './limit-wait'

describe('limit-wait windowName (#779 AC7)', () => {
    test('maps agy_quota to Antigravity quota and preserves existing Claude windows', () => {
        expect(windowName({ rate_limit_type: 'agy_quota' })).toBe(
            'Antigravity quota'
        )
        expect(windowName({ rate_limit_type: 'five_hour' })).toBe('five-hour')
        expect(windowName({ rate_limit_type: 'seven_day' })).toBe('weekly')
        expect(windowName({ rate_limit_type: 'seven_day_opus' })).toBe(
            'weekly Opus'
        )
        expect(windowName({ rate_limit_type: 'seven_day_sonnet' })).toBe(
            'weekly Sonnet'
        )
        expect(windowName({ rate_limit_type: null })).toBe('unnamed')
        expect(windowName({ rate_limit_type: 'overage' })).toBe('overage')
    })

    test('limitWaitComment includes Antigravity quota wording', () => {
        const comment = limitWaitComment({
            rate_limit_type: 'agy_quota',
            resets_at: '2026-11-20T17:00:00.000Z',
            until: '2026-11-20T17:01:00.000Z',
        })
        expect(comment).toContain('Antigravity quota usage limit')
    })
})
