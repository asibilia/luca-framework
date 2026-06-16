/**
 * Regression guard for the v13 `.ts` mode surface (phase
 * 01-recall-outcome-attribution, Wave 1).
 *
 * Wave 1 added a runnable `record-recall` telemetry directive to all 5 mode
 * artifact bodies (triage, architect, execute, review, finalize). This suite
 * asserts each mode INDEPENDENTLY (one test per mode) so the suite fails if
 * ANY SINGLE mode loses a required token — not an aggregate "≥1 mode has it".
 *
 * Token contract (per mode body):
 *   - `luca telemetry emit`        — the emit invocation
 *   - `--kind recall.`             — the recall.hit/recall.miss kind
 *   - `--run-id`                   — the REQUIRED flag
 *   - 6 meta keys: query, resultCount, verifiedCount, vault, callerMode,
 *     durationMs
 *
 * The `recalledIds present per mode` block (ac-14 guard) has `recalledIds` in
 * its test names so `bun test -t recalledIds` matches at least one test and
 * cannot exit 0 vacuously.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, test, expect } from 'bun:test'

const MODES = ['triage', 'architect', 'execute', 'review', 'finalize'] as const

const REQUIRED_TOKENS = [
    'luca telemetry emit',
    '--kind recall.',
    '--run-id',
    'query',
    'resultCount',
    'verifiedCount',
    'vault',
    'callerMode',
    'durationMs',
] as const

const readModeBody = (mode: string): string =>
    readFileSync(join(import.meta.dir, `${mode}.ts`), 'utf8')

describe('runnable record-recall directive per mode', () => {
    for (const mode of MODES) {
        test(`${mode} carries runnable record-recall directive`, () => {
            const body = readModeBody(mode)
            for (const token of REQUIRED_TOKENS) {
                expect(body).toContain(token)
            }
        })
    }
})

describe('recalledIds present per mode', () => {
    for (const mode of MODES) {
        test(`${mode} meta includes recalledIds`, () => {
            const body = readModeBody(mode)
            expect(body).toContain('recalledIds')
        })
    }
})
