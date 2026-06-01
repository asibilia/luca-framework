import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaPhaseArchiveTool } from './luca-phase-archive.ts'

describe('lucaPhaseArchiveTool', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-archive-'))
    })
    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('moves phase dirs into .luca/archive/', async () => {
        await mkdir(join(cwd, '.luca/phases/01-x'), { recursive: true })
        await writeFile(join(cwd, '.luca/phases/01-x/research.md'), 'r')
        await mkdir(join(cwd, '.luca/phases/02-y'), { recursive: true })

        await lucaPhaseArchiveTool.handler({}, { cwd })

        expect(existsSync(join(cwd, '.luca/phases/01-x'))).toBe(false)
        expect(existsSync(join(cwd, '.luca/archive/01-x/research.md'))).toBe(
            true
        )
        expect(existsSync(join(cwd, '.luca/archive/02-y'))).toBe(true)
    })

    test('skips a slug already present under archive/ (never overwrites)', async () => {
        await mkdir(join(cwd, '.luca/phases/01-x'), { recursive: true })
        await writeFile(join(cwd, '.luca/phases/01-x/new.md'), 'new')
        await mkdir(join(cwd, '.luca/archive/01-x'), { recursive: true })
        await writeFile(join(cwd, '.luca/archive/01-x/old.md'), 'old')

        await lucaPhaseArchiveTool.handler({}, { cwd })

        // Collision → the live dir stays put and the frozen archive is intact.
        expect(existsSync(join(cwd, '.luca/phases/01-x/new.md'))).toBe(true)
        expect(existsSync(join(cwd, '.luca/archive/01-x/old.md'))).toBe(true)
        expect(existsSync(join(cwd, '.luca/archive/01-x/new.md'))).toBe(false)
    })

    test('no-op when .luca/phases/ is absent', async () => {
        const r = await lucaPhaseArchiveTool.handler({}, { cwd })
        expect(r.isError).toBeUndefined()
    })
})
