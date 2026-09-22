import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    COMPACT_INSTRUCTIONS_HEADER,
    ensureCompactInstructions,
} from './ensure-compact-instructions.ts'

const countOccurrences = (haystack: string, needle: string): number =>
    haystack.split(needle).length - 1

describe('ensureCompactInstructions', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-compact-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('fresh append writes the block when CLAUDE.md is absent', async () => {
        await ensureCompactInstructions(cwd)

        const content = await readFile(join(cwd, 'CLAUDE.md'), 'utf-8')
        expect(content).toContain(COMPACT_INSTRUCTIONS_HEADER)
        expect(content).toContain('session:phase-boundary-handoff')
        expect(content).toContain('pipelineStep')
        expect(content).toContain('sessionId')
    })

    test('appends the block to an existing CLAUDE.md without the header', async () => {
        const existing = '# My Project\n\nSome existing content.\n'
        await writeFile(join(cwd, 'CLAUDE.md'), existing)

        await ensureCompactInstructions(cwd)

        const content = await readFile(join(cwd, 'CLAUDE.md'), 'utf-8')
        expect(content).toContain('Some existing content.')
        expect(content).toContain(COMPACT_INSTRUCTIONS_HEADER)
        expect(countOccurrences(content, COMPACT_INSTRUCTIONS_HEADER)).toBe(1)
        // Blank-line separator between prior content and the block.
        expect(content).toContain(
            `Some existing content.\n\n${COMPACT_INSTRUCTIONS_HEADER}`
        )
    })

    test('starts the block on its own line when CLAUDE.md lacks a trailing newline', async () => {
        await writeFile(join(cwd, 'CLAUDE.md'), '# My Project')

        await ensureCompactInstructions(cwd)

        const content = await readFile(join(cwd, 'CLAUDE.md'), 'utf-8')
        // The header must not be glued onto the prior content.
        expect(content).toContain('# My Project\n')
        expect(content).not.toContain(`# My Project${COMPACT_INSTRUCTIONS_HEADER}`)
        expect(countOccurrences(content, COMPACT_INSTRUCTIONS_HEADER)).toBe(1)
    })

    test('a deeper heading containing the substring does not false-positive the guard', async () => {
        const existing = '# My Project\n\n### Compact Instructions Notes\n'
        await writeFile(join(cwd, 'CLAUDE.md'), existing)

        await ensureCompactInstructions(cwd)

        const content = await readFile(join(cwd, 'CLAUDE.md'), 'utf-8')
        // The deeper heading must not suppress the append.
        expect(content).toContain('### Compact Instructions Notes')
        // Block was appended (proven by block-unique content).
        expect(content).toContain('session:phase-boundary-handoff')
        // The real `## Compact Instructions` header exists on its own line.
        const hasHeaderLine = content
            .split('\n')
            .some((line) => line.trim() === COMPACT_INSTRUCTIONS_HEADER)
        expect(hasHeaderLine).toBe(true)
    })

    test('re-run is a no-op — the header is never duplicated', async () => {
        await ensureCompactInstructions(cwd)
        await ensureCompactInstructions(cwd)

        const content = await readFile(join(cwd, 'CLAUDE.md'), 'utf-8')
        expect(countOccurrences(content, COMPACT_INSTRUCTIONS_HEADER)).toBe(1)
    })

    test('a user-modified block is left untouched', async () => {
        const userEdited =
            '# My Project\n\n' +
            `${COMPACT_INSTRUCTIONS_HEADER}\n\n` +
            '- Custom user note that should survive.\n'
        await writeFile(join(cwd, 'CLAUDE.md'), userEdited)

        await ensureCompactInstructions(cwd)

        const content = await readFile(join(cwd, 'CLAUDE.md'), 'utf-8')
        expect(content).toBe(userEdited)
        expect(countOccurrences(content, COMPACT_INSTRUCTIONS_HEADER)).toBe(1)
        expect(content).toContain('Custom user note that should survive.')
    })
})
