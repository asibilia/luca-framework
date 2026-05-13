/**
 * Positive presence scan: asserts that all 5 spawn-site instruction files
 * contain `record-subagent` prose (added in Wave 2 of the subagent telemetry plan).
 * Also asserts that the reviewer subagent's runtime-composed instructions contain
 * the usage self-report directive after the CONSOLIDATED block — matching exactly
 * how launch.ts assembles the prompt (SUBAGENT_SHARED_PREFIX + '\n\n' + sub.instructions).
 *
 * NOTE: The reviewer test uses runtime-composition (importing live modules), NOT
 * source-file scanning. This validates the actual prompt structure the model receives,
 * not just the raw source text. Source-file scanning would give false confidence because
 * SUBAGENT_SHARED_PREFIX is prepended at launch time, which affects positional ordering.
 *
 * This is a POSITIVE scanner (proves required content IS present).
 * Do NOT conflate with `no-luca-leak.test.ts` (a NEGATIVE scanner that checks
 * for anti-patterns that must NOT be present).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { describe, test, expect } from 'bun:test'
import { SUBAGENT_SHARED_PREFIX } from '../subagents/shared-prefix.js'
import { reviewerSubagent } from '../subagents/reviewer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INSTRUCTIONS_DIR = join(__dirname, '..', 'instructions')

// readInstruction reads from the instructions dir (mode instruction files).
// For subagent assertions, use runtime-composition (see describe block below).
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

describe('reviewer subagent runtime-composed instructions contain usage self-report', () => {
    // Compose as launch.ts does: SUBAGENT_SHARED_PREFIX + '\n\n' + sub.instructions
    // This validates the actual prompt structure the model receives, not raw source text.
    const assembled = SUBAGENT_SHARED_PREFIX + '\n\n' + reviewerSubagent.instructions

    test('assembled instructions include <!-- usage: directive (from shared prefix)', () => {
        expect(assembled).toContain('<!-- usage:')
    })

    test('reviewer-specific usage clarification appears after CONSOLIDATED block', () => {
        // The reviewer.ts clarification prose (not the literal <!-- usage: string)
        // references "Core Operating Rules" and anchors placement to the CONSOLIDATED block.
        // Check it appears after CONSOLIDATED: in the assembled prompt.
        const consolidatedPos = assembled.indexOf('CONSOLIDATED:')
        const clarificationPos = assembled.indexOf('Core Operating Rules) is required')
        expect(consolidatedPos).toBeGreaterThan(-1)
        expect(clarificationPos).toBeGreaterThan(-1)
        expect(clarificationPos).toBeGreaterThan(consolidatedPos)
    })
})
