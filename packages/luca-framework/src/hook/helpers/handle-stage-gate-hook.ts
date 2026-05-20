export interface HandleStageGateHookOptions {
    /** Raw JSON string read from PreToolUse stdin. */
    stdin: string
    log?: (msg: string) => void
}

export interface HandleStageGateHookResult {
    exitCode: number
    toolName?: string
    toolInput?: unknown
}

/**
 * Stage-gate hook handler — Phase 2 plumbing only.
 *
 * Parses the PreToolUse hook stdin, logs the tool call for visibility, and
 * always returns exit code 0. The actual phase-tool matrix enforcement
 * (see decision:luca-stage-tool-matrix-2026-05-19) lands in Phase 3.
 *
 * Tolerates malformed input — never throws, never blocks. The deterministic
 * enforcement layer lives one phase ahead.
 */
export async function handleStageGateHook(
    opts: HandleStageGateHookOptions,
): Promise<HandleStageGateHookResult> {
    const log = opts.log ?? (() => {})

    if (!opts.stdin.trim()) {
        log('stage-gate: empty stdin — allowing (Phase 2 plumbing)')
        return { exitCode: 0 }
    }

    let parsed: Record<string, unknown>
    try {
        parsed = JSON.parse(opts.stdin) as Record<string, unknown>
    } catch (err) {
        log(
            `stage-gate: could not parse stdin as JSON — allowing (${
                (err as Error).message
            })`,
        )
        return { exitCode: 0 }
    }

    // Accept both snake_case and camelCase keys — different Claude Code
    // versions have shipped both shapes.
    const toolName =
        (parsed.tool_name as string | undefined) ??
        (parsed.toolName as string | undefined)
    const toolInput =
        (parsed.tool_input as unknown) ?? (parsed.toolInput as unknown)

    log(`stage-gate: tool=${toolName ?? '(unknown)'} — allowing (Phase 2)`)

    return { exitCode: 0, toolName, toolInput }
}
