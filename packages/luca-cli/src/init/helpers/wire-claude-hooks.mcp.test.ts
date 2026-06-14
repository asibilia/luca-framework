import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    mergeAntigravityMcpRegistration,
    mergeClaudeMcpRegistration,
    wireAntigravityMcp,
} from './wire-claude-hooks.ts'

const SERVER_URL = 'http://127.0.0.1:8750/mcp'

describe('mergeAntigravityMcpRegistration (pure)', () => {
    test('golden: empty config + token → exact canonical Antigravity shape', () => {
        const result = mergeAntigravityMcpRegistration({}, 'tok-abc')

        // Deep-equal the whole result: serverUrl + enabledTools:['*'] + Bearer
        // header, and crucially NO `url` key (that is Claude's SSE shape).
        expect(result).toEqual({
            mcpServers: {
                muninn: {
                    serverUrl: SERVER_URL,
                    headers: { Authorization: 'Bearer tok-abc' },
                    enabledTools: ['*'],
                },
            },
        })

        // Negative anchors: the Antigravity entry must NOT carry Claude-shape keys.
        const entry = result.mcpServers!.muninn as Record<string, unknown>
        expect('url' in entry).toBe(false)
        expect('type' in entry).toBe(false)
    })

    test('preserves unrelated top-level keys and sibling mcpServers entries', () => {
        const result = mergeAntigravityMcpRegistration(
            {
                hooks: { 'luca-stage-gate': { enabled: true } },
                mcpServers: {
                    other: { serverUrl: 'http://other:1/mcp' },
                },
            } as Parameters<typeof mergeAntigravityMcpRegistration>[0],
            'tok-xyz'
        )

        // Unrelated top-level key survives untouched.
        expect(result.hooks).toEqual({ 'luca-stage-gate': { enabled: true } })
        // Sibling MCP server survives untouched.
        expect(result.mcpServers!.other).toEqual({
            serverUrl: 'http://other:1/mcp',
        })
        // muninn was added canonically.
        expect(result.mcpServers!.muninn).toEqual({
            serverUrl: SERVER_URL,
            headers: { Authorization: 'Bearer tok-xyz' },
            enabledTools: ['*'],
        })
        // Exactly two MCP servers — nothing dropped, nothing extra.
        expect(Object.keys(result.mcpServers!).sort()).toEqual([
            'muninn',
            'other',
        ])
    })

    test('idempotent: canonical output fed back with same token is a deep-equal no-op', () => {
        const once = mergeAntigravityMcpRegistration({}, 'tok-same')
        const twice = mergeAntigravityMcpRegistration(once, 'tok-same')
        expect(twice).toEqual(once)
    })

    test('stale-key migration: strips Claude-shape `url` from an existing entry', () => {
        const result = mergeAntigravityMcpRegistration(
            {
                mcpServers: {
                    muninn: {
                        // Cross-contaminated Claude SSE shape on an Antigravity entry.
                        url: SERVER_URL,
                        serverUrl: SERVER_URL,
                        headers: { Authorization: 'Bearer old-tok' },
                        enabledTools: ['*'],
                    } as never,
                },
            },
            'tok-new'
        )

        const entry = result.mcpServers!.muninn as Record<string, unknown>
        // Stale `url` stripped.
        expect('url' in entry).toBe(false)
        // Result is the canonical Antigravity shape with the fresh token.
        expect(result.mcpServers!.muninn).toEqual({
            serverUrl: SERVER_URL,
            headers: { Authorization: 'Bearer tok-new' },
            enabledTools: ['*'],
        })
    })

    test('header preservation (Q1): keeps a custom header, sets Authorization', () => {
        const result = mergeAntigravityMcpRegistration(
            {
                mcpServers: {
                    muninn: {
                        serverUrl: SERVER_URL,
                        headers: {
                            'X-Custom': 'keepme',
                            Authorization: 'Bearer stale',
                        },
                        enabledTools: ['*'],
                    },
                },
            },
            'tok-fresh'
        )

        expect(result.mcpServers!.muninn!.headers).toEqual({
            'X-Custom': 'keepme',
            Authorization: 'Bearer tok-fresh',
        })
    })

    test('token is inlined as `Bearer <token>` — never an env placeholder', () => {
        const a = mergeAntigravityMcpRegistration({}, 'AAA')
        const b = mergeAntigravityMcpRegistration({}, 'BBB')

        expect(a.mcpServers!.muninn!.headers!.Authorization).toBe('Bearer AAA')
        expect(b.mcpServers!.muninn!.headers!.Authorization).toBe('Bearer BBB')

        // No env-var placeholder may appear anywhere in the serialized config.
        expect(JSON.stringify(a)).not.toContain('${MUNINN_DB_API_KEY}')
        expect(JSON.stringify(a)).not.toContain('MUNINN_DB_API_KEY')
    })
})

describe('mergeClaudeMcpRegistration (pure)', () => {
    test('golden: empty config + token → exact canonical Claude SSE shape', () => {
        const result = mergeClaudeMcpRegistration({}, 'tok-abc')

        // Deep-equal: type:'sse' + url + Bearer header, NO serverUrl/enabledTools.
        expect(result).toEqual({
            mcpServers: {
                muninn: {
                    type: 'sse',
                    url: SERVER_URL,
                    headers: { Authorization: 'Bearer tok-abc' },
                },
            },
        })

        // Negative anchors: Claude entry must NOT carry Antigravity-shape keys.
        const entry = result.mcpServers!.muninn as Record<string, unknown>
        expect('serverUrl' in entry).toBe(false)
        expect('enabledTools' in entry).toBe(false)
    })

    test('preserves unrelated top-level keys and sibling mcpServers entries', () => {
        const result = mergeClaudeMcpRegistration(
            {
                numStartups: 7,
                projects: { '/some/path': { allowedTools: [] } },
                mcpServers: {
                    other: { type: 'stdio', command: 'foo' } as never,
                },
            } as Parameters<typeof mergeClaudeMcpRegistration>[0],
            'tok-xyz'
        )

        // Unrelated primary-config keys survive untouched.
        expect(result.numStartups).toBe(7)
        expect(result.projects).toEqual({
            '/some/path': { allowedTools: [] },
        })
        // Sibling MCP server survives untouched.
        expect(result.mcpServers!.other).toEqual({
            type: 'stdio',
            command: 'foo',
        } as never)
        // muninn added canonically.
        expect(result.mcpServers!.muninn).toEqual({
            type: 'sse',
            url: SERVER_URL,
            headers: { Authorization: 'Bearer tok-xyz' },
        })
        expect(Object.keys(result.mcpServers!).sort()).toEqual([
            'muninn',
            'other',
        ])
    })

    test('idempotent: canonical output fed back with same token is a deep-equal no-op', () => {
        const once = mergeClaudeMcpRegistration({}, 'tok-same')
        const twice = mergeClaudeMcpRegistration(once, 'tok-same')
        expect(twice).toEqual(once)
    })

    test('stale-key migration: strips Antigravity-shape serverUrl/enabledTools', () => {
        const result = mergeClaudeMcpRegistration(
            {
                mcpServers: {
                    muninn: {
                        // Cross-contaminated Antigravity shape on a Claude entry.
                        type: 'sse',
                        url: SERVER_URL,
                        serverUrl: SERVER_URL,
                        enabledTools: ['*'],
                        headers: { Authorization: 'Bearer old-tok' },
                    } as never,
                },
            },
            'tok-new'
        )

        const entry = result.mcpServers!.muninn as Record<string, unknown>
        // Stale Antigravity keys stripped.
        expect('serverUrl' in entry).toBe(false)
        expect('enabledTools' in entry).toBe(false)
        // Result is the canonical Claude shape with the fresh token.
        expect(result.mcpServers!.muninn).toEqual({
            type: 'sse',
            url: SERVER_URL,
            headers: { Authorization: 'Bearer tok-new' },
        } as never)
    })

    test('header preservation (Q1): keeps a custom header, sets Authorization', () => {
        const result = mergeClaudeMcpRegistration(
            {
                mcpServers: {
                    muninn: {
                        type: 'sse',
                        url: SERVER_URL,
                        headers: {
                            'X-Custom': 'keepme',
                            Authorization: 'Bearer stale',
                        },
                    },
                },
            },
            'tok-fresh'
        )

        expect(
            (result.mcpServers!.muninn as Record<string, unknown>).headers
        ).toEqual({
            'X-Custom': 'keepme',
            Authorization: 'Bearer tok-fresh',
        })
    })

    test('token is inlined as `Bearer <token>` — never an env placeholder', () => {
        const a = mergeClaudeMcpRegistration({}, 'AAA')
        const b = mergeClaudeMcpRegistration({}, 'BBB')

        expect(
            (a.mcpServers!.muninn as Record<string, unknown>)
                .headers as Record<string, string>
        ).toEqual({ Authorization: 'Bearer AAA' })
        expect(
            (b.mcpServers!.muninn as Record<string, unknown>)
                .headers as Record<string, string>
        ).toEqual({ Authorization: 'Bearer BBB' })

        expect(JSON.stringify(a)).not.toContain('${MUNINN_DB_API_KEY}')
        expect(JSON.stringify(a)).not.toContain('MUNINN_DB_API_KEY')
    })
})

// wireAntigravityMcp accepts an injectable `home` (temp dir) and `token`, so it
// is safe to exercise against a TEMP directory. wireClaudeMcp is deliberately
// NOT tested here: it writes to join(homedir(), '.claude.json') with no path
// override, so any FS test would risk clobbering the real primary config.
describe('wireAntigravityMcp (FS wrapper, temp HOME only)', () => {
    let agyHome: string

    beforeEach(async () => {
        agyHome = await mkdtemp(join(tmpdir(), 'luca-agy-home-'))
    })

    afterEach(async () => {
        await rm(agyHome, { recursive: true, force: true })
    })

    test('writes canonical mcp_config.json from an injected token', async () => {
        await wireAntigravityMcp({ home: agyHome, token: 'tok-wrap' })

        const cfgPath = join(agyHome, 'mcp_config.json')
        expect(existsSync(cfgPath)).toBe(true)

        const cfg = JSON.parse(await readFile(cfgPath, 'utf-8'))
        expect(cfg.mcpServers.muninn).toEqual({
            serverUrl: SERVER_URL,
            headers: { Authorization: 'Bearer tok-wrap' },
            enabledTools: ['*'],
        })
    })
})
