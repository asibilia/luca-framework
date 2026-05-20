import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { lucaStateReadTool } from './luca-state-read.ts'

describe('luca_state_read', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-state-read-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('descriptor has expected name and is allowed in all phases', () => {
        expect(lucaStateReadTool.name).toBe('luca_state_read')
        // Read-only — no allowedPhases (or covers everything)
        expect(lucaStateReadTool.allowedPhases).toBeUndefined()
    })

    test('returns the parsed state as JSON text content', async () => {
        await mkdir(join(cwd, '.luca'), { recursive: true })
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'plan', currentPhase: 2 }),
        )

        const result = await lucaStateReadTool.handler({}, { cwd })

        expect(result.isError).toBeFalsy()
        expect(result.content[0]?.type).toBe('text')
        const text = (result.content[0] as { text: string }).text
        const parsed = JSON.parse(text)
        expect(parsed.pipelineStep).toBe('plan')
        expect(parsed.currentPhase).toBe(2)
    })

    test('returns idle defaults when state.json missing', async () => {
        const result = await lucaStateReadTool.handler({}, { cwd })

        expect(result.isError).toBeFalsy()
        const text = (result.content[0] as { text: string }).text
        expect(JSON.parse(text).pipelineStep).toBe('idle')
    })
})
