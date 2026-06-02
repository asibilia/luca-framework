import { describe, expect, test } from 'bun:test'

import {
    isLegalTransition,
    PIPELINE_TRANSITIONS,
} from './pipeline-transitions.ts'

describe('PIPELINE_TRANSITIONS', () => {
    test('every canonical step has at least one allowed transition', () => {
        for (const [, nexts] of Object.entries(PIPELINE_TRANSITIONS)) {
            expect(nexts.length).toBeGreaterThan(0)
            expect(nexts.length).toBeLessThan(10) // sanity
        }
    })

    test('only "finalize" can transition back to idle', () => {
        for (const [from, nexts] of Object.entries(PIPELINE_TRANSITIONS)) {
            if (from === 'finalize') {
                expect(nexts).toContain('idle')
            } else {
                expect(nexts).not.toContain('idle')
            }
        }
    })

    test('canonical forward flow', () => {
        expect(isLegalTransition('idle', 'triage')).toBe(true)
        expect(isLegalTransition('triage', 'research')).toBe(true)
        expect(isLegalTransition('research', 'discuss')).toBe(true)
        expect(isLegalTransition('discuss', 'architect')).toBe(true)
        expect(isLegalTransition('architect', 'plan')).toBe(true)
        expect(isLegalTransition('plan', 'plan-review')).toBe(true)
        expect(isLegalTransition('plan-review', 'execute')).toBe(true)
        expect(isLegalTransition('execute', 'checks')).toBe(true)
        expect(isLegalTransition('checks', 'verify')).toBe(true)
        expect(isLegalTransition('verify', 'review')).toBe(true)
        expect(isLegalTransition('review', 'learn')).toBe(true)
        expect(isLegalTransition('learn', 'finalize')).toBe(true)
        expect(isLegalTransition('finalize', 'idle')).toBe(true)
    })

    test('loop-back transitions for fix cycles', () => {
        expect(isLegalTransition('plan-review', 'plan')).toBe(true)
        expect(isLegalTransition('checks', 'execute')).toBe(true)
        expect(isLegalTransition('verify', 'checks')).toBe(true)
        expect(isLegalTransition('review', 'execute')).toBe(true) // MUST-FIX / SHOULD-FIX iteration
        expect(isLegalTransition('learn', 'plan')).toBe(true) // next phase
        expect(isLegalTransition('learn', 'finalize')).toBe(true) // last phase done
        expect(isLegalTransition('finalize', 'execute')).toBe(true) // gap/postmortem re-entry
        expect(isLegalTransition('finalize', 'review')).toBe(true) // gap re-entry
        expect(isLegalTransition('research', 'research')).toBe(true) // re-research
    })

    test('illegal jumps are rejected', () => {
        expect(isLegalTransition('idle', 'execute')).toBe(false)
        expect(isLegalTransition('plan', 'execute')).toBe(false) // must go via plan-review
        expect(isLegalTransition('execute', 'finalize')).toBe(false) // must run the full review path
        expect(isLegalTransition('triage', 'finalize')).toBe(false)
        expect(isLegalTransition('idle', 'idle')).toBe(false)
    })
})
