import { describe, expect, test } from 'bun:test'

import { currentStepText } from '../shared/board-state'

/**
 * How long the current step has been running (#403), in words: the panel
 * and the chat rows show it from the step's `since` and the clock.
 */

describe('the current step in words', () => {
    test('a step running for two minutes shows its step and its time', () => {
        const text = currentStepText({
            step: {
                text: 'running the baseline tests',
                since: '2026-09-23T12:00:00.000Z',
            },
            now: Date.parse('2026-09-23T12:02:05.000Z'),
        })

        expect(text).toContain('running the baseline tests')
        expect(text).toContain('2m')
    })

    test('a step running over an hour shows its hours and minutes', () => {
        const text = currentStepText({
            step: {
                text: 'waiting for the implementer',
                since: '2026-09-23T12:00:00.000Z',
            },
            now: Date.parse('2026-09-23T13:03:10.000Z'),
        })

        expect(text).toContain('waiting for the implementer')
        expect(text).toContain('1h')
        expect(text).toContain('3m')
    })

    test('the time grows while the step keeps running', () => {
        const step = {
            text: 'running the checks',
            since: '2026-09-23T12:00:00.000Z',
        }

        const early = currentStepText({
            step,
            now: Date.parse('2026-09-23T12:04:00.000Z'),
        })
        const later = currentStepText({
            step,
            now: Date.parse('2026-09-23T12:09:00.000Z'),
        })

        expect(early).toContain('4m')
        expect(later).toContain('9m')
        expect(later).not.toBe(early)
    })
})
