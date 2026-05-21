import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ProjectPreferences } from '@alecsibilia/luca-core'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaPreferencesWriteTool } from './luca-preferences-write.ts'

async function readConfig(cwd: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(cwd, '.luca/config.json'), 'utf-8'))
}

describe('luca_preferences_write', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-prefs-write-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes a fresh preferences section when config.json is missing', async () => {
        const r = await lucaPreferencesWriteTool.handler(
            {
                preferences: {
                    branching: { defaultBranch: 'trunk' },
                },
            },
            { cwd }
        )

        expect(r.isError).toBeFalsy()
        const config = await readConfig(cwd)
        const prefs = config.preferences as ProjectPreferences
        expect(prefs.branching.defaultBranch).toBe('trunk')
        // Defaults applied to unspecified sections.
        expect(prefs.commits.convention).toBe('conventional')
    })

    test('shallow-merges sections with existing preferences', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({
                preferences: {
                    branching: {
                        defaultBranch: 'main',
                        types: ['feat', 'fix'],
                    },
                    tracker: { kind: 'linear' },
                },
            })
        )

        const r = await lucaPreferencesWriteTool.handler(
            {
                preferences: {
                    branching: { defaultBranch: 'trunk' },
                },
            },
            { cwd }
        )

        expect(r.isError).toBeFalsy()
        const prefs = (await readConfig(cwd)).preferences as ProjectPreferences
        expect(prefs.branching.defaultBranch).toBe('trunk')
        // tracker section unchanged.
        expect(prefs.tracker.kind).toBe('linear')
    })

    test('preserves other top-level keys in config.json', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({
                lucaVersion: '12.0.0',
                vault: 'my-project',
                oversight: 'checkpoint',
            })
        )

        const r = await lucaPreferencesWriteTool.handler(
            { preferences: { tracker: { kind: 'github' } } },
            { cwd }
        )

        expect(r.isError).toBeFalsy()
        const config = await readConfig(cwd)
        expect(config.lucaVersion).toBe('12.0.0')
        expect(config.vault).toBe('my-project')
        expect(config.oversight).toBe('checkpoint')
        expect((config.preferences as ProjectPreferences).tracker.kind).toBe(
            'github'
        )
    })

    test('rejects unsafe free-form values via schema', async () => {
        const r = await lucaPreferencesWriteTool.handler(
            {
                preferences: {
                    branching: { defaultBranch: 'bad\nname' },
                },
            },
            { cwd }
        )

        expect(r.isError).toBe(true)
    })

    test('rejects ReDoS-shaped regex in branchTypes.match', async () => {
        const r = await lucaPreferencesWriteTool.handler(
            {
                preferences: {
                    branching: {
                        branchTypes: [
                            {
                                match: '(a+)+',
                                template: 'x',
                                base: { kind: 'static' },
                                prBase: { kind: 'static' },
                            },
                        ],
                    },
                },
            },
            { cwd }
        )

        expect(r.isError).toBe(true)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaPreferencesWriteTool.allowedPhases).toBeUndefined()
    })
})
