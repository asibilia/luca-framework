import { describe, expect, test } from 'bun:test'

import { HandoffStatus } from '../schemas.ts'
import {
    HANDOFF_TRANSITIONS,
    isLegalHandoffTransition,
} from './handoff-transitions.ts'

const statuses = [...HandoffStatus.options]
const registryKeys = Object.keys(HANDOFF_TRANSITIONS) as HandoffStatus[]
const TERMINAL: HandoffStatus[] = ['complete', 'rejected', 'cancelled']

describe('handoff transitions — invariant 1: every status is a registry key', () => {
    test.each(statuses)('status %s ∈ HANDOFF_TRANSITIONS keys', (status) => {
        const registered = status in HANDOFF_TRANSITIONS
        // On failure the diff names the unregistered status explicitly.
        expect({ status, registered }).toEqual({ status, registered: true })
    })
})

describe('handoff transitions — invariant 2: every registry key is a status', () => {
    test.each(registryKeys)('key %s ∈ HandoffStatus members', (status) => {
        const registered = HandoffStatus.safeParse(status).success
        expect({ status, registered }).toEqual({ status, registered: true })
    })
})

describe('handoff transitions — invariant 3: every target is a valid status', () => {
    test.each(registryKeys)('HANDOFF_TRANSITIONS[%s] targets', (status) => {
        const invalid = HANDOFF_TRANSITIONS[status].filter(
            (target) => !HandoffStatus.safeParse(target).success
        )
        expect({ status, invalid }).toEqual({ status, invalid: [] })
    })
})

describe('handoff transitions — invariant 4: terminal statuses have no exits', () => {
    test.each(registryKeys)('terminality of %s', (status) => {
        const terminal = TERMINAL.includes(status)
        const exits = HANDOFF_TRANSITIONS[status].length
        expect({ status, hasExits: exits > 0 }).toEqual({
            status,
            hasExits: !terminal,
        })
    })
})

describe('handoff transitions — invariant 5: no unreachable status', () => {
    const reachable = new Set(Object.values(HANDOFF_TRANSITIONS).flat())

    test.each(statuses)('status %s is reachable', (status) => {
        // `pending` is the initial status — reached by `send`, not by a transition.
        const registered = status === 'pending' || reachable.has(status)
        expect({ status, registered }).toEqual({ status, registered: true })
    })
})

describe('isLegalHandoffTransition', () => {
    test('accepts a declared edge and rejects an undeclared one', () => {
        expect(isLegalHandoffTransition('pending', 'accepted')).toBe(true)
        expect(isLegalHandoffTransition('failed', 'in-progress')).toBe(true)
        expect(isLegalHandoffTransition('pending', 'complete')).toBe(false)
        expect(isLegalHandoffTransition('complete', 'in-progress')).toBe(false)
    })
})
