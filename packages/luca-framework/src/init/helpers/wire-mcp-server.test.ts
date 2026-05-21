import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { mergeMcpServerRegistration, wireMcpServer } from './wire-mcp-server.ts'

describe('wireMcpServer', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-wire-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('creates .mcp.json with mcpServers.luca registration', async () => {
        await wireMcpServer({ cwd })

        const mcpJsonPath = join(cwd, '.mcp.json')
        expect(existsSync(mcpJsonPath)).toBe(true)

        const config = JSON.parse(await readFile(mcpJsonPath, 'utf-8'))
        expect(config.mcpServers).toBeDefined()
        expect(config.mcpServers.luca).toBeDefined()
        expect(config.mcpServers.luca.command).toBe('luca')
        expect(config.mcpServers.luca.args).toContain('mcp')
        expect(config.mcpServers.luca.args).toContain('serve')
    })

    test('merges into existing .mcp.json without clobbering', async () => {
        await writeFile(
            join(cwd, '.mcp.json'),
            JSON.stringify({
                someOtherKey: 'preserved',
                mcpServers: {
                    other: { command: 'other-mcp' },
                },
            })
        )

        await wireMcpServer({ cwd })

        const config = JSON.parse(await readFile(join(cwd, '.mcp.json'), 'utf-8'))
        expect(config.someOtherKey).toBe('preserved')
        expect(config.mcpServers.other.command).toBe('other-mcp')
        expect(config.mcpServers.luca).toBeDefined()
    })

    test('is idempotent — re-running preserves the same registration', async () => {
        await wireMcpServer({ cwd })
        await wireMcpServer({ cwd })

        const config = JSON.parse(await readFile(join(cwd, '.mcp.json'), 'utf-8'))
        // Only one luca entry
        expect(config.mcpServers.luca).toBeDefined()
        expect(Object.keys(config.mcpServers).length).toBe(1)
    })

    test('strips a stale mcpServers key from .claude/settings.json', async () => {
        await mkdir(join(cwd, '.claude'), { recursive: true })
        await writeFile(
            join(cwd, '.claude/settings.json'),
            JSON.stringify({
                hooks: { PreToolUse: [] },
                mcpServers: { luca: { command: 'luca' } },
            })
        )

        await wireMcpServer({ cwd })

        const settings = JSON.parse(
            await readFile(join(cwd, '.claude/settings.json'), 'utf-8')
        )
        // Stale key removed, unrelated keys preserved.
        expect(settings.mcpServers).toBeUndefined()
        expect(settings.hooks).toBeDefined()
    })
})

describe('mergeMcpServerRegistration (pure helper)', () => {
    test('adds entry to empty config', () => {
        const next = mergeMcpServerRegistration({})
        expect(next.mcpServers).toBeDefined()
        const servers = next.mcpServers as Record<string, unknown>
        expect(servers.luca).toBeDefined()
    })

    test('preserves unrelated config fields', () => {
        const next = mergeMcpServerRegistration({
            unrelated: 'value',
        })
        expect(next.unrelated).toBe('value')
    })

    test('overwrites stale luca entry with current config', () => {
        const next = mergeMcpServerRegistration({
            mcpServers: { luca: { command: 'stale-old-command' } },
        })
        const servers = next.mcpServers as Record<string, { command: string }>
        expect(servers.luca!.command).toBe('luca')
    })
})
