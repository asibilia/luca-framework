#!/usr/bin/env bun
/**
 * Luca — Custom Mastra Code distribution.
 *
 * Rewires Luca's 11-step AI coding workflow into Mastra-native primitives:
 * 9 modes (3 stock + 6 pipeline), 7 subagent types, 6 custom tools, and workflow state.
 *
 * Usage:
 *   bun run packages/luca-mastracode/src/index.ts
 *   # or via the monorepo script:
 *   bun run mastracode
 */
import {
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Agent } from '@mastra/core/agent'
import { WORKSPACE_TOOLS } from '@mastra/core/workspace'
import { createMastraCode } from 'mastracode'
import { MastraTUI } from 'mastracode/tui'

import { ContextRefresher } from './context-refresher.js'
import {
    readLucaState,
    writeLucaState,
    type LucaWorkflowState,
} from './luca-store.js'
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

// ---------------------------------------------------------------------------
// Branding — load from .planning/config.json if present
// ---------------------------------------------------------------------------

interface LucaBranding {
    name: string
    tagline: string
}

function loadBranding(): LucaBranding {
    const configPath = join(process.cwd(), '.planning', 'config.json')
    if (existsSync(configPath)) {
        try {
            const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
            return {
                name: raw.branding?.name ?? 'Luca',
                tagline:
                    raw.branding?.tagline ?? 'AI-powered development workflow',
            }
        } catch {
            // Fall through to defaults
        }
    }
    return { name: 'Luca', tagline: 'AI-powered development workflow' }
}

// ---------------------------------------------------------------------------
// Static agent builder — creates Agent instances with dynamic instructions/model
// ---------------------------------------------------------------------------

/**
 * Create a static agent for a Luca mode.
 * Returns a single Agent instance with dynamic `instructions` and `model`
 * callbacks. The harness init loop injects memory (for Observational Memory)
 * into static agents — factory agents `(state) => Agent` are skipped, which
 * breaks OM. Using static agents with dynamic callbacks gives us both:
 *   - Dynamic behavior (instructions/model change per-request)
 *   - Proper memory injection from the harness
 *
 * Model resolution uses Mastra Code's `resolveModel` (which handles OAuth,
 * stored API keys, and the Claude Max provider) via the mutable
 * `resolveModelRef`.
 */

// ---------------------------------------------------------------------------
// Per-mode tool subsets — driven by the permission manifest in
// tools/mode-permissions.ts. Each mode gets only the tools (and actions)
// its instructions actually use. See that file for the full access matrix.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Core operating rules — compact summary prepended to EVERY mode agent's
// instructions (primacy zone) for attention-curve exploitation.
// ---------------------------------------------------------------------------
const CORE_OPERATING_RULES = `## Core Operating Rules
- No temp files or shell commands for edits — use edit tools only.
- No prose between consecutive tool calls — invoke tools directly.
- Respect mode boundaries — read-only means read-only.
`

// ---------------------------------------------------------------------------
// Universal constraints — appended to EVERY mode agent's instructions.
// ---------------------------------------------------------------------------
const HARD_CONSTRAINTS = `
## Hard Constraints (all modes)

- **Never use temp files as an edit workaround** because it bypasses the harness's change tracking and makes modifications invisible to the review and verification pipeline. Do not write content to a temporary file and then copy, move, or \`cat\` it into the target file. Do not use \`sed\`, \`awk\`, \`cp\`, \`mv\`, \`tee\`, heredocs, or any shell command to bypass the edit tools (\`string_replace_lsp\`, \`write_file\`, \`ast_smart_edit\`). If you don't have permission to edit a file, that restriction is intentional — do not circumvent it.
- **Never shell out for file edits** because execute_command output is not tracked by edit tools, so changes cannot be verified, reviewed, or rolled back by the harness. All file modifications must go through the provided edit tools, not through \`execute_command\`. The only exception is running build/test/lint commands.
- **Respect mode boundaries** because mode restrictions separate concerns — a read-only mode that secretly writes files corrupts the verification guarantee of subsequent phases. If your mode is read-only, do not attempt any workaround to modify files. Report what needs to change and let the appropriate mode handle it.
- **Do NOT generate explanatory prose between consecutive tool calls** because text between tool calls wastes tokens and slows execution. If your next action is a tool call, invoke it directly.
`

const RECENCY_REMINDERS = `## Reminders (re-read before every tool call)
- Check your mode. If read-only, do NOT write.
- No prose between tool calls.
- When done: call switch-mode (pipeline) or stop (stock modes).
`

// ---------------------------------------------------------------------------
// Rules — load bundled alwaysApply rules and append to every agent's prompt
// ---------------------------------------------------------------------------

/**
 * Parse YAML-ish frontmatter from a rule .md file.
 * Returns { frontmatter, body } where frontmatter is a simple key-value map.
 * Handles the subset we need (description, alwaysApply) without a full YAML parser.
 */
function parseRuleFrontmatter(content: string): {
    frontmatter: Record<string, string>
    body: string
} {
    const fm: Record<string, string> = {}
    if (!content.startsWith('---')) return { frontmatter: fm, body: content }
    // Match closing --- on its own line to avoid false matches inside values
    const endMatch = content.match(/\r?\n---\s*(?:\r?\n|$)/)
    if (!endMatch || endMatch.index === undefined)
        return { frontmatter: fm, body: content }
    const endIdx = endMatch.index
    const fmBlock = content.slice(3, endIdx).trim()
    for (const line of fmBlock.split('\n')) {
        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) continue
        const key = line.slice(0, colonIdx).trim()
        const val = line
            .slice(colonIdx + 1)
            .trim()
            .replace(/^["']|["']$/g, '')
        fm[key] = val
    }
    return {
        frontmatter: fm,
        body: content.slice(endIdx + endMatch[0].length).trim(),
    }
}

/**
 * Load all rules with `alwaysApply: true` from a directory and return their
 * bodies concatenated into a single instruction block.
 *
 * Reads from the installed `.mastracode/rules/` directory (synced from
 * bundled rules at startup) with a fallback to the bundled directory.
 */
function loadAlwaysApplyRules(): string {
    const installedDir = join(process.cwd(), '.mastracode', 'rules')
    const bundledDir = join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        'rules'
    )
    const rulesDir = existsSync(installedDir) ? installedDir : bundledDir
    if (!existsSync(rulesDir)) return ''

    const blocks: string[] = []
    for (const file of readdirSync(rulesDir).sort()) {
        if (!file.endsWith('.md')) continue
        try {
            const raw = readFileSync(join(rulesDir, file), 'utf-8')
            const { frontmatter, body } = parseRuleFrontmatter(raw)
            if (frontmatter.alwaysApply === 'true' && body) {
                blocks.push(body)
            }
        } catch (error) {
            console.warn(
                `[luca] Warning: failed to load rule "${file}": ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
        }
    }
    return blocks.length > 0 ? blocks.join('\n\n') : ''
}

function getAgentConstraints(): string {
    const alwaysApplyRules = loadAlwaysApplyRules()
    return ['\n\n---\n', HARD_CONSTRAINTS, alwaysApplyRules, RECENCY_REMINDERS]
        .filter(Boolean)
        .join('\n\n')
}

function createStaticAgent({
    id,
    name,
    defaultModelId,
    buildInstructions,
    resolveModelFn,
    tools,
}: {
    id: string
    name: string
    defaultModelId: string
    buildInstructions: () => string
    resolveModelFn: () => string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: Record<string, any>
}): Agent {
    return new Agent({
        id,
        name: `Luca ${name}`,
        // Dynamic instructions: called per-request, reads luca-store at call time.
        // CORE_OPERATING_RULES is prepended (primacy zone) and
        // getAgentConstraints() is appended (recency zone) to every mode's instructions.
        instructions: () =>
            CORE_OPERATING_RULES +
            '\n\n' +
            buildInstructions() +
            getAgentConstraints(),
        // Dynamic model: called per-request, resolves via OAuth-aware pipeline
        model: () => {
            const modelId = resolveModelFn() ?? defaultModelId
            if (resolveModelRef.current) {
                return resolveModelRef.current(modelId)
            }
            return modelId
        },
        // Dynamic tools: merge static mode tools + MCP tools at request time.
        // Static tools (from buildModeTools) are preserved; MCP tools (e.g. MuninnDB)
        // are layered on top via mcpManagerRef, mirroring how stock mastracode's
        // codeAgent gets them via createDynamicTools.
        tools: () => {
            const mcpTools = mcpManagerRef.current?.getTools() ?? {}
            return { ...tools, ...mcpTools }
        },
    })
}

// ---------------------------------------------------------------------------
// Slash commands — copy bundled .md commands into .mastracode/commands/
// ---------------------------------------------------------------------------

function installSlashCommands() {
    // Resolve the commands directory bundled alongside this script
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const bundledCommandsDir = join(thisDir, '..', 'commands')

    if (!existsSync(bundledCommandsDir)) return

    // Install into the project's .mastracode/commands/ directory
    const targetDir = join(process.cwd(), '.mastracode', 'commands')
    if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
    }

    cpSync(bundledCommandsDir, targetDir, {
        recursive: true,
        force: true, // Always sync bundled commands so updates propagate
    })
}

// ---------------------------------------------------------------------------
// Skills — copy bundled skill folders into .mastracode/skills/
// ---------------------------------------------------------------------------

function installSkills() {
    // Resolve the skills directory bundled alongside this script
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const bundledSkillsDir = join(thisDir, '..', 'skills')

    if (!existsSync(bundledSkillsDir)) return

    // Install into the project's .mastracode/skills/ directory
    const targetDir = join(process.cwd(), '.mastracode', 'skills')
    if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
    }

    cpSync(bundledSkillsDir, targetDir, {
        recursive: true,
        force: true, // Always sync bundled skills so updates propagate
    })
}

// ---------------------------------------------------------------------------
// Rules — copy bundled rule .md files into .mastracode/rules/
// ---------------------------------------------------------------------------

function installRules() {
    // Resolve the rules directory bundled alongside this script
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const bundledRulesDir = join(thisDir, '..', 'rules')

    if (!existsSync(bundledRulesDir)) return

    // Bundled rules are authoritative — clear the installed dir first so
    // stale rules removed from the bundle don't persist indefinitely.
    const targetDir = join(process.cwd(), '.mastracode', 'rules')
    if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true })
    }
    mkdirSync(targetDir, { recursive: true })

    cpSync(bundledRulesDir, targetDir, {
        recursive: true,
        force: true,
    })
}

// ---------------------------------------------------------------------------
// Continuation messages — sent to the new agent after a pipeline mode switch
// ---------------------------------------------------------------------------
function buildContinuationMessage(
    modeId: string,
    state: LucaWorkflowState
): string {
    const intent = state.intent ?? 'Continue the current workflow.'
    const complexity = state.complexity ?? 'MODERATE'
    const todos = state.assignedTodos?.length
        ? `\nAssigned TODOs: #${state.assignedTodos.join(', #')}`
        : ''
    const areas = state.affectedAreas?.length
        ? `\nAffected areas: ${state.affectedAreas.join(', ')}`
        : ''

    switch (modeId) {
        case 'luca:2-research':
            return [
                `[Luca Pipeline — auto-continuing from Triage]`,
                ``,
                `Intent: ${intent}`,
                `Complexity: ${complexity}`,
                `Oversight: ${state.oversight ?? 'full-auto'}`,
                todos,
                areas,
                ``,
                `Begin research. Use the workflowState tool to read the full triage state, then investigate the affected areas using the research dimensions from your instructions. When research is complete, save findings and transition to Architect mode.`,
            ]
                .filter(Boolean)
                .join('\n')

        case 'luca:3-architect':
            return [
                `[Luca Pipeline — auto-continuing from Research]`,
                ``,
                `Intent: ${intent}`,
                `Complexity: ${complexity}`,
                todos,
                areas,
                ``,
                `Begin planning. Use the workflowState tool to read the research findings, then create a structured implementation plan following goal-backward analysis. When the plan is approved, transition to Execute mode.`,
            ]
                .filter(Boolean)
                .join('\n')

        case 'luca:4-execute': {
            const planFile = state.planFile ?? '.planning/PLAN.md'
            const roadmapFile = state.roadmapFile ?? '.planning/ROADMAP.md'
            return [
                `[Luca Pipeline — auto-continuing from Architect]`,
                ``,
                `Intent: ${intent}`,
                `Complexity: ${complexity}`,
                todos,
                areas,
                ``,
                `Plan file: ${planFile}`,
                `Roadmap file: ${roadmapFile}`,
                ``,
                `Begin execution. Read the plan from ${planFile} on disk using workspace tools (view/find_files) — this contains the atomic task definitions. Read ${roadmapFile} for phase sequencing. Do NOT re-create the plan. Implement changes in waves, run checks after each wave. When all waves are complete, transition to Review mode.`,
            ]
                .filter(Boolean)
                .join('\n')
        }

        case 'luca:5-review':
            return [
                `[Luca Pipeline — auto-continuing from Execute]`,
                ``,
                `Intent: ${intent}`,
                `Complexity: ${complexity}`,
                todos,
                ``,
                `Review the code changes against the plan. Read .planning/PLAN.md (or planFile from workflow state) and the changed files,`,
                `then spawn reviewer subagents for a multi-perspective audit. Produce a REVIEW report.`,
                `If must-fix issues are found, create an iteration plan and transition back to Execute.`,
                `If clean, transition to Finalize.`,
            ]
                .filter(Boolean)
                .join('\n')

        case 'luca:6-finalize':
            return [
                `[Luca Pipeline — auto-continuing from Review]`,
                ``,
                `Intent: ${intent}`,
                `Complexity: ${complexity}`,
                todos,
                ``,
                `Begin finalization. Run final checks, perform gap audit, create PR if appropriate, and complete the session with final metrics. Read the latest .planning/REVIEW-*.md report for context on what was reviewed.`,
            ]
                .filter(Boolean)
                .join('\n')

        case 'luca:1-triage':
            return [
                `[Luca Pipeline — starting]`,
                ``,
                `A user has requested the Luca development workflow.`,
                intent !== 'Continue the current workflow.'
                    ? `User request: ${intent}`
                    : '',
                todos,
                areas,
                ``,
                `Follow your triage instructions exactly:`,
                `1. Parse the request into structured intent`,
                `2. Classify complexity using the classifyComplexity tool`,
                `3. Save state with workflowState(action: "write", updates: {...})`,
                `4. IMMEDIATELY call workflowState(action: "switch-mode", targetMode: "<luca:2-research|luca:3-architect>")`,
                ``,
                `Do NOT implement anything. Do NOT create task lists. Do NOT modify files.`,
                `Your ONLY job is to classify and transition.`,
            ]
                .filter(Boolean)
                .join('\n')

        default:
            return `Continue the Luca workflow. Current intent: ${intent}`
    }
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

async function main() {
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
                    tools: buildModeTools({ mode_id: 'luca:discuss' }),
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
                    tools: buildModeTools({ mode_id: 'luca:1-triage' }),
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
                    tools: buildModeTools({ mode_id: 'luca:2-research' }),
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
                    tools: buildModeTools({ mode_id: 'luca:3-architect' }),
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
                    tools: buildModeTools({ mode_id: 'luca:4-execute' }),
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
                    tools: buildModeTools({ mode_id: 'luca:5-review' }),
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
                    tools: buildModeTools({ mode_id: 'luca:6-finalize' }),
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
        initialState: {
            observationThreshold: 50_000,
            reflectionThreshold: 60_000,
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
        }
    })

    // Inject MCP tools into subagents that need them.
    // We mutate the subagentList objects (the same objects the harness holds)
    // so that MCP tools are available when createSubagentTool spawns agents.
    if (mcpManager) {
        const mcpTools = mcpManager.getTools()
        const mcpSubagentIds = new Set([
            'discussion',
            'learner',
            'shadow-scanner',
        ])
        for (const sub of subagentList) {
            if (mcpSubagentIds.has(sub.id)) {
                sub.tools = { ...(sub.tools ?? {}), ...mcpTools }
            }
        }
    }

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

    const READ_ONLY_MODES = new Set([
        'plan',
        'luca:discuss',
        'luca:1-triage',
        'luca:2-research',
        'luca:5-review',
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

    // --- Install slash commands into project .mastracode/commands/ ---
    installSlashCommands()

    // --- Install bundled skills into project .mastracode/skills/ ---
    installSkills()

    // --- Install bundled rules into project .mastracode/rules/ ---
    installRules()

    // --- Launch TUI ---
    const tui = new MastraTUI({
        harness,
        hookManager,
        authStorage,
        mcpManager,
        appName: branding.name,
        inlineQuestions: true,
    })

    // Stale pipeline state is handled by two explicit guards:
    // 1. reset-pipeline (called by finalize) clears all session-scoped fields
    // 2. switch-mode to triage detects stale state and prompts the user
    // No startup wipe needed — avoids data loss if pipeline was interrupted mid-flight.

    await tui.run()
}

// --- Suppress Claude Code-format skill loading noise ---
// Mastra Code's WorkspaceSkills loader expects YAML frontmatter in SKILL.md files,
// but Luca's compiled skills use Claude Code format (# name\n\ndescription).
// The errors are non-fatal (skills are just skipped), so we suppress the noise.
const _origError = console.error
const _origWarn = console.warn
console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('[WorkspaceSkills]'))
        return
    _origError(...args)
}
console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('[WorkspaceSkills]'))
        return
    _origWarn(...args)
}

// Run
main().catch((err) => {
    console.error('Luca startup failed:', err)
    process.exit(1)
})

export { main }
