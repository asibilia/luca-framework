// MCP-transport schema shim.
//
// The runtime-agnostic write-surface types (ToolContext, ToolDescriptor,
// WriteResult) live in src/write-surface/ (v13 plan, Phase A). This file
// re-exports them for the MCP transport shell and keeps the only
// genuinely MCP-coupled type — the SDK CallToolResult alias used at the
// transport boundary.

import { z } from 'zod'

import type {
    ToolContext,
    ToolDescriptor,
    WriteResult,
} from '../write-surface/index.ts'

// Re-export the runtime-agnostic write-surface types so existing MCP
// imports (`from '../schemas.ts'`) keep resolving.
export type { ToolContext, ToolDescriptor, WriteResult }

/**
 * Handler result type at the MCP transport boundary.
 *
 * A {@link WriteResult} is structurally a valid MCP `CallToolResult`
 * (`{ content: { type: 'text'; text: string }[]; isError?: boolean }`),
 * so the server returns handler results as-is — no adapter needed.
 */
export type ToolResult = WriteResult

// Re-export Zod for tool definition convenience.
export { z }
