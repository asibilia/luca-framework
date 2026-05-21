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

    test('creates .claude/settings.json with mcpServers.luca registration', async () => {
        await wireMcpServer({ cwd })

        const settingsPath = join(cwd, '.claude/settings.json')
        expect(existsSync(settingsPath)).toBe(true)

        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'))
        expect(settings.mcpServers).toBeDefined()
        expect(settings.mcpServers.luca).toBeDefined()
        expect(settings.mcpServers.luca.command).toBe('luca')
        expect(settings.mcpServers.luca.args).toContain('mcp')
        expect(settings.mcpServers.luca.args).toContain('serve')
    })

    test('merges into existing settings.json without clobbering', async () => {
        await mkdir(join(cwd, '.claude'), { recursive: true })
        await writeFile(
            join(cwd, '.claude/settings.json'),
            JSON.stringify({
                hooks: { PreToolUse: [] },
                someOtherKey: 'preserved',
                mcpServers: {
                    other: { command: 'other-mcp' },
                },
            })
        )

        await wireMcpServer({ cwd })

        const settings = JSON.parse(
            await readFile(join(cwd, '.claude/settings.json'), 'utf-8')
        )
        expect(settings.someOtherKey).toBe('preserved')
        expect(settings.mcpServers.other.command).toBe('other-mcp')
        expect(settings.mcpServers.luca).toBeDefined()
    })

    test('is idempotent — re-running preserves the same registration', async () => {
        await wireMcpServer({ cwd })
        await wireMcpServer({ cwd })

        const settings = JSON.parse(
            await readFile(join(cwd, '.claude/settings.json'), 'utf-8')
        )
        // Only one luca entry
        expect(settings.mcpServers.luca).toBeDefined()
        expect(Object.keys(settings.mcpServers).length).toBe(1)
    })
})

describe('mergeMcpServerRegistration (pure helper)', () => {
    test('adds entry to empty settings', () => {
        const next = mergeMcpServerRegistration({})
        expect(next.mcpServers).toBeDefined()
        const servers = next.mcpServers as Record<string, unknown>
        expect(servers.luca).toBeDefined()
    })

    test('preserves unrelated settings fields', () => {
        const next = mergeMcpServerRegistration({
            unrelated: 'value',
            hooks: { PreToolUse: [] },
        })
        expect(next.unrelated).toBe('value')
        expect(next.hooks).toBeDefined()
    })

    test('overwrites stale luca entry with current config', () => {
        const next = mergeMcpServerRegistration({
            mcpServers: { luca: { command: 'stale-old-command' } },
        })
        const servers = next.mcpServers as Record<string, { command: string }>
        expect(servers.luca!.command).toBe('luca')
    })
})
