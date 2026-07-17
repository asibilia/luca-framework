import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    enrichTraceMetadata,
    mergeTraceMetadata,
} from './enrich-trace-metadata.ts'

const IDS = { repo: 'fixture-repo', lucaVersion: '9.9.9' }

describe('mergeTraceMetadata', () => {
    test('undefined existing metadata yields luca keys + defaults', () => {
        const merged = mergeTraceMetadata(undefined, IDS)
        expect(merged).toEqual({
            environment: 'production',
            ls_message_format: 'anthropic',
            repo: 'fixture-repo',
            luca_version: '9.9.9',
        })
    })

    test('pre-existing user custom_billing_team key survives the merge (collision: user wins)', () => {
        const merged = mergeTraceMetadata(
            JSON.stringify({
                custom_billing_team: 'infra-observability',
                environment: 'staging',
            }),
            IDS
        )
        // User-authored key preserved verbatim.
        expect(merged?.['custom_billing_team']).toBe('infra-observability')
        // Fill-if-absent default does NOT clobber the user's value.
        expect(merged?.['environment']).toBe('staging')
        // Absent default still fills.
        expect(merged?.['ls_message_format']).toBe('anthropic')
    })

    test('luca-owned repo + luca_version always refresh, even when pre-existing', () => {
        const merged = mergeTraceMetadata(
            JSON.stringify({ repo: 'stale-repo', luca_version: '0.0.1' }),
            IDS
        )
        expect(merged?.['repo']).toBe('fixture-repo')
        expect(merged?.['luca_version']).toBe('9.9.9')
    })

    test('malformed metadata JSON returns null (caller must skip)', () => {
        expect(mergeTraceMetadata('{not json', IDS)).toBeNull()
    })

    test('metadata JSON that is not a plain object returns null', () => {
        expect(mergeTraceMetadata('["array"]', IDS)).toBeNull()
        expect(mergeTraceMetadata('"string"', IDS)).toBeNull()
    })
})

describe('enrichTraceMetadata', () => {
    let cwd: string
    let claudeHome: string
    let savedTraceEnv: string | undefined

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-enrich-cwd-'))
        claudeHome = await mkdtemp(join(tmpdir(), 'luca-enrich-home-'))
        // The gate falls back to process.env.TRACE_TO_LANGSMITH — clear it
        // so each test controls the gate exclusively via claudeHome.
        savedTraceEnv = process.env['TRACE_TO_LANGSMITH']
        delete process.env['TRACE_TO_LANGSMITH']
    })

    afterEach(async () => {
        if (savedTraceEnv !== undefined) {
            process.env['TRACE_TO_LANGSMITH'] = savedTraceEnv
        } else {
            delete process.env['TRACE_TO_LANGSMITH']
        }
        await rm(cwd, { recursive: true, force: true })
        await rm(claudeHome, { recursive: true, force: true })
    })

    const enableGate = async () => {
        await writeFile(
            join(claudeHome, 'settings.json'),
            JSON.stringify({ env: { TRACE_TO_LANGSMITH: 'true' } })
        )
    }

    const localSettingsPath = () =>
        join(cwd, '.claude', 'settings.local.json')

    const readLocal = async () =>
        JSON.parse(await readFile(localSettingsPath(), 'utf-8')) as Record<
            string,
            unknown
        >

    const readLocalMetadata = async () => {
        const settings = await readLocal()
        const env = settings['env'] as Record<string, string>
        return JSON.parse(env['CC_LANGSMITH_METADATA']!) as Record<
            string,
            unknown
        >
    }

    test('fresh repo (no settings.local.json) — file is CREATED when the gate is on', async () => {
        await enableGate()

        await enrichTraceMetadata({
            cwd,
            claudeHome,
            repoName: 'fresh-repo',
            lucaVersion: '1.2.3',
        })

        expect(existsSync(localSettingsPath())).toBe(true)
        const metadata = await readLocalMetadata()
        expect(metadata['repo']).toBe('fresh-repo')
        expect(metadata['luca_version']).toBe('1.2.3')
        expect(metadata['environment']).toBe('production')
        expect(metadata['ls_message_format']).toBe('anthropic')
    })

    test('no-op when TRACE_TO_LANGSMITH is not configured anywhere — zero writes', async () => {
        // claudeHome has no settings.json and process.env is cleared.
        await enrichTraceMetadata({
            cwd,
            claudeHome,
            repoName: 'gated-repo',
            lucaVersion: '1.2.3',
        })

        expect(existsSync(localSettingsPath())).toBe(false)
        expect(existsSync(join(cwd, '.claude'))).toBe(false)
    })

    test('gate falls back to process.env.TRACE_TO_LANGSMITH when settings key absent', async () => {
        process.env['TRACE_TO_LANGSMITH'] = 'true'

        await enrichTraceMetadata({
            cwd,
            claudeHome,
            repoName: 'env-gated-repo',
            lucaVersion: '1.2.3',
        })

        const metadata = await readLocalMetadata()
        expect(metadata['repo']).toBe('env-gated-repo')
    })

    test('re-run refreshes luca-owned keys while user keys stay stable', async () => {
        await enableGate()
        await mkdir(join(cwd, '.claude'), { recursive: true })
        await writeFile(
            localSettingsPath(),
            JSON.stringify({
                env: {
                    CC_LANGSMITH_METADATA: JSON.stringify({
                        custom_billing_team: 'infra-observability',
                    }),
                },
            })
        )

        await enrichTraceMetadata({
            cwd,
            claudeHome,
            repoName: 'repo-a',
            lucaVersion: '1.0.0',
        })
        await enrichTraceMetadata({
            cwd,
            claudeHome,
            repoName: 'repo-a',
            lucaVersion: '2.0.0',
        })

        const metadata = await readLocalMetadata()
        expect(metadata['repo']).toBe('repo-a')
        expect(metadata['luca_version']).toBe('2.0.0')
        expect(metadata['custom_billing_team']).toBe('infra-observability')
    })

    test('malformed settings.local.json is skipped verbatim — never rewritten', async () => {
        await enableGate()
        await mkdir(join(cwd, '.claude'), { recursive: true })
        const malformed = '{ this is not json'
        await writeFile(localSettingsPath(), malformed)

        await enrichTraceMetadata({
            cwd,
            claudeHome,
            repoName: 'broken-repo',
            lucaVersion: '1.2.3',
        })

        expect(await readFile(localSettingsPath(), 'utf-8')).toBe(malformed)
    })

    test('malformed nested CC_LANGSMITH_METADATA is skipped — file untouched', async () => {
        await enableGate()
        await mkdir(join(cwd, '.claude'), { recursive: true })
        const original = JSON.stringify({
            env: { CC_LANGSMITH_METADATA: '{broken' },
        })
        await writeFile(localSettingsPath(), original)

        await enrichTraceMetadata({
            cwd,
            claudeHome,
            repoName: 'broken-meta-repo',
            lucaVersion: '1.2.3',
        })

        expect(await readFile(localSettingsPath(), 'utf-8')).toBe(original)
    })

    test('non-string CC_LANGSMITH_METADATA is skipped — file untouched', async () => {
        await enableGate()
        await mkdir(join(cwd, '.claude'), { recursive: true })
        // env.CC_LANGSMITH_METADATA is a JSON number, not a string.
        const original = JSON.stringify({
            env: { CC_LANGSMITH_METADATA: 123 },
        })
        await writeFile(localSettingsPath(), original)

        await enrichTraceMetadata({
            cwd,
            claudeHome,
            repoName: 'non-string-meta-repo',
            lucaVersion: '1.2.3',
        })

        expect(await readFile(localSettingsPath(), 'utf-8')).toBe(original)
    })

    test('gate accepts a JSON boolean true in settings.json', async () => {
        await writeFile(
            join(claudeHome, 'settings.json'),
            JSON.stringify({ env: { TRACE_TO_LANGSMITH: true } })
        )

        await enrichTraceMetadata({
            cwd,
            claudeHome,
            repoName: 'bool-gated-repo',
            lucaVersion: '1.2.3',
        })

        const metadata = await readLocalMetadata()
        expect(metadata['repo']).toBe('bool-gated-repo')
    })

    test('gate stays fail-closed for false / "false" / other values — zero writes', async () => {
        for (const gateValue of [false, 'false', 'yes', 0, 1]) {
            await writeFile(
                join(claudeHome, 'settings.json'),
                JSON.stringify({ env: { TRACE_TO_LANGSMITH: gateValue } })
            )

            await enrichTraceMetadata({
                cwd,
                claudeHome,
                repoName: 'disabled-repo',
                lucaVersion: '1.2.3',
            })

            expect(existsSync(localSettingsPath())).toBe(false)
        }
    })

    test('unrelated settings.local.json sections pass through untouched', async () => {
        await enableGate()
        await mkdir(join(cwd, '.claude'), { recursive: true })
        await writeFile(
            localSettingsPath(),
            JSON.stringify({
                permissions: { allow: ['Bash(ls:*)'] },
                hooks: { PreToolUse: [{ hooks: [] }] },
                env: { OTHER_KEY: 'kept' },
            })
        )

        await enrichTraceMetadata({
            cwd,
            claudeHome,
            repoName: 'passthrough-repo',
            lucaVersion: '1.2.3',
        })

        const settings = await readLocal()
        expect(settings['permissions']).toEqual({ allow: ['Bash(ls:*)'] })
        expect(settings['hooks']).toEqual({ PreToolUse: [{ hooks: [] }] })
        const env = settings['env'] as Record<string, unknown>
        expect(env['OTHER_KEY']).toBe('kept')
        const metadata = await readLocalMetadata()
        expect(metadata['repo']).toBe('passthrough-repo')
    })
})
