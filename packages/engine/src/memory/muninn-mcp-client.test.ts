import { describe, expect, test } from 'bun:test'

import {
    createMuninnMcpClient,
    muninnSettings,
    parseRecall,
    parseSavedId,
    toolText,
    type McpConnection,
} from './muninn-mcp-client'

/** No test reaches a real MuninnDB: the connection is a fake. */

const CLAUDE_JSON = JSON.stringify({
    mcpServers: {
        muninn: {
            type: 'sse',
            url: 'http://127.0.0.1:8750/mcp',
            headers: { Authorization: 'Bearer secret-token' },
        },
        other: { type: 'stdio', command: 'x' },
    },
})

describe('muninnSettings', () => {
    test('the env comes first', () => {
        expect(
            muninnSettings({
                env: {
                    LUCA_MUNINN_URL: 'http://localhost:9/mcp',
                    LUCA_MUNINN_TOKEN: 'env-token',
                },
                claude_json: CLAUDE_JSON,
            })
        ).toEqual({
            ok: true,
            settings: {
                url: 'http://localhost:9/mcp',
                authorization: 'Bearer env-token',
            },
        })
    })

    test('a token that already says Bearer is kept, and no token sends none', () => {
        expect(
            muninnSettings({
                env: {
                    LUCA_MUNINN_URL: 'http://x/mcp',
                    LUCA_MUNINN_TOKEN: 'Bearer abc',
                },
                claude_json: null,
            })
        ).toMatchObject({ settings: { authorization: 'Bearer abc' } })
        expect(
            muninnSettings({
                env: { LUCA_MUNINN_URL: 'http://x/mcp' },
                claude_json: null,
            })
        ).toMatchObject({ settings: { authorization: null } })
    })

    test("otherwise, Claude Code's muninn entry", () => {
        expect(muninnSettings({ env: {}, claude_json: CLAUDE_JSON })).toEqual({
            ok: true,
            settings: {
                url: 'http://127.0.0.1:8750/mcp',
                authorization: 'Bearer secret-token',
            },
        })
    })

    test('says why when MuninnDB is nowhere', () => {
        expect(muninnSettings({ env: {}, claude_json: null })).toMatchObject({
            ok: false,
        })
        expect(muninnSettings({ env: {}, claude_json: '{' })).toEqual({
            ok: false,
            error: '~/.claude.json is not valid JSON.',
        })
        expect(
            muninnSettings({
                env: {},
                claude_json: JSON.stringify({ mcpServers: {} }),
            })
        ).toMatchObject({
            ok: false,
            error: expect.stringContaining('mcpServers.muninn'),
        })
    })
})

describe('reading tool results', () => {
    test("a tool's text, or its error", () => {
        expect(
            toolText({ result: { content: [{ type: 'text', text: 'hi' }] } })
        ).toEqual({ ok: true, text: 'hi' })
        expect(
            toolText({
                result: {
                    content: [{ type: 'text', text: 'vault not found' }],
                    isError: true,
                },
            })
        ).toEqual({ ok: false, error: 'vault not found' })
        expect(toolText({ result: 'nope' })).toMatchObject({ ok: false })
    })

    test("muninn_recall's memories, with their scores", () => {
        expect(
            parseRecall({
                text: JSON.stringify({
                    memories: [
                        {
                            id: 'm1',
                            concept: 'pitfall:x',
                            content: 'c',
                            summary: 's',
                            score: 1.3,
                            vector_score: 0.8,
                            tags: [],
                        },
                        { id: 'm2', concept: 'y', content: 'd', score: 0.6 },
                    ],
                    total: 2,
                }),
            })
        ).toEqual({
            ok: true,
            hits: [
                {
                    id: 'm1',
                    concept: 'pitfall:x',
                    content: 'c',
                    score: 1.3,
                    vector_score: 0.8,
                },
                {
                    id: 'm2',
                    concept: 'y',
                    content: 'd',
                    score: 0.6,
                    vector_score: null,
                },
            ],
        })
        expect(parseRecall({ text: '{"memories":null,"total":0}' })).toEqual({
            ok: true,
            hits: [],
        })
    })

    test('a recall answer of the wrong shape is an error value', () => {
        expect(parseRecall({ text: 'not json' })).toMatchObject({ ok: false })
        expect(
            parseRecall({ text: '{"memories":[{"id":"m1"}]}' })
        ).toMatchObject({ ok: false })
    })

    test('the id a save names', () => {
        expect(parseSavedId({ text: '{"id":"a"}' })).toBe('a')
        expect(parseSavedId({ text: '{"id":"a","new_id":"b"}' })).toBe('b')
        expect(parseSavedId({ text: 'ok' })).toBeNull()
    })
})

describe('createMuninnMcpClient', () => {
    const settings = {
        url: 'http://127.0.0.1:8750/mcp',
        authorization: 'Bearer secret-token',
    }

    const fakeConnection = ({
        answer,
    }: {
        answer: (name: string) => unknown
    }) => {
        const calls: { name: string; arguments: Record<string, unknown> }[] = []
        let connects = 0
        let closed = false
        const connect = async (): Promise<McpConnection> => {
            connects += 1
            return {
                callTool: async (args) => {
                    calls.push(args)
                    return answer(args.name)
                },
                close: async () => {
                    closed = true
                },
            }
        }
        return {
            connect,
            calls,
            connects: () => connects,
            closed: () => closed,
        }
    }

    const text = (value: unknown) => ({
        content: [{ type: 'text', text: JSON.stringify(value) }],
    })

    test("calls MuninnDB's tools with their arguments, on one connection", async () => {
        const fake = fakeConnection({
            answer: (name) =>
                name === 'muninn_recall'
                    ? text({
                          memories: [
                              {
                                  id: 'm1',
                                  concept: 'c',
                                  content: 'x',
                                  score: 0.9,
                              },
                          ],
                          total: 1,
                      })
                    : name === 'muninn_remember'
                      ? text({ id: 'new-1' })
                      : text({ ok: true }),
        })
        const client = createMuninnMcpClient({
            settings,
            connect: fake.connect,
        })

        expect(
            await client.recall({
                vault: 'default',
                query: 'bun test',
                limit: 5,
                threshold: 0.5,
            })
        ).toEqual([
            {
                id: 'm1',
                concept: 'c',
                content: 'x',
                score: 0.9,
                vector_score: null,
            },
        ])
        expect(
            await client.remember({
                vault: 'default',
                type: 'pitfall',
                concept: 'pitfall:x',
                content: 'c',
                summary: 's',
                tags: ['luca'],
                op_id: 'op-1',
            })
        ).toEqual({ id: 'new-1' })
        expect(
            await client.evolve({
                vault: 'default',
                id: 'm1',
                content: 'c2',
                reason: 'r',
            })
        ).toEqual({ id: 'm1' })
        await client.feedback({ vault: 'default', id: 'm1', useful: true })
        await client.close()

        expect(fake.connects()).toBe(1)
        expect(fake.closed()).toBe(true)
        expect(fake.calls).toEqual([
            {
                name: 'muninn_recall',
                arguments: {
                    vault: 'default',
                    context: ['bun test'],
                    limit: 5,
                    threshold: 0.5,
                },
            },
            {
                name: 'muninn_remember',
                arguments: {
                    vault: 'default',
                    concept: 'pitfall:x',
                    content: 'c',
                    summary: 's',
                    type: 'pitfall',
                    tags: ['luca'],
                    op_id: 'op-1',
                },
            },
            {
                name: 'muninn_evolve',
                arguments: {
                    vault: 'default',
                    id: 'm1',
                    new_content: 'c2',
                    reason: 'r',
                },
            },
            {
                name: 'muninn_feedback',
                arguments: { vault: 'default', engram_id: 'm1', useful: true },
            },
        ])
    })

    test('an error result throws, with the token hidden', async () => {
        const fake = fakeConnection({
            answer: () => ({
                content: [
                    { type: 'text', text: 'bad token secret-token for vault' },
                ],
                isError: true,
            }),
        })
        const client = createMuninnMcpClient({
            settings,
            connect: fake.connect,
        })
        const error = await client
            .recall({ vault: 'default', query: 'q', limit: 1, threshold: 0 })
            .then(
                () => '',
                (thrown: unknown) => String(thrown)
            )
        expect(error).toContain('muninn_recall: bad token *** for vault')
        expect(error).not.toContain('secret-token')
    })

    test('a failed connect is tried again on the next call', async () => {
        let tries = 0
        const client = createMuninnMcpClient({
            settings,
            connect: async () => {
                tries += 1
                if (tries === 1) throw new Error('connection refused')
                return {
                    callTool: async () => ({
                        content: [{ type: 'text', text: '{"memories":[]}' }],
                    }),
                    close: async () => undefined,
                }
            },
        })
        const first = await client
            .recall({ vault: 'default', query: 'q', limit: 1, threshold: 0 })
            .then(
                () => 'ok',
                (thrown: unknown) => String(thrown)
            )
        expect(first).toContain('connection refused')
        expect(
            await client.recall({
                vault: 'default',
                query: 'q',
                limit: 1,
                threshold: 0,
            })
        ).toEqual([])
    })
})
