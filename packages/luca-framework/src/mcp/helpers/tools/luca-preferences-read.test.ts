import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaPreferencesReadTool } from './luca-preferences-read.ts'

describe('luca_preferences_read', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-prefs-read-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('returns schema defaults when config.json is missing', async () => {
        const r = await lucaPreferencesReadTool.handler({}, { cwd })

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.schemaVersion).toBe(1)
        expect(parsed.branching.defaultBranch).toBe('main')
        expect(parsed.commits.convention).toBe('conventional')
    })

    test('returns schema defaults when config.json has no preferences key', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({ lucaVersion: '12.0.0', vault: null })
        )

        const r = await lucaPreferencesReadTool.handler({}, { cwd })

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.branching.defaultBranch).toBe('main')
    })

    test('returns merged values when preferences are set', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({
                preferences: {
                    branching: { defaultBranch: 'trunk' },
                    tracker: { kind: 'linear' },
                },
            })
        )

        const r = await lucaPreferencesReadTool.handler({}, { cwd })

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.branching.defaultBranch).toBe('trunk')
        expect(parsed.tracker.kind).toBe('linear')
        // Defaults still applied to unset sections.
        expect(parsed.commits.convention).toBe('conventional')
    })

    test('returns isError when preferences fail schema validation', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({
                preferences: {
                    // Newlines are blocked by SAFE_FREEFORM.
                    branching: { defaultBranch: 'bad\nname' },
                },
            })
        )

        const r = await lucaPreferencesReadTool.handler({}, { cwd })

        expect(r.isError).toBe(true)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaPreferencesReadTool.allowedPhases).toBeUndefined()
    })
})
