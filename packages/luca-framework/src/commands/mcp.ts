/**
 * CLI command: luca mcp serve
 *
 * Starts the luca MCP server over stdio. Claude Code spawns this on
 * session start (registration written to .claude/settings.json by
 * `luca init`). The server exposes deterministic write tools that the
 * LLM uses to mutate .luca/ — replacing direct Edit/Write attempts that
 * the stage-gate hook would otherwise block.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { defineCommand } from 'citty'

import { createLucaMcpServer, TOOL_REGISTRY } from '../mcp'

const serveCommand = defineCommand({
    meta: {
        name: 'serve',
        description:
            'Start the luca MCP server over stdio (used by Claude Code)',
    },
    async run() {
        const server = createLucaMcpServer({
            cwd: process.cwd(),
            tools: TOOL_REGISTRY,
        })
        const transport = new StdioServerTransport()
        await server.connect(transport)
        // Server runs until stdio is closed by the parent (Claude Code).
    },
})

export const mcpCommand = defineCommand({
    meta: {
        name: 'mcp',
        description:
            'MCP server commands (luca mcp serve runs the stdio server)',
    },
    subCommands: {
        serve: serveCommand,
    },
})
