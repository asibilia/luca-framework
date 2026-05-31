import { describe, expect, test } from 'bun:test'

import { RunIdSchema } from '../../luca-dir/index.ts'

import { generateRunId } from './generate-run-id.ts'

describe('generateRunId', () => {
    test('produces a run_<ts>_<rand> base36 identifier', () => {
        expect(generateRunId()).toMatch(/^run_[0-9a-z]+_[0-9a-z]+$/)
    })

    test('produces a value accepted by RunIdSchema', () => {
        expect(RunIdSchema.safeParse(generateRunId()).success).toBe(true)
    })

    test('produces distinct ids across many calls', () => {
        const ids = new Set(
            Array.from({ length: 200 }, () => generateRunId())
        )
        expect(ids.size).toBe(200)
    })
})
