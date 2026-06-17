import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaPrOutcomeTool } from './luca-pr-outcome.ts'

interface PrOutcomePayload {
    prNumber: number
    result: 'merged' | 'reverted'
    reviewRounds: number
    timeToMergeMs: number
    branch?: string
    issue?: number
    originRunId?: string
}

function basePayload(overrides: Partial<PrOutcomePayload> = {}): PrOutcomePayload {
    return {
        prNumber: 306,
        result: 'merged',
        reviewRounds: 2,
        timeToMergeMs: 3_600_000,
        branch: 'feat/pr-outcome-writeback',
        issue: 15,
        originRunId: 'run-abc123',
        ...overrides,
    }
}

/** Read and JSON-parse every line of the fixed pr-outcomes.jsonl log. */
async function readOutcomeLog(cwd: string): Promise<Record<string, unknown>[]> {
    const content = await readFile(
        join(cwd, '.luca/telemetry/pr-outcomes.jsonl'),
        'utf-8'
    )
    return content
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe('pr-outcome', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-pr-outcome-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('round-trips a merged result', async () => {
        const r = await lucaPrOutcomeTool.handler(
            basePayload({ result: 'merged' }),
            { cwd }
        )
        expect(r.isError).toBeFalsy()
        const lines = await readOutcomeLog(cwd)
        expect(lines).toHaveLength(1)
        const [record] = lines
        expect((record!.meta as Record<string, unknown>).result).toBe('merged')
    })

    test('round-trips the full optional field set (branch/issue/originRunId)', async () => {
        await lucaPrOutcomeTool.handler(
            basePayload({
                branch: 'feat/full-payload',
                issue: 42,
                originRunId: 'run-full-xyz',
            }),
            { cwd }
        )
        const [record] = await readOutcomeLog(cwd)
        const meta = record!.meta as Record<string, unknown>
        expect(meta.branch).toBe('feat/full-payload')
        expect(meta.issue).toBe(42)
        expect(meta.originRunId).toBe('run-full-xyz')
    })

    test('omits absent optional fields from meta', async () => {
        await lucaPrOutcomeTool.handler(
            {
                prNumber: 306,
                result: 'merged',
                reviewRounds: 2,
                timeToMergeMs: 3_600_000,
            },
            { cwd }
        )
        const [record] = await readOutcomeLog(cwd)
        const meta = record!.meta as Record<string, unknown>
        expect('branch' in meta).toBe(false)
        expect('issue' in meta).toBe(false)
        expect('originRunId' in meta).toBe(false)
    })

    test('round-trips a reverted result', async () => {
        const r = await lucaPrOutcomeTool.handler(
            basePayload({ result: 'reverted' }),
            { cwd }
        )
        expect(r.isError).toBeFalsy()
        const [record] = await readOutcomeLog(cwd)
        expect((record!.meta as Record<string, unknown>).result).toBe(
            'reverted'
        )
    })

    test('round-trips reviewRounds', async () => {
        await lucaPrOutcomeTool.handler(basePayload({ reviewRounds: 7 }), {
            cwd,
        })
        const [record] = await readOutcomeLog(cwd)
        expect((record!.meta as Record<string, unknown>).reviewRounds).toBe(7)
    })

    test('round-trips timeToMergeMs', async () => {
        await lucaPrOutcomeTool.handler(
            basePayload({ timeToMergeMs: 123_456 }),
            { cwd }
        )
        const [record] = await readOutcomeLog(cwd)
        expect((record!.meta as Record<string, unknown>).timeToMergeMs).toBe(
            123_456
        )
    })

    test('writes top-level kind=pr.outcome and runId=pr-outcomes', async () => {
        await lucaPrOutcomeTool.handler(basePayload(), { cwd })
        const [record] = await readOutcomeLog(cwd)
        expect(record!.kind).toBe('pr.outcome')
        expect(record!.runId).toBe('pr-outcomes')
    })

    test('rejects an invalid result enum value', () => {
        const r = lucaPrOutcomeTool.inputSchema.safeParse({
            ...basePayload(),
            result: 'closed-without-merge',
        })
        expect(r.success).toBe(false)
    })

    test('rejects a payload missing a required field (prNumber)', () => {
        const { prNumber: _omit, ...withoutPrNumber } = basePayload()
        const r = lucaPrOutcomeTool.inputSchema.safeParse(withoutPrNumber)
        expect(r.success).toBe(false)
    })
})
