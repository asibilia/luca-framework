import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
    startPhase,
    advanceWave,
    completePhase,
    readLucaState,
} from '../state/luca-store.js'

let tmpRoot: string
let originalCwd: string

beforeEach(() => {
    originalCwd = process.cwd()
    tmpRoot = mkdtempSync(join(tmpdir(), 'luca-store-test-'))
    process.chdir(tmpRoot)
})

afterEach(() => {
    process.chdir(originalCwd)
    if (existsSync(tmpRoot)) {
        rmSync(tmpRoot, { recursive: true, force: true })
    }
})

describe('luca-store — waveStartedAt lifecycle', () => {
    test('startPhase (new-phase branch) sets waveStartedAt on new phaseResult', () => {
        startPhase({ name: 'Phase 1: Test' })
        const state = readLucaState()
        const phase = state.phaseResults?.find(
            (r) => r.name === 'Phase 1: Test'
        )
        expect(phase).toBeDefined()
        expect(phase!.waveStartedAt).toBeDefined()
        expect(phase!.waveStartedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        // For a new phase, startedAt and waveStartedAt should equal.
        expect(phase!.waveStartedAt).toBe(phase!.startedAt)
    })

    test('startPhase (RESUME branch) RESETS waveStartedAt on resumed phaseResult', async () => {
        // First, start the phase to populate it.
        startPhase({ name: 'Phase 1: Test' })
        const initialState = readLucaState()
        const initialWaveStart = initialState.phaseResults?.find(
            (r) => r.name === 'Phase 1: Test'
        )?.waveStartedAt
        expect(initialWaveStart).toBeDefined()

        // Wait a moment so timestamps differ.
        await new Promise((r) => setTimeout(r, 10))

        // Resume by calling startPhase again on the same in-progress phase.
        startPhase({ name: 'Phase 1: Test' })
        const resumedState = readLucaState()
        const resumedWaveStart = resumedState.phaseResults?.find(
            (r) => r.name === 'Phase 1: Test'
        )?.waveStartedAt

        expect(resumedWaveStart).toBeDefined()
        expect(resumedWaveStart).not.toBe(initialWaveStart) // reset!
        expect(new Date(resumedWaveStart!).getTime()).toBeGreaterThan(
            new Date(initialWaveStart!).getTime()
        )
        // currentWave should also reset to 1.
        expect(resumedState.currentWave).toBe(1)
    })

    test('advanceWave updates waveStartedAt on current phaseResult (via .find)', async () => {
        startPhase({ name: 'Phase 1: Test' })
        const w1Start = readLucaState().phaseResults?.find(
            (r) => r.name === 'Phase 1: Test'
        )?.waveStartedAt
        expect(w1Start).toBeDefined()

        await new Promise((r) => setTimeout(r, 10))

        advanceWave()
        const stateAfter = readLucaState()
        const w2Start = stateAfter.phaseResults?.find(
            (r) => r.name === 'Phase 1: Test'
        )?.waveStartedAt

        expect(w2Start).toBeDefined()
        expect(w2Start).not.toBe(w1Start)
        expect(new Date(w2Start!).getTime()).toBeGreaterThan(
            new Date(w1Start!).getTime()
        )
        expect(stateAfter.currentWave).toBe(2)
    })

    test('completePhase preserves waveStartedAt on completed phaseResult', () => {
        startPhase({ name: 'Phase 1: Test' })
        const beforeComplete = readLucaState().phaseResults?.find(
            (r) => r.name === 'Phase 1: Test'
        )?.waveStartedAt
        expect(beforeComplete).toBeDefined()

        completePhase({ verificationPassed: true })
        const afterComplete = readLucaState().phaseResults?.find(
            (r) => r.name === 'Phase 1: Test'
        )
        expect(afterComplete!.status).toBe('complete')
        // waveStartedAt should still be set (so post-complete consumers can
        // compute final wave duration if they need to).
        expect(afterComplete!.waveStartedAt).toBe(beforeComplete)
    })
})
