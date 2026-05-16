import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Spawn-site invariant: every mode file that documents `record-subagent`
 * must instruct full field-enumeration form within ~4000 chars of the
 * `Subagent Telemetry` heading (or the first `record-subagent` reference,
 * whichever appears first).
 *
 * Required substrings in the spawn-site region:
 *   - inputTokens
 *   - outputTokens
 *   - model
 *   - success:
 *   - omit
 *
 * Optional but checked: durationMs (advisory only, not asserted).
 *
 * Why: shorthand prose like "Parse usage comment for token counts" leads
 * agents to emit `model: null` and `tokens: 0` placeholder values rather
 * than omit-on-unknown. See PR description for empirical drift evidence.
 */

const INSTRUCTIONS_DIR = join(
    import.meta.dir,
    '..',
    'instructions',
)

const FILES = [
    'execute.md',
    'architect.md',
    'finalize.md',
    'research.md',
    'review.md',
]

const REQUIRED_SUBSTRINGS = [
    'inputTokens',
    'outputTokens',
    'model',
    'success:',
    'omit',
]

const SPAWN_SITE_REGION_CHARS = 4000

function extractSpawnSiteRegion(content: string): string | null {
    // Anchor preference: "Subagent Telemetry" heading, else first
    // "record-subagent" mention. Returns the next ~4000 chars from anchor.
    const headingIdx = content.search(/Subagent Telemetry/i)
    const recordIdx = content.indexOf('record-subagent')
    const anchor =
        headingIdx >= 0 && (recordIdx < 0 || headingIdx < recordIdx)
            ? headingIdx
            : recordIdx
    if (anchor < 0) return null
    return content.slice(anchor, anchor + SPAWN_SITE_REGION_CHARS)
}

describe('spawn-site field-enumeration invariant', () => {
    for (const file of FILES) {
        describe(file, () => {
            const path = join(INSTRUCTIONS_DIR, file)
            const content = readFileSync(path, 'utf-8')
            const region = extractSpawnSiteRegion(content)

            test('has a spawn-site region (Subagent Telemetry heading or record-subagent reference)', () => {
                expect(region).not.toBeNull()
            })

            for (const required of REQUIRED_SUBSTRINGS) {
                test(`spawn-site region contains '${required}'`, () => {
                    expect(region).toBeTruthy()
                    expect(region).toContain(required)
                })
            }

            test('spawn-site region does NOT contain fabricated round-number examples', () => {
                expect(region).toBeTruthy()
                // Known fabricated values from prior drift:
                // 45000, 60000, 90000, 120000 — all multiples of 5000s.
                // Allow `Date.now() - ts` directive itself which is the fix.
                expect(region!).not.toMatch(
                    /durationMs:\s*(45000|60000|75000|90000|120000)\b/,
                )
            })
        })
    }
})
