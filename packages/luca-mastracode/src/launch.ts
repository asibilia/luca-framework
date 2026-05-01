/**
 * Luca harness launcher.
 *
 * Wires the createMastraCode harness together: registers Luca modes,
 * subagents, hooks, MCP, the TUI, and a battery of upstream-bug workarounds.
 * Exposed as `main()` and invoked by the CLI entry point in `index.ts`.
 */
import { existsSync, readFileSync } from 'node:fs'

import { WORKSPACE_TOOLS } from '@mastra/core/workspace'
import { createMastraCode } from 'mastracode'
import { MastraTUI } from 'mastracode/tui'

import { loadBranding, resolveLucaVersion } from './branding.js'
import { ContextRefresher } from './context-refresher.js'
import { buildContinuationMessage } from './continuation-messages.js'
import { createStaticAgent } from './create-static-agent.js'
import {
    installRules,
    installSkills,
    installSlashCommands,
} from './install-bundled-assets.js'
import { readLucaState, writeLucaState } from './luca-store.js'
import {
    resolveMastracodeSettingsPath,
    resolvePackModelForMode,
} from './mastracode-config.js'
import {
    architectMode,
    buildArchitectInstructions,
    resolveArchitectModel,
} from './modes/architect.js'
import {
    buildBuildInstructions,
    buildMode,
    resolveBuildModel,
} from './modes/build.js'
import {
    buildDiscussInstructions,
    discussMode,
    resolveDiscussModel,
} from './modes/discuss.js'
import {
    buildExecuteInstructions,
    executeMode,
    resolveExecuteModel,
} from './modes/execute.js'
import {
    buildFastInstructions,
    fastMode,
    resolveFastModel,
} from './modes/fast.js'
import {
    buildFinalizeInstructions,
    finalizeMode,
    resolveFinalizeModel,
} from './modes/finalize.js'
import {
    buildPlanInstructions,
    planMode,
    resolvePlanModel,
} from './modes/plan.js'
import {
    buildResearchInstructions,
    researchMode,
    resolveResearchModel,
} from './modes/research.js'
import {
    buildReviewInstructions,
    resolveReviewModel,
    reviewMode,
} from './modes/review.js'
import {
    buildTriageInstructions,
    resolveTriageModel,
    triageMode,
} from './modes/triage.js'
import { MODES } from './constants/mode-ids.js'
import * as pipelineGuard from './pipeline-guard.js'
import {
    buildPipelineProgressHeader,
    PIPELINE_STEPS_ORDERED,
    wrapInSystemReminder,
} from './pipeline-tui.js'
// Mutable refs — wired up after createMastraCode() returns. Extracted to
// refs.ts to avoid circular imports with tool modules.
import {
    contextRefresherRef,
    followUpRef,
    mcpManagerRef,
    resolveModelRef,
    switchModeRef,
    tokenBudgetRef,
} from './refs.js'
import { discussionSubagent } from './subagents/discussion.js'
import { executorSubagent } from './subagents/executor.js'
import { learnerSubagent } from './subagents/learner.js'
import { planReviewerSubagent } from './subagents/plan-reviewer.js'
import { plannerSubagent } from './subagents/planner.js'
import { researcherSubagent } from './subagents/researcher.js'
import { reviewerSubagent } from './subagents/reviewer.js'
import { shadowScannerSubagent } from './subagents/shadow-scanner.js'
import { SUBAGENT_SHARED_PREFIX } from './subagents/shared-prefix.js'
import { verifierSubagent } from './subagents/verifier.js'
import { TokenBudgetMonitor } from './token-budget.js'
import { buildModeTools } from './tools/build-mode-tools.js'
import { clipToVisibleWidth, visibleWidth } from './tui-text-helpers.js'

/**
 * Mode-to-model resolver map.
 *
 * Maps custom luca pipeline mode IDs to their model resolvers. Used to force-
 * sync the harness's internal model state (and therefore the TUI status bar)
 * to our config when the mode changes.
 *
 * Stock modes (build / plan / fast) are intentionally excluded: those modes
 * participate in mastracode's model-pack system, so users can pick a per-mode
 * model via /models. Forcing switchModel() on those modes would steamroll the
 * user's persisted selection. Custom luca:* modes are not in any pack, which
 * is why they need this sync.
 */
const PIPELINE_MODE_MODEL_RESOLVERS: Record<string, () => string> = {
    [MODES.discuss]: resolveDiscussModel,
    [MODES.triage]: resolveTriageModel,
    [MODES.research]: resolveResearchModel,
    [MODES.architect]: resolveArchitectModel,
    [MODES.execute]: resolveExecuteModel,
    [MODES.review]: resolveReviewModel,
    [MODES.finalize]: resolveFinalizeModel,
}

/**
 * Subagent IDs that should inherit MCP tools (firecrawl, muninn, etc.)
 * from the harness's mcpManager. Excluded subagents (plan-reviewer,
 * shadow-scanner) operate purely on local files and don't need network /
 * memory tools — keeping their toolset narrow improves decision quality.
 *
 * The actual injection mechanism (a Proxy that forwards to
 * `mcpManager.getTools()` at subagent execute time) lives in `main()`,
 * gated on `mcpManager` being non-null.
 */
const SUBAGENT_INHERITS_MCP = new Set<string>([
    'researcher',
    'discussion',
    'planner',
    'executor',
    'verifier',
    'reviewer',
    'learner',
])

/**
 * Build a Proxy that, when read, forwards to `mcpManager.getTools()`.
 *
 * Used as the `tools` field on each opted-in subagent definition so that
 * `@mastra/core`'s harness, which materializes `definition.tools` via
 * `{ ...definition.tools }` at subagent execute time, picks up whatever
 * MCP tools are connected at that exact moment. The Proxy is stateless
 * and safely shared across every subagent that opts in.
 *
 * Spread relies on `ownKeys` + `getOwnPropertyDescriptor`; the harness
 * also occasionally indexes the record directly (`tools[id]`), which is
 * why `get` and `has` are also forwarded.
 */
function createMcpToolsProxy(mcpManager: {
    getTools: () => Record<string, unknown>
}): Record<string, unknown> {
    return new Proxy({} as Record<string, unknown>, {
        ownKeys() {
            return Reflect.ownKeys(mcpManager.getTools())
        },
        getOwnPropertyDescriptor(_, key) {
            const tools = mcpManager.getTools()
            if (typeof key === 'string' && key in tools) {
                return {
                    enumerable: true,
                    configurable: true,
                    writable: false,
                    value: tools[key],
                }
            }
            return undefined
        },
        get(_, key) {
            if (typeof key !== 'string') return undefined
            return mcpManager.getTools()[key]
        },
        has(_, key) {
            if (typeof key !== 'string') return false
            return key in mcpManager.getTools()
        },
    })
}

export async function main(): Promise<void> {
    const branding = loadBranding()

    // Build subagent list up-front so MCP tools can be injected into the
    // same objects the harness holds (not stale pre-.map() originals).
    const subagentList = [
        researcherSubagent,
        discussionSubagent,
        plannerSubagent,
        planReviewerSubagent,
        executorSubagent,
        verifierSubagent,
        reviewerSubagent,
        learnerSubagent,
        shadowScannerSubagent,
    ].map((sub) => ({
        ...sub,
        instructions: SUBAGENT_SHARED_PREFIX + '\n\n' + sub.instructions,
    }))

    const result = await createMastraCode({
        // --- Stock utility modes ---
        modes: [
            {
                id: buildMode.id,
                name: buildMode.name,
                default: true,
                defaultModelId: buildMode.defaultModelId,
                color: buildMode.color,
                agent: createStaticAgent({
                    id: 'luca-build',
                    name: 'Build',
                    defaultModelId: buildMode.defaultModelId,
                    buildInstructions: buildBuildInstructions,
                    resolveModelFn: resolveBuildModel,
                    tools: buildModeTools({ mode_id: 'build' }),
                }),
            },
            {
                id: planMode.id,
                name: planMode.name,
                defaultModelId: planMode.defaultModelId,
                color: planMode.color,
                agent: createStaticAgent({
                    id: 'luca-plan',
                    name: 'Plan',
                    defaultModelId: planMode.defaultModelId,
                    buildInstructions: buildPlanInstructions,
                    resolveModelFn: resolvePlanModel,
                    tools: buildModeTools({ mode_id: 'plan' }),
                }),
            },
            {
                id: fastMode.id,
                name: fastMode.name,
                defaultModelId: fastMode.defaultModelId,
                color: fastMode.color,
                agent: createStaticAgent({
                    id: 'luca-fast',
                    name: 'Fast',
                    defaultModelId: fastMode.defaultModelId,
                    buildInstructions: buildFastInstructions,
                    resolveModelFn: resolveFastModel,
                    tools: buildModeTools({ mode_id: 'fast' }),
                }),
            },
            {
                id: discussMode.id,
                name: discussMode.name,
                defaultModelId: discussMode.defaultModelId,
                color: discussMode.color,
                agent: createStaticAgent({
                    id: 'luca-discuss',
                    name: 'Discuss',
                    defaultModelId: discussMode.defaultModelId,
                    buildInstructions: buildDiscussInstructions,
                    resolveModelFn: resolveDiscussModel,
                    tools: buildModeTools({ mode_id: MODES.discuss }),
                }),
            },
            // --- Luca pipeline modes ---
            {
                id: triageMode.id,
                name: triageMode.name,
                defaultModelId: triageMode.defaultModelId,
                color: triageMode.color,
                agent: createStaticAgent({
                    id: 'luca-triage',
                    name: 'Triage',
                    defaultModelId: triageMode.defaultModelId,
                    buildInstructions: buildTriageInstructions,
                    resolveModelFn: resolveTriageModel,
                    tools: buildModeTools({ mode_id: MODES.triage }),
                }),
            },
            {
                id: researchMode.id,
                name: researchMode.name,
                defaultModelId: researchMode.defaultModelId,
                color: researchMode.color,
                agent: createStaticAgent({
                    id: 'luca-research',
                    name: 'Research',
                    defaultModelId: researchMode.defaultModelId,
                    buildInstructions: buildResearchInstructions,
                    resolveModelFn: resolveResearchModel,
                    tools: buildModeTools({ mode_id: MODES.research }),
                }),
            },
            {
                id: architectMode.id,
                name: architectMode.name,
                defaultModelId: architectMode.defaultModelId,
                color: architectMode.color,
                agent: createStaticAgent({
                    id: 'luca-architect',
                    name: 'Architect',
                    defaultModelId: architectMode.defaultModelId,
                    buildInstructions: buildArchitectInstructions,
                    resolveModelFn: resolveArchitectModel,
                    tools: buildModeTools({ mode_id: MODES.architect }),
                }),
            },
            {
                id: executeMode.id,
                name: executeMode.name,
                defaultModelId: executeMode.defaultModelId,
                color: executeMode.color,
                agent: createStaticAgent({
                    id: 'luca-execute',
                    name: 'Execute',
                    defaultModelId: executeMode.defaultModelId,
                    buildInstructions: buildExecuteInstructions,
                    resolveModelFn: resolveExecuteModel,
                    tools: buildModeTools({ mode_id: MODES.execute }),
                }),
            },
            {
                id: reviewMode.id,
                name: reviewMode.name,
                defaultModelId: reviewMode.defaultModelId,
                color: reviewMode.color,
                agent: createStaticAgent({
                    id: 'luca-review',
                    name: 'Review',
                    defaultModelId: reviewMode.defaultModelId,
                    buildInstructions: buildReviewInstructions,
                    resolveModelFn: resolveReviewModel,
                    tools: buildModeTools({ mode_id: MODES.review }),
                }),
            },
            {
                id: finalizeMode.id,
                name: finalizeMode.name,
                defaultModelId: finalizeMode.defaultModelId,
                color: finalizeMode.color,
                agent: createStaticAgent({
                    id: 'luca-finalize',
                    name: 'Finalize',
                    defaultModelId: finalizeMode.defaultModelId,
                    buildInstructions: buildFinalizeInstructions,
                    resolveModelFn: resolveFinalizeModel,
                    tools: buildModeTools({ mode_id: MODES.finalize }),
                }),
            },
        ],

        // --- Subagent definitions ---
        // Note: subagents array is built from the local `subagentList` variable
        // so that MCP tools injected after createMastraCode() apply to the same
        // objects the harness holds (not stale pre-.map() originals).
        subagents: subagentList,

        // Note: Luca workflow state (complexity, oversight, pipeline step, etc.)
        // is stored in .planning/luca-state.json via the workflowState tool.
        // We can't use harness.setState() for custom fields because the built-in
        // stateSchema (Zod default strip mode) silently removes unknown keys.

        // Raise OM thresholds to reduce premature compression of subagent outputs
        // in multi-agent workflows (review: 4 parallel, research: 5 parallel).
        //
        // Observer/reflector model overrides via env vars:
        //   LUCA_OBSERVER_MODEL — model ID for observation summarization
        //   LUCA_REFLECTOR_MODEL — model ID for compressing observations
        //
        // Default observer (gemini-2.5-flash) has a 1M context, but Anthropic-only
        // users with 1M-beta access (tier 4) can override to claude-sonnet-4-6
        // to avoid Google API key requirements. Standard 200K Anthropic models
        // (haiku-4-5, opus-4-7) will hit overflow on heavy multi-thread sessions.
        initialState: {
            observationThreshold: 50_000,
            reflectionThreshold: 60_000,
            ...(process.env.LUCA_OBSERVER_MODEL
                ? { observerModelId: process.env.LUCA_OBSERVER_MODEL }
                : {}),
            ...(process.env.LUCA_REFLECTOR_MODEL
                ? { reflectorModelId: process.env.LUCA_REFLECTOR_MODEL }
                : {}),
        },
    })

    const {
        harness,
        hookManager,
        authStorage,
        mcpManager,
        storageWarning,
        resolveModel,
    } = result

    // Wire up the resolveModel ref so mode agent factories use OAuth-aware resolution.
    // resolveModel's full signature has optional params we don't need; narrow to our ref type.
    resolveModelRef.current = (modelId: string) => resolveModel(modelId)

    // Wire up switchMode ref so the workflowState tool can switch modes directly.
    // We can't use harness state for mode switching because the built-in Zod
    // stateSchema strips unknown keys (our lucaNextMode field gets silently removed).
    switchModeRef.current = async (modeId: string) => {
        await harness.switchMode({ modeId })
    }

    // Wire up followUp ref so the pipeline guard can send corrective messages
    // when a pipeline agent completes without calling switch-mode.
    followUpRef.current = async (opts: { content: string }) => {
        await harness.followUp(opts)
    }

    // Wire up mcpManager ref so mode agents can merge MCP tools at request time.
    if (mcpManager) {
        mcpManagerRef.current = mcpManager

        // Install an MCP tool forwarder on each opted-in subagent. The
        // forwarder is a Proxy that resolves to mcpManager.getTools() at the
        // moment the harness materializes tools for a subagent invocation —
        // see @mastra/core's harness, which reads `definition.tools` as
        // `mergedTools = { ...definition.tools }` at subagent execute time.
        // Spread invokes the Proxy's `ownKeys` + `getOwnPropertyDescriptor`
        // traps, materializing whatever MCP tools are connected right then.
        //
        // Why a Proxy instead of `definition.tools = { ...static, ...mcpManager.getTools() }`:
        //
        //   1. Timing-free: getTools() is only called once a subagent is
        //      actually invoked, well after both our wire-up and mastracode's
        //      own `mcpManager.initInBackground()` call inside `tui.init()`.
        //      No await, no double-init race, no startup delay if servers
        //      are slow or unreachable.
        //   2. Mid-session reloads (user reconfigures servers via slash
        //      command) are reflected automatically — no stale snapshot.
        //
        // Why not `HarnessConfig.tools` + `allowedHarnessTools`:
        // `allowedHarnessTools` is a strict static `string[]` allowlist with
        // no wildcard support, but MCP tool IDs are discovered at server-
        // connect time so we can't enumerate them at subagent definition
        // time.
        //
        // The same Proxy instance is shared across all opted-in subagents
        // because it's stateless (every trap reads `mcpManager.getTools()`
        // fresh).
        const mcpToolsProxy = createMcpToolsProxy(mcpManager)
        for (const sub of subagentList) {
            if (SUBAGENT_INHERITS_MCP.has(sub.id)) {
                sub.tools = mcpToolsProxy as typeof sub.tools
            }
        }
    }

    // Wire up token budget monitor for context window management.
    const tokenBudget = new TokenBudgetMonitor()
    tokenBudgetRef.current = tokenBudget

    // Wire up context refresher for mid-conversation injection.
    const contextRefresher = new ContextRefresher(async (opts) => {
        if (followUpRef.current) {
            await followUpRef.current(opts)
        }
    })

    // Wire up context refresher ref so the workflowState tool can call
    // setMode() on mode transitions.
    contextRefresherRef.current = contextRefresher

    // Connect token budget thresholds to context refresher.
    tokenBudget.onThresholdCrossed((threshold, state) => {
        // Fire-and-forget: don't block the monitor on async followUp
        contextRefresher.handleThreshold(threshold, state).catch(() => {})
    })

    // Subscribe to harness events for token tracking and mode synchronization.
    harness.subscribe((event) => {
        if (event.type === 'message_end') {
            // Extract text from message content parts for token estimation.
            const text = (event.message.content ?? [])
                .map(
                    (c: {
                        type: string
                        text?: string
                        thinking?: string
                        result?: unknown
                    }) => {
                        if (c.type === 'text') return c.text
                        if (c.type === 'thinking') return c.thinking
                        if (c.type === 'tool_result')
                            return typeof c.result === 'string'
                                ? c.result
                                : JSON.stringify(c.result ?? '')
                        return ''
                    }
                )
                .join('')
            if (!text) return
            if (event.message.role === 'user') {
                tokenBudget.recordInput(text)
            } else {
                tokenBudget.recordOutput(text)
            }
        }
        if (event.type === 'tool_end') {
            tokenBudget.recordToolCall()
        }
        if (event.type === 'agent_end') {
            tokenBudget.recordTurn()
        }
        if (event.type === 'mode_changed') {
            // Primary source for mode sync — fires on all mode changes including
            // initial load, pipeline-guard redirects, and manual user switches.
            // The workflowState tool also calls setMode() as a secondary source.
            contextRefresher.setMode(event.modeId)
            // Reset INJECT_REMINDERS threshold so each mode can get its own reminder.
            tokenBudget.clearThreshold('INJECT_REMINDERS')
            // Sync the harness's internal model state on mode_changed so the
            // TUI status bar reflects our mode config for custom luca:* pipeline
            // modes. Note: this only fires on mode transitions — agent models
            // are still resolved per-request via createStaticAgent's dynamic
            // model() function, so the effective model for an API call can
            // change within a mode (e.g., triage swapping after complexity is
            // written) without re-firing this handler. Stock modes (build /
            // plan / fast) are deliberately excluded; they belong to the model
            // pack system and forcing switchModel here would override the
            // user's persisted /models selection.
            const resolver = PIPELINE_MODE_MODEL_RESOLVERS[event.modeId]
            if (resolver) {
                const targetModel = resolver()
                harness
                    .switchModel({ modelId: targetModel })
                    .catch((err: unknown) => {
                        // Fire-and-forget, but surface failures so a stale
                        // status bar (the original symptom this fix targets)
                        // is debuggable rather than silently broken.
                        console.error(
                            `[luca] mode_changed switchModel failed for ${event.modeId} -> ${targetModel}:`,
                            err
                        )
                    })
            }
        }
    })

    // --- Read-only enforcement: disable write/execute workspace tools.
    //
    // Stock getDynamicWorkspace (chunk-BTG3AOXO.js:486-499) only disables 3
    // write tools for literal modeId === "plan". Our custom read-only modes
    // (discuss, triage, research, review) get no workspace-level restrictions.
    //
    // The permissionRules + yolo: false approach does NOT work because:
    //   1. yolo=true (default) → requireToolApproval: false → AI SDK never fires
    //      tool-call-approval events → permissionRules denial is never checked
    //   2. Async setState race: switchMode's void setState({ currentModelId })
    //      can overwrite our yolo: false via concurrent read-then-write
    //
    // The ONLY reliable mechanism is Workspace.setToolsConfig({ enabled: false })
    // which removes tools from the AI SDK toolset entirely. Per Mastra docs:
    // "Changes take effect on the next agent interaction (the next
    // createWorkspaceTools() call)."
    //
    // Since getDynamicWorkspace calls setToolsConfig on every message (line 499),
    // we must intercept workspaceFn to apply our config AFTER the stock function.

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
    const READ_ONLY_DISABLED: Record<string, { name: string; enabled: false }> =
        {
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

    harness.subscribe(async (event) => {
        if (event.type !== 'mode_changed') return
        if (READ_ONLY_MODES.has(event.modeId)) {
            await harness.setState({
                permissionRules: {
                    categories: {
                        read: 'allow',
                        edit: 'deny',
                        execute: 'deny',
                        mcp: 'allow',
                    },
                    tools: READ_ONLY_DENY_TOOLS,
                },
            })
        } else {
            await harness.setState({
                permissionRules: { categories: {}, tools: {} },
            })
        }
    })

    // --- Pipeline guard: detect when submit_plan (or another built-in tool)
    // auto-switches to the default "build" mode during an active pipeline run.
    // In that case, redirect to the correct next pipeline mode instead.
    //
    // IMPORTANT: Only redirect when `nextMode` is set — that's the signal that
    // the pipeline (via workflowState switch-mode) initiated a transition.
    // If `nextMode` is unset, the switch came from the user (Shift+Tab mode
    // picker), and we must NOT redirect — doing so creates an infinite loop
    // (user picks build → guard redirects to finalize → stacked TUI frames → crash).
    // Derive the guard set from the canonical ordered list — single source of truth.
    const PIPELINE_STEPS = new Set<string>(
        PIPELINE_STEPS_ORDERED.map((s) => s.id)
    )
    harness.subscribe(async (event) => {
        if (event.type !== 'mode_changed') return
        if (event.modeId !== 'build') return

        const state = readLucaState()
        // Only intercept if a pipeline is active and the switch wasn't pipeline-driven
        if (!state.pipelineStep || !PIPELINE_STEPS.has(state.pipelineStep))
            return

        // No nextMode means this switch was user-initiated (Shift+Tab picker, etc.).
        // Clear pipeline state and let the user go where they want.
        if (!state.nextMode) {
            writeLucaState({ pipelineStep: undefined, nextMode: undefined })
            return
        }

        if (state.nextMode === 'build') return // Pipeline explicitly requested build — allow it

        // Pipeline wrote a nextMode that isn't "build" — this switch was NOT
        // user-initiated (e.g., submit_plan auto-switched to the default mode).
        // Redirect to the intended pipeline target.
        const redirectTo = state.nextMode

        console.info(
            `⚠ Pipeline guard: intercepted unexpected switch to "build" during pipeline step "${state.pipelineStep}". Redirecting to "${redirectTo}".`
        )

        // Small delay to let the initial switch settle
        await new Promise((r) => setTimeout(r, 100))
        await harness.switchMode({ modeId: redirectTo })
    })

    // --- Auto-continuation: when a pipeline-driven mode switch happens,
    // automatically send a kick-off message to the new mode agent so
    // the pipeline keeps flowing without waiting for user input.
    harness.subscribe(async (event) => {
        if (event.type !== 'mode_changed') return

        const state = readLucaState()
        // Only auto-continue if this switch was driven by the Luca pipeline
        // (i.e., the agent called workflowState switch-mode and wrote nextMode).
        // If the user manually switched modes via the TUI picker, nextMode
        // won't match and we won't send an automatic message.
        if (!state.nextMode || state.nextMode !== event.modeId) return

        // Clear nextMode so we don't re-trigger on manual switches later
        writeLucaState({ nextMode: undefined })

        // Clear stale tasks from the previous mode so the new agent starts fresh
        await harness.setState({ tasks: [] })

        // Build a context-rich kick-off message for the new agent, wrapped in
        // <system-reminder> so MastraTUI renders it as an amber-bordered box.
        const agentInstructions = buildContinuationMessage(event.modeId, state)
        const progressHeader = buildPipelineProgressHeader(event.modeId)
        const kickoff = progressHeader
            ? wrapInSystemReminder(`${progressHeader}\n\n${agentInstructions}`)
            : agentInstructions

        // Small delay to let the TUI finish rendering the mode switch
        await new Promise((r) => setTimeout(r, 200))

        await harness.sendMessage({ content: kickoff })
    })

    // --- Pipeline enforcement watchdog: track tool calls during pipeline mode
    // turns and detect when an agent finishes without calling switch-mode.
    // Uses escalating enforcement: nudge → force.
    harness.subscribe(async (event) => {
        if (event.type === 'mode_changed') {
            if (PIPELINE_STEPS.has(event.modeId)) {
                pipelineGuard.startTurn(event.modeId)
            } else {
                // Switched out of pipeline — stop tracking
                pipelineGuard.resetTurn()
            }
            return
        }

        if (event.type === 'tool_start') {
            pipelineGuard.recordToolStart(
                event.toolCallId,
                event.toolName,
                event.args
            )
            return
        }

        if (event.type === 'tool_end') {
            pipelineGuard.recordToolEnd(event.toolCallId)
            return
        }

        if (event.type === 'agent_end') {
            const enforcement = pipelineGuard.checkTurnCompletion(event.reason)
            if (enforcement) {
                await pipelineGuard.executeEnforcement(enforcement)
            }
            return
        }
    })

    if (storageWarning) {
        console.info(`\u26A0 ${storageWarning}`)
    }

    // --- Install bundled assets into project .mastracode/* ---
    installSlashCommands()
    installSkills()
    installRules()

    // --- Launch TUI ---
    const tui = new MastraTUI({
        harness,
        hookManager,
        authStorage,
        mcpManager,
        appName: branding.name,
        version: resolveLucaVersion(),
        inlineQuestions: true,
    })

    // --- Workaround for upstream mastracode bug (tracked: issue #173) ---
    //
    // `AskQuestionInlineComponent` (used by the built-in `ask_user` tool) does
    // not wrap or truncate option labels. Long labels render past the box's
    // inner width, which trips pi-tui's per-line width assertion in
    // `doRender()` and crashes the entire process with:
    //
    //   error: Rendered line N exceeds terminal width (X > Y).
    //
    // Bug location (installed bundle): `chunk-YEHNNDZZ.js:88-99` and
    // surrounding branches in `_AskQuestionInlineBorderedBox._render`, where
    // each option is emitted as `theme.fg("dim", `   ${item.label}`)` with no
    // wrap/truncate step. The question text on the same component IS wrapped
    // via `wrapTextWithAnsi(qLine, innerWidth)`, so this is just a missing
    // wrap on the option labels.
    //
    // We monkey-patch `AskQuestionInlineComponent.prototype.updateArgs` and
    // `.activate` (the two methods that feed option labels into the bordered
    // box) to truncate any label whose visible width would overflow the
    // current terminal. We can't import the class directly because mastracode
    // doesn't re-export it from `mastracode/tui`, so we capture the
    // constructor lazily the first time mastracode stores an instance into
    // `state.pendingAskUserComponents`. After the prototype is patched, all
    // current and future instances pick up the safe behavior.
    //
    // The patch is purely defensive: every internal access is guarded so that
    // if upstream changes shape (rename, drop the Map, swap the methods) we
    // log a warning and no-op rather than crashing startup.
    const askMap = (() => {
        const tuiState = (tui as unknown as { state?: unknown }).state as
            | { pendingAskUserComponents?: unknown }
            | undefined
        const candidate = tuiState?.pendingAskUserComponents
        return candidate instanceof Map ? candidate : undefined
    })()

    if (askMap) {
        const LUCA_ASK_USER_PATCHED = Symbol.for('luca.ask_user.label_truncate')
        const originalSet = askMap.set.bind(askMap)
        askMap.set = function patchedSet(
            toolCallId: unknown,
            instance: unknown
        ) {
            try {
                patchAskQuestionPrototype(instance, LUCA_ASK_USER_PATCHED)
            } catch (err) {
                // Patching is purely defensive — never let it block the question.
                console.error('[luca] ask_user prototype patch failed:', err)
            }
            return originalSet(toolCallId, instance)
        } as typeof askMap.set
    } else {
        console.warn(
            '[luca] ask_user label-truncation patch skipped: ' +
                'tui.state.pendingAskUserComponents is not a Map ' +
                '(upstream mastracode internals may have changed).'
        )
    }

    // --- Workaround for upstream mastracode double-slash bug ---
    //
    // mastracode's `setupAutocomplete` registers custom slash commands by
    // prepending `/` to each command's name (chunk-YEHNNDZZ.js:12399-12404):
    //
    //   slashCommands.push({ name: `/${customCmd.name}`, ... })
    //
    // Built-in commands are registered without the `/` (e.g. `name: "help"`),
    // and pi-tui's autocomplete strips the user's leading `/` before fuzzy
    // matching, then inserts `cmd.name` back. So built-ins round-trip cleanly
    // (`/h` -> match `help` -> insert `help` -> visible as `/help`), but
    // custom commands acquire a duplicate slash (`/l` -> match `/lu` ->
    // insert `/lu` -> visible as `//lu`).
    //
    // Fix: intercept the editor's `setAutocompleteProvider` call. When
    // mastracode wires up the provider (during `init()` -> `setupAutocomplete`),
    // we rewrite the provider's `commands` array to strip any leading `/`
    // from each command name. The lookup paths in mastracode that compare
    // `cmd.name === cmdName` are unaffected because both sides go through
    // the same trimmed value (custom command dispatch in chunk-YEHNNDZZ.js:7468
    // strips the user's leading `/` before comparing).
    //
    // The patch is purely defensive: if upstream restructures the editor or
    // provider, we log a warning and let mastracode's behavior pass through
    // unchanged.
    const editor = (() => {
        const tuiState = (tui as unknown as { state?: unknown }).state as
            | { editor?: unknown }
            | undefined
        const candidate = tuiState?.editor
        if (
            !candidate ||
            typeof (candidate as { setAutocompleteProvider?: unknown })
                .setAutocompleteProvider !== 'function'
        ) {
            return undefined
        }
        return candidate as {
            setAutocompleteProvider: (provider: unknown) => void
        }
    })()

    if (editor) {
        const LUCA_AUTOCOMPLETE_PATCHED = Symbol.for(
            'luca.autocomplete.strip_leading_slash'
        )
        const editorRecord = editor as unknown as Record<symbol, unknown>
        if (!editorRecord[LUCA_AUTOCOMPLETE_PATCHED]) {
            const originalSet = editor.setAutocompleteProvider.bind(editor)
            editor.setAutocompleteProvider = (provider: unknown) => {
                try {
                    if (
                        provider &&
                        typeof provider === 'object' &&
                        Array.isArray(
                            (provider as { commands?: unknown }).commands
                        )
                    ) {
                        const commands = (provider as { commands: unknown[] })
                            .commands
                        for (const cmd of commands) {
                            if (
                                cmd &&
                                typeof cmd === 'object' &&
                                typeof (cmd as { name?: unknown }).name ===
                                    'string' &&
                                (cmd as { name: string }).name.startsWith('/')
                            ) {
                                ;(cmd as { name: string }).name = (
                                    cmd as { name: string }
                                ).name.replace(/^\/+/, '')
                            }
                        }
                    }
                } catch (err) {
                    console.error(
                        '[luca] autocomplete slash-strip patch failed:',
                        err
                    )
                }
                return originalSet(provider)
            }
            editorRecord[LUCA_AUTOCOMPLETE_PATCHED] = true
        }
    } else {
        console.warn(
            '[luca] autocomplete slash-strip patch skipped: ' +
                'tui.state.editor.setAutocompleteProvider is not callable ' +
                '(upstream mastracode internals may have changed).'
        )
    }

    // --- Workaround for upstream mastracode model-pack-on-login bug ---
    //
    // After a successful login, mastracode's `performLogin` (chunk-YEHNNDZZ.js
    // around line 13670-13679) calls:
    //
    //   const defaultModel = PROVIDER_DEFAULT_MODELS[providerId]
    //   await harness.switchModel({ modelId: defaultModel })
    //
    // This blindly switches to the provider's hard-coded default model and
    // ignores the user's currently-selected model pack. For Anthropic, that
    // default is `claude-opus-4-6`, but a user with the Anthropic pack
    // (resolved to `claude-opus-4-7` via OAuth) will be silently downgraded
    // every time they log in or refresh credentials. The status bar then
    // shows the wrong model and `/models` looks out-of-sync with the actual
    // model the agent uses.
    //
    // Fix: wrap `tui.performLogin` so that after the original implementation
    // resolves, we re-apply the active model pack's model for the current
    // mode. We read `settings.json` directly (mastracode doesn't re-export
    // `loadSettings` from the public package entry, so duplicating the read
    // is the smallest viable patch).
    //
    // No-op when:
    //   - No active pack is set (user hasn't picked one — provider default is fine)
    //   - The active pack maps the current mode to the same model mastracode
    //     just selected (already correct)
    //   - Reading settings fails for any reason (degrade gracefully)
    {
        const tuiAny = tui as unknown as {
            performLogin: (providerId: string) => Promise<void>
            state?: { harness?: unknown }
        }
        const originalPerformLogin = tuiAny.performLogin.bind(tui)
        tuiAny.performLogin = async (providerId: string) => {
            await originalPerformLogin(providerId)
            try {
                const settingsPath = resolveMastracodeSettingsPath()
                if (!settingsPath || !existsSync(settingsPath)) return
                const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
                const activeModelPackId = raw?.models?.activeModelPackId
                if (typeof activeModelPackId !== 'string') return

                const harnessAny = (
                    tuiAny.state as { harness?: unknown } | undefined
                )?.harness as
                    | {
                          getCurrentModeId?: () => string
                          switchModel?: (args: {
                              modelId: string
                          }) => Promise<unknown>
                      }
                    | undefined
                if (
                    !harnessAny ||
                    typeof harnessAny.getCurrentModeId !== 'function' ||
                    typeof harnessAny.switchModel !== 'function'
                ) {
                    return
                }

                // Detect OAuth vs API-key access for the provider that was
                // just authenticated. authStorage.isLoggedIn() returns true
                // only for OAuth credentials, which is exactly the
                // distinction `getAvailableModePacks` uses.
                const isOauth =
                    typeof (
                        authStorage as {
                            isLoggedIn?: (id: string) => boolean
                        }
                    ).isLoggedIn === 'function'
                        ? (
                              authStorage as {
                                  isLoggedIn: (id: string) => boolean
                              }
                          ).isLoggedIn(providerId)
                        : false

                const currentModeId = harnessAny.getCurrentModeId()
                const packModelId = resolvePackModelForMode({
                    settings: raw,
                    activeModelPackId,
                    providerId,
                    modeId: currentModeId,
                    isOauth,
                })
                if (!packModelId) return

                await harnessAny.switchModel({ modelId: packModelId })
            } catch (err) {
                console.error(
                    '[luca] post-login model-pack restore failed:',
                    err
                )
            }
        }
    }

    // Stale pipeline state is handled by two explicit guards:
    // 1. reset-pipeline (called by finalize) clears all session-scoped fields
    // 2. switch-mode to triage detects stale state and prompts the user
    // No startup wipe needed — avoids data loss if pipeline was interrupted mid-flight.

    await tui.run()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function patchAskQuestionPrototype(instance: any, marker: symbol) {
    if (!instance || typeof instance !== 'object') return
    const proto = Object.getPrototypeOf(instance)
    if (!proto || proto[marker]) return

    const truncateOptions = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any => {
        if (!Array.isArray(options)) return options
        // The bordered box renders each option as `   ${label}` inside a
        // box that consumes 4 columns of frame (`│ ` + ` │`). Pi-tui also
        // subtracts a 3-column safety buffer (`TERM_WIDTH_BUFFER`) from
        // `process.stdout.columns`. Match that math, then leave 1 extra
        // cell of headroom so a stray wide character can't push us over.
        //
        // No floor clamps: on a tiny terminal the budget can be ≤ 0, and
        // any positive minimum we invent would itself overflow. Instead
        // we degrade to a single-cell ellipsis (or empty) when the budget
        // collapses, which is the only string guaranteed to fit.
        const cols = process.stdout.columns || 80
        const innerWidth = cols - 3 /* TERM_WIDTH_BUFFER */ - 4 /* box */
        const labelBudget = innerWidth - 3 /* "   " prefix */ - 1 /* headroom */
        const ELLIPSIS = '…'
        return options.map((opt: unknown) => {
            if (!opt || typeof opt !== 'object') return opt
            const label = (opt as { label?: unknown }).label
            if (typeof label !== 'string') return opt
            if (visibleWidth(label) <= labelBudget) return opt
            return {
                ...(opt as object),
                label: clipToVisibleWidth(label, labelBudget, ELLIPSIS),
            }
        })
    }

    const originalUpdateArgs = proto.updateArgs
    if (typeof originalUpdateArgs === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        proto.updateArgs = function patchedUpdateArgs(args: any) {
            if (
                args &&
                typeof args === 'object' &&
                Array.isArray((args as { options?: unknown }).options)
            ) {
                args = {
                    ...args,
                    options: truncateOptions(
                        (args as { options: unknown[] }).options
                    ),
                }
            }
            return originalUpdateArgs.call(this, args)
        }
    }

    const originalActivate = proto.activate
    if (typeof originalActivate === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        proto.activate = function patchedActivate(options: any) {
            if (
                options &&
                typeof options === 'object' &&
                Array.isArray(options.options)
            ) {
                options = {
                    ...options,
                    options: truncateOptions(options.options),
                }
            }
            return originalActivate.call(this, options)
        }
    }

    proto[marker] = true
}
