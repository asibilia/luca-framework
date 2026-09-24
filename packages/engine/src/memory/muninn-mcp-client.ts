import { homedir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { z } from 'zod'

import type { MemoryClient } from './memory-client'
import type { MemoryHit } from './memory-schemas'

/**
 * The real memory client (#370): MuninnDB over MCP, on one connection that
 * reaches every vault. Only the engine uses it; agents get no memory tools.
 * The token is sent as a header and never logged or journaled.
 */

/** Where to reach MuninnDB, and the `Authorization` header to send. */
export type MuninnSettings = {
    url: string
    /** The whole header value, such as `Bearer <token>`; `null` for none. */
    authorization: string | null
}

const ClaudeJsonSchema = z.looseObject({
    mcpServers: z
        .looseObject({
            muninn: z
                .looseObject({
                    url: z.string().min(1),
                    headers: z
                        .looseObject({ Authorization: z.string().optional() })
                        .optional(),
                })
                .optional(),
        })
        .optional(),
})

const bearer = (token: string): string =>
    /^bearer\s/i.test(token) ? token : `Bearer ${token}`

/**
 * Where to reach MuninnDB. `LUCA_MUNINN_URL` (with `LUCA_MUNINN_TOKEN`, if
 * any) comes first; otherwise the `mcpServers.muninn` entry of
 * `~/.claude.json` (its `url` and `headers.Authorization`), given as text.
 * Pure: it reads no file and no env of its own.
 *
 * @example
 * muninnSettings({ env: process.env, claude_json: await Bun.file(CLAUDE_JSON).text() })
 * // { ok: true, settings: { url: 'http://127.0.0.1:8750/mcp', authorization: 'Bearer ...' } }
 */
export const muninnSettings = ({
    env,
    claude_json,
}: {
    env: Record<string, string | undefined>
    /** The text of `~/.claude.json`, or `null` when there is none. */
    claude_json: string | null
}): { ok: true; settings: MuninnSettings } | { ok: false; error: string } => {
    const url = env.LUCA_MUNINN_URL?.trim()
    if (url !== undefined && url !== '') {
        const token = env.LUCA_MUNINN_TOKEN?.trim()
        return {
            ok: true,
            settings: {
                url,
                authorization:
                    token === undefined || token === '' ? null : bearer(token),
            },
        }
    }
    if (claude_json === null) {
        return {
            ok: false,
            error: 'No LUCA_MUNINN_URL, and no ~/.claude.json to find MuninnDB in.',
        }
    }
    let json: unknown
    try {
        json = JSON.parse(claude_json)
    } catch {
        return { ok: false, error: '~/.claude.json is not valid JSON.' }
    }
    const parsed = ClaudeJsonSchema.safeParse(json)
    const muninn = parsed.success ? parsed.data.mcpServers?.muninn : undefined
    if (muninn === undefined) {
        return {
            ok: false,
            error: 'No LUCA_MUNINN_URL, and ~/.claude.json has no mcpServers.muninn with a url.',
        }
    }
    return {
        ok: true,
        settings: {
            url: muninn.url,
            authorization: muninn.headers?.Authorization ?? null,
        },
    }
}

/** Where Claude Code keeps its settings, MuninnDB's entry among them. */
export const CLAUDE_JSON = join(homedir(), '.claude.json')

/** An MCP tool's result: its content blocks, and whether it is an error. */
const ToolResultSchema = z.looseObject({
    content: z
        .array(z.looseObject({ type: z.string(), text: z.string().optional() }))
        .default([]),
    isError: z.boolean().optional(),
})

/**
 * The text of an MCP tool's result, or why there is none: a result of the
 * wrong shape, or one marked as an error. Pure.
 *
 * @example
 * toolText({ result: { content: [{ type: 'text', text: '{"id":"x"}' }] } }) // { ok: true, text: '{"id":"x"}' }
 */
export const toolText = ({
    result,
}: {
    result: unknown
}): { ok: true; text: string } | { ok: false; error: string } => {
    const parsed = ToolResultSchema.safeParse(result)
    if (!parsed.success) {
        return {
            ok: false,
            error: `The tool's result does not fit MCP's shape:\n${z.prettifyError(parsed.error)}`,
        }
    }
    const text = parsed.data.content
        .flatMap((block) =>
            block.type === 'text' && block.text !== undefined
                ? [block.text]
                : []
        )
        .join('\n')
    if (parsed.data.isError === true) {
        return { ok: false, error: text === '' ? 'The tool failed.' : text }
    }
    return { ok: true, text }
}

const parseJson = (
    text: string
): { ok: true; value: unknown } | { ok: false; error: string } => {
    try {
        return { ok: true, value: JSON.parse(text) }
    } catch {
        return { ok: false, error: `Not JSON: ${text.slice(0, 200)}` }
    }
}

const RecallResultSchema = z.looseObject({
    memories: z
        .array(
            z.looseObject({
                id: z.string().min(1),
                concept: z.string().default(''),
                content: z.string().default(''),
                score: z.number(),
                vector_score: z.number().nullable().optional(),
            })
        )
        .nullable()
        .default([]),
})

/**
 * The memories in `muninn_recall`'s answer (`{ memories: [...] | null,
 * total }`), or why they can't be read. Pure.
 *
 * @example
 * parseRecall({ text: '{"memories":null,"total":0}' }) // { ok: true, hits: [] }
 */
export const parseRecall = ({
    text,
}: {
    text: string
}): { ok: true; hits: MemoryHit[] } | { ok: false; error: string } => {
    const json = parseJson(text)
    if (!json.ok) return json
    const parsed = RecallResultSchema.safeParse(json.value)
    if (!parsed.success) {
        return {
            ok: false,
            error: `muninn_recall's answer does not fit its shape:\n${z.prettifyError(parsed.error)}`,
        }
    }
    return {
        ok: true,
        hits: (parsed.data.memories ?? []).map(
            ({ id, concept, content, score, vector_score }) => ({
                id,
                concept,
                content,
                score,
                vector_score: vector_score ?? null,
            })
        ),
    }
}

const IdResultSchema = z.looseObject({
    id: z.string().min(1).optional(),
    new_id: z.string().min(1).optional(),
    engram_id: z.string().min(1).optional(),
})

/**
 * The memory id in `muninn_remember`'s or `muninn_evolve`'s answer (`id`,
 * `new_id`, or `engram_id`), or `null` when it names none. Pure.
 *
 * @example
 * parseSavedId({ text: '{"id":"01J..."}' }) // '01J...'
 */
export const parseSavedId = ({ text }: { text: string }): string | null => {
    const json = parseJson(text)
    if (!json.ok) return null
    const parsed = IdResultSchema.safeParse(json.value)
    if (!parsed.success) return null
    const { new_id, id, engram_id } = parsed.data
    return new_id ?? id ?? engram_id ?? null
}

/** Calls one MCP tool; resolves to its raw result. */
export type McpToolCall = (args: {
    name: string
    arguments: Record<string, unknown>
}) => Promise<unknown>

/** An open MCP connection: its tool calls, and how to close it. */
export type McpConnection = {
    callTool: McpToolCall
    close: () => Promise<void>
}

/** Replaces the header's secret with `***` in any text, so it never leaks. */
const hideSecret = ({
    text,
    settings,
}: {
    text: string
    settings: MuninnSettings
}): string => {
    const secret = settings.authorization?.replace(/^bearer\s+/i, '')
    return secret === undefined || secret === ''
        ? text
        : text.split(secret).join('***')
}

/**
 * Connects to MuninnDB's MCP endpoint: Streamable HTTP first, then the
 * older SSE transport, with the `Authorization` header on every request.
 */
export const connectMuninn = async ({
    settings,
}: {
    settings: MuninnSettings
}): Promise<McpConnection> => {
    const headers: Record<string, string> =
        settings.authorization === null
            ? {}
            : { Authorization: settings.authorization }
    const url = new URL(settings.url)
    const open = async (
        transport: StreamableHTTPClientTransport | SSEClientTransport
    ): Promise<McpConnection> => {
        const client = new Client({ name: 'luca-engine', version: '0.0.0' })
        await client.connect(transport)
        return {
            callTool: (args) => client.callTool(args),
            close: () => client.close(),
        }
    }
    try {
        return await open(
            new StreamableHTTPClientTransport(url, { requestInit: { headers } })
        )
    } catch {
        // An SSE-only server (Claude Code's `type: "sse"` entries).
        return open(new SSEClientTransport(url, { requestInit: { headers } }))
    }
}

/**
 * The real memory client: MuninnDB's MCP tools (`muninn_recall`,
 * `muninn_remember`, `muninn_evolve`, `muninn_feedback`) over one
 * connection, opened on the first call and kept. Each answer is checked
 * with Zod; a bad shape, an error result, or a lost connection throws (the
 * engine's `safeMemory` turns it into a journaled error), with the token
 * hidden from every message. `connect` defaults to `connectMuninn`; tests
 * hand in a fake.
 *
 * @example
 * const settings = muninnSettings({ env: process.env, claude_json })
 * if (settings.ok) runEngine({ ..., memory: { client: createMuninnMcpClient({ settings: settings.settings }) } })
 */
export const createMuninnMcpClient = ({
    settings,
    connect,
}: {
    settings: MuninnSettings
    connect?: (args: { settings: MuninnSettings }) => Promise<McpConnection>
}): MemoryClient => {
    let connection: Promise<McpConnection> | null = null
    const connected = (): Promise<McpConnection> => {
        if (connection === null) {
            connection = (connect ?? connectMuninn)({ settings })
            // A failed connect is tried again on the next call.
            connection.catch(() => {
                connection = null
            })
        }
        return connection
    }
    const call = async ({
        name,
        args,
    }: {
        name: string
        args: Record<string, unknown>
    }): Promise<string> => {
        try {
            const { callTool } = await connected()
            const text = toolText({
                result: await callTool({ name, arguments: args }),
            })
            if (!text.ok) throw new Error(text.error)
            return text.text
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            throw new Error(
                hideSecret({ text: `${name}: ${message}`, settings })
            )
        }
    }
    return {
        recall: async ({ vault, query, limit, threshold }) => {
            const text = await call({
                name: 'muninn_recall',
                args: { vault, context: [query], limit, threshold },
            })
            const parsed = parseRecall({ text })
            if (!parsed.ok) throw new Error(parsed.error)
            return parsed.hits
        },
        remember: async ({
            vault,
            type,
            concept,
            content,
            summary,
            tags,
            op_id,
        }) => {
            const text = await call({
                name: 'muninn_remember',
                args: { vault, concept, content, summary, type, tags, op_id },
            })
            const id = parseSavedId({ text })
            if (id === null) {
                throw new Error(
                    `muninn_remember named no id: ${text.slice(0, 200)}`
                )
            }
            return { id }
        },
        evolve: async ({ vault, id, content, reason }) => {
            const text = await call({
                name: 'muninn_evolve',
                args: { vault, id, new_content: content, reason },
            })
            return { id: parseSavedId({ text }) ?? id }
        },
        feedback: async ({ vault, id, useful }) => {
            await call({
                name: 'muninn_feedback',
                args: { vault, engram_id: id, useful },
            })
        },
        close: async () => {
            const open = connection
            connection = null
            if (open !== null) await (await open).close()
        },
    }
}
