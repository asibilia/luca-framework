import {
    classifyWritePath,
    coarsePhaseOf,
    isToolAllowed,
    type ToolCategory,
    type WritePathClass,
} from '@alecsibilia/luca-core'

import {
    classifyBashCommand,
    type BashCategory,
} from './classify-bash-command.ts'
import { loadCurrentState } from './load-current-state.ts'

export interface HandleStageGateHookOptions {
    /** Raw JSON string read from PreToolUse stdin. */
    stdin: string
    log?: (msg: string) => void
    /** Project root. Defaults to process.cwd() so the hook works in real
     *  invocations; tests pass a temp dir. */
    cwd?: string
    /** User home directory (for detecting absolute paths under ~/.claude/
     *  or ~/.luca/). Defaults to process.env.HOME. */
    homedir?: string
}

export interface HandleStageGateHookResult {
    /** Exit code returned to Claude Code. 0 = allow, 2 = block with stderr. */
    exitCode: number
    toolName?: string
    toolInput?: unknown
    decision?: 'allow' | 'block'
    /** Reason text on block. */
    reason?: string
}

/**
 * Stage-gate hook handler — enforcement live.
 *
 * Reads the current pipelineStep from .luca/state.json, classifies the
 * tool call into a ToolCategory, looks up the stage-tool matrix, and
 * exits 2 to block any tool call disallowed in the current phase.
 *
 * IDLE is permissive (no enforcement). Other phases apply the matrix from
 * decision:luca-stage-tool-matrix-2026-05-19. Always-denied paths
 * (.git/, ~/.claude/, ~/.luca/, /etc/, /usr/, /var/, /System/, /bin/,
 * /sbin/) are blocked regardless of phase.
 */
export async function handleStageGateHook(
    opts: HandleStageGateHookOptions,
): Promise<HandleStageGateHookResult> {
    const log = opts.log ?? (() => {})

    if (!opts.stdin.trim()) {
        log('stage-gate: empty stdin — allowing')
        return { exitCode: 0, decision: 'allow' }
    }

    let parsed: Record<string, unknown>
    try {
        parsed = JSON.parse(opts.stdin) as Record<string, unknown>
    } catch (err) {
        // Failure to parse hook input is a soft error — allow rather than
        // block (we'd rather miss a check than break Claude Code on a
        // schema drift).
        log(
            `stage-gate: could not parse stdin as JSON — allowing (${
                (err as Error).message
            })`,
        )
        return { exitCode: 0, decision: 'allow' }
    }

    // Accept both snake_case and camelCase keys.
    const toolName =
        (parsed.tool_name as string | undefined) ??
        (parsed.toolName as string | undefined)
    const toolInput =
        (parsed.tool_input as unknown) ?? (parsed.toolInput as unknown)

    const cwd = opts.cwd ?? process.cwd()
    const homedir = opts.homedir ?? process.env.HOME

    const state = await loadCurrentState({ cwd })
    const phase = coarsePhaseOf(state.pipelineStep)

    // IDLE: no enforcement.
    if (phase === 'IDLE') {
        log(
            `stage-gate: pipelineStep=idle (phase=IDLE) — allowing ${
                toolName ?? '(unknown tool)'
            }`,
        )
        return { exitCode: 0, toolName, toolInput, decision: 'allow' }
    }

    // Classify the tool call into a ToolCategory + collect any always-denied
    // path violations.
    let category: ToolCategory | undefined
    let pathBlockReason: string | undefined

    if (
        toolName === 'Edit' ||
        toolName === 'Write' ||
        toolName === 'NotebookEdit'
    ) {
        const targetPath = (toolInput as { file_path?: string } | undefined)
            ?.file_path
        if (!targetPath) {
            // Can't classify without a target. Allow conservatively —
            // shouldn't happen in real Claude Code invocations.
            log(`stage-gate: ${toolName} without file_path — allowing`)
            return { exitCode: 0, toolName, toolInput, decision: 'allow' }
        }
        const pc = classifyWritePath(targetPath, { homedir })
        if (pc.class === 'denied') {
            pathBlockReason = `${toolName} to '${targetPath}' is always denied: ${pc.reason ?? 'forbidden path'}`
        } else {
            category = pathClassToToolCategory(pc.class)
        }
    } else if (toolName === 'Bash') {
        const command =
            (toolInput as { command?: string } | undefined)?.command ?? ''
        const bashResult = classifyBashCommand(command)
        if (bashResult.category === 'denied') {
            pathBlockReason = `Bash command is always denied: ${
                bashResult.reason ?? 'forbidden command'
            }`
        } else {
            for (const target of bashResult.targetPaths) {
                const pc = classifyWritePath(target, { homedir })
                if (pc.class === 'denied') {
                    pathBlockReason = `Bash writes to denied path '${target}': ${
                        pc.reason ?? 'forbidden path'
                    }`
                    break
                }
            }
            if (!pathBlockReason) {
                category = bashCategoryToToolCategory(bashResult.category)
            }
        }
    } else {
        // Other tools (Read, Grep, Glob, Task, etc.) — read-only, allow.
        log(
            `stage-gate: ${toolName ?? '(unknown)'} is not write-class — allowing`,
        )
        return { exitCode: 0, toolName, toolInput, decision: 'allow' }
    }

    // Always-denied path or always-denied bash command → block.
    if (pathBlockReason) {
        const msg = `stage-gate BLOCK: ${pathBlockReason}`
        log(msg)
        return {
            exitCode: 2,
            toolName,
            toolInput,
            decision: 'block',
            reason: msg,
        }
    }

    if (!category) {
        // Defensive: shouldn't reach here.
        log('stage-gate: could not classify tool — allowing')
        return { exitCode: 0, toolName, toolInput, decision: 'allow' }
    }

    // Matrix lookup
    const allowed = isToolAllowed({ phase, category })
    if (!allowed) {
        const msg =
            `stage-gate BLOCK: ${toolName} (category=${category}) is not allowed in phase=${phase} ` +
            `(pipelineStep=${state.pipelineStep})`
        log(msg)
        return {
            exitCode: 2,
            toolName,
            toolInput,
            decision: 'block',
            reason: msg,
        }
    }

    log(
        `stage-gate: ${toolName} (category=${category}) allowed in phase=${phase}`,
    )
    return { exitCode: 0, toolName, toolInput, decision: 'allow' }
}

function pathClassToToolCategory(c: WritePathClass): ToolCategory {
    switch (c) {
        case 'code':
            return 'code-write'
        case 'planning-general':
            return 'planning-write-general'
        case 'planning-audit':
            return 'planning-write-audit'
        case 'denied':
            // Caller has already handled 'denied' before this is called.
            throw new Error('pathClassToToolCategory called with denied')
    }
}

function bashCategoryToToolCategory(c: BashCategory): ToolCategory {
    switch (c) {
        case 'bash-readonly':
            return 'bash-readonly'
        case 'bash-mutate':
            return 'bash-mutate'
        case 'bash-commit':
            return 'bash-commit'
        case 'denied':
            throw new Error('bashCategoryToToolCategory called with denied')
    }
}
