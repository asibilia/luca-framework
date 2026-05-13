/**
 * Positive presence scan: asserts that all 5 spawn-site instruction files
 * contain `record-subagent` prose (added in Wave 2 of the subagent telemetry plan).
 * Also asserts that reviewer.ts contains the usage self-report instruction
 * anchored after the CONSOLIDATED block (so all 4 reviewer perspectives emit it).
 *
 * This is a POSITIVE scanner (proves required content IS present).
 * Do NOT conflate with `no-luca-leak.test.ts` (a NEGATIVE scanner that checks
 * for anti-patterns that must NOT be present).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { describe, test, expect } from 'bun:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INSTRUCTIONS_DIR = join(__dirname, '..', 'instructions')
const SUBAGENTS_DIR = join(__dirname, '..', 'subagents')

function readSubagent(filename: string): string {
    return readFileSync(join(SUBAGENTS_DIR, filename), 'utf-8')
}

function readInstruction(filename: string): string {
    return readFileSync(join(INSTRUCTIONS_DIR, filename), 'utf-8')
}

describe('execute.md contains record-subagent prose', () => {
    test('file includes record-subagent', () => {
        expect(readInstruction('execute.md')).toContain('record-subagent')
    })
})

describe('architect.md contains record-subagent prose', () => {
    test('file includes record-subagent', () => {
        expect(readInstruction('architect.md')).toContain('record-subagent')
    })
})

describe('research.md contains record-subagent prose', () => {
    test('file includes record-subagent', () => {
        expect(readInstruction('research.md')).toContain('record-subagent')
    })
})

describe('review.md contains record-subagent prose', () => {
    test('file includes record-subagent', () => {
        expect(readInstruction('review.md')).toContain('record-subagent')
    })
})

describe('finalize.md contains record-subagent prose', () => {
    test('file includes record-subagent', () => {
        expect(readInstruction('finalize.md')).toContain('record-subagent')
    })
})

describe('reviewer.ts contains usage self-report instruction', () => {
    test('file includes <!-- usage: instruction', () => {
        const src = readSubagent('reviewer.ts')
        expect(src).toContain('<!-- usage:')
    })

    test('usage instruction appears after CONSOLIDATED block (positional guard)', () => {
        const src = readSubagent('reviewer.ts')
        const consolidatedPos = src.indexOf('CONSOLIDATED:')
        const usagePos = src.indexOf('<!-- usage:')
        expect(consolidatedPos).toBeGreaterThan(-1)
        expect(usagePos).toBeGreaterThan(-1)
        // usage instruction must come AFTER the CONSOLIDATED block
        expect(usagePos).toBeGreaterThan(consolidatedPos)
    })
})
