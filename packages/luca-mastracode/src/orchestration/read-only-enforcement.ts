/**
 * Read-only enforcement — disable write/execute workspace tools in
 * non-editing modes (plan, discuss, triage, research, review).
 *
 * Extracted from launch.ts. See inline comments for why this approach
 * is necessary (permissionRules + yolo bypass, async setState race).
 */
import { WORKSPACE_TOOLS } from '@mastra/core/workspace'

import { MODES } from '../constants/mode-ids.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const READ_ONLY_MODES = new Set<string>([
    'plan',
    MODES.discuss,
    MODES.triage,
    MODES.research,
    MODES.review,
])

// Tool name overrides matching stock mastracode TOOL_NAME_OVERRIDES.
// setToolsConfig does a full replacement (not a merge), so we must include
// name overrides for ALL tools to preserve the rename from mastra_workspace_*
// to the short names the model knows (view, write_file, etc.).
const WS_TOOL_NAMES: Record<string, { name: string }> = {
    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { name: 'view' },
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { name: 'write_file' },
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: { name: 'string_replace_lsp' },
    [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: { name: 'find_files' },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { name: 'delete_file' },
    [WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: { name: 'file_stat' },
    [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: { name: 'mkdir' },
    [WORKSPACE_TOOLS.FILESYSTEM.GREP]: { name: 'search_content' },
    [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: { name: 'ast_smart_edit' },
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { name: 'execute_command' },
    [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
        name: 'get_process_output',
    },
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: { name: 'kill_process' },
    [WORKSPACE_TOOLS.LSP.LSP_INSPECT]: { name: 'lsp_inspect' },
}

// Tools disabled in read-only modes. enabled: false removes them from the
// AI SDK tool registry — the model literally cannot call them.
const READ_ONLY_DISABLED: Record<string, { name: string; enabled: false }> = {
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
        name: 'write_file',
        enabled: false,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
        name: 'string_replace_lsp',
        enabled: false,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: {
        name: 'ast_smart_edit',
        enabled: false,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
        name: 'delete_file',
        enabled: false,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: {
        name: 'mkdir',
        enabled: false,
    },
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
        name: 'execute_command',
        enabled: false,
    },
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: {
        name: 'kill_process',
        enabled: false,
    },
}

// The merged config for read-only modes: all tool name overrides preserved,
// with write/execute tools disabled.
const READ_ONLY_TOOLS_CONFIG = { ...WS_TOOL_NAMES, ...READ_ONLY_DISABLED }

// Belt-and-suspenders: permissionRules as a secondary layer. This is
// currently inert when yolo=true, but costs nothing and will activate
// if a future mastracode version fixes the yolo bypass.
const READ_ONLY_DENY_TOOLS: Record<string, 'deny'> = {
    write_file: 'deny',
    string_replace_lsp: 'deny',
    ast_smart_edit: 'deny',
    execute_command: 'deny',
    delete_file: 'deny',
    mkdir: 'deny',
    kill_process: 'deny',
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Harness shape required by the read-only enforcement module.
 * Uses the minimal interface to avoid importing the full harness type.
 */
interface HarnessLike {
    getCurrentModeId: () => string
    getWorkspace: () =>
        | { setToolsConfig: (config: Record<string, unknown>) => void }
        | undefined
    subscribe: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: (event: any) => void
    ) => void
    setState: (state: Record<string, unknown>) => Promise<void>
}

/**
 * Patch the harness workspace factory to enforce read-only tool access
 * in non-editing modes, and subscribe to mode changes to sync permissions.
 *
 * Stock getDynamicWorkspace (chunk-BTG3AOXO.js:486-499) only disables 3
 * write tools for literal modeId === "plan". Our custom read-only modes
 * (discuss, triage, research, review) get no workspace-level restrictions.
 *
 * The ONLY reliable mechanism is Workspace.setToolsConfig({ enabled: false })
 * which removes tools from the AI SDK toolset entirely.
 */
export function enforceReadOnlyModes({
    harness,
}: {
    harness: HarnessLike
}): void {
    // Intercept the workspace factory to enforce read-only modes.
    // getDynamicWorkspace (called per-message via buildRequestContext) only
    // disables 3 write tools for literal "plan" mode. Our wrapper runs AFTER
    // the stock function and overrides setToolsConfig for ALL read-only modes.
    //
    // NOTE: Accesses TypeScript private field `workspaceFn` via runtime cast.
    // TS private is compile-time only; JS doesn't enforce it. If @mastra/core
    // switches to ES private fields (#workspaceFn), this will need updating.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalWorkspaceFn = (harness as any).workspaceFn
    if (!originalWorkspaceFn) {
        console.warn(
            '[luca] WARNING: harness.workspaceFn not found — read-only mode enforcement is DISABLED. ' +
                'This likely means @mastra/core changed its private field layout. ' +
                'File an issue at https://github.com/mastra-ai/mastra.'
        )
    }
    if (originalWorkspaceFn) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(harness as any).workspaceFn = async (args: any) => {
            const workspace = await Promise.resolve(originalWorkspaceFn(args))
            if (workspace && READ_ONLY_MODES.has(harness.getCurrentModeId())) {
                workspace.setToolsConfig(READ_ONLY_TOOLS_CONFIG)
            }
            return workspace
        }
    }

    // Also enforce on the cached workspace when modes change outside the request
    // flow (e.g. slash commands that call resolveWorkspace() directly).
    harness.subscribe((event) => {
        if (event.type !== 'mode_changed') return
        const ws = harness.getWorkspace()
        if (!ws) return
        if (READ_ONLY_MODES.has(event.modeId)) {
            ws.setToolsConfig(READ_ONLY_TOOLS_CONFIG)
        } else {
            // Restore stock name overrides (all tools enabled).
            ws.setToolsConfig(WS_TOOL_NAMES)
        }
    })

    // Secondary layer: permissionRules via setState.
    // harness.subscribe expects a sync handler — fire-and-forget the promise
    // and catch rejections explicitly to avoid unhandled promise rejections.
    harness.subscribe((event) => {
        if (event.type !== 'mode_changed') return

        const permissionRules = READ_ONLY_MODES.has(event.modeId)
            ? {
                  categories: {
                      read: 'allow',
                      edit: 'deny',
                      execute: 'deny',
                      mcp: 'allow',
                  },
                  tools: READ_ONLY_DENY_TOOLS,
              }
            : { categories: {}, tools: {} }

        void harness.setState({ permissionRules }).catch((error: unknown) => {
            console.warn(
                '[luca] Failed to update permission rules for mode change.',
                error
            )
        })
    })
}
