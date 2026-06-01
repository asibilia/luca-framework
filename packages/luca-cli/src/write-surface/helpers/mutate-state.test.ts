import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { mutateState, withStateLock } from './mutate-state.ts'

describe('mutateState', () => {
    let cwd: string
    const statePath = () => join(cwd, '.luca/state.json')
    const writeState = (s: unknown) =>
        writeFile(statePath(), JSON.stringify(s))
    const readState = async () =>
        JSON.parse(await readFile(statePath(), 'utf-8'))
    const baseState = {
        pipelineStep: 'idle',
        currentPhase: 0,
        totalPhases: 99,
        roadmap: [],
    }

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mutate-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })
    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('serializes concurrent mutations — no lost updates', async () => {
        await writeState(baseState)
        // Without the lock, these read-modify-writes would race and the final
        // value would be < N (lost updates) — the v13 state-reversion bug.
        const N = 30
        await Promise.all(
            Array.from({ length: N }, () =>
                mutateState(cwd, (s) => ({
                    ...s,
                    currentPhase: s.currentPhase + 1,
                }))
            )
        )
        expect((await readState()).currentPhase).toBe(N)
    })

    test('releases the lock after each mutation (no leftover lock file)', async () => {
        await writeState(baseState)
        await mutateState(cwd, (s) => ({ ...s, currentPhase: 1 }))
        expect(existsSync(join(cwd, '.luca/state.json.lock'))).toBe(false)
    })

    test('strict: throws on missing state.json (does NOT write defaults)', async () => {
        // .luca/ exists but state.json does not.
        await expect(mutateState(cwd, (s) => s)).rejects.toThrow()
        expect(existsSync(statePath())).toBe(false)
    })

    test('strict: throws on malformed state.json and does not overwrite it', async () => {
        await writeFile(statePath(), '{ this is not valid json')
        await expect(mutateState(cwd, (s) => s)).rejects.toThrow()
        // The malformed file is left untouched (not clobbered with defaults).
        expect(await readFile(statePath(), 'utf-8')).toContain('not valid json')
    })

    test('withStateLock runs the body and releases the lock', async () => {
        let ran = false
        await withStateLock(cwd, async () => {
            ran = true
            expect(existsSync(join(cwd, '.luca/state.json.lock'))).toBe(true)
        })
        expect(ran).toBe(true)
        expect(existsSync(join(cwd, '.luca/state.json.lock'))).toBe(false)
    })
})
