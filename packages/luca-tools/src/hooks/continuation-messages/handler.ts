#!/usr/bin/env bun
/**
 * continuation-messages handler — `PostToolUse` hook that injects a
 * mode-entry kick-off prompt after the pipeline advances.
 *
 * This is the Claude Code delivery vehicle for the pure
 * `computeContinuationMessage()` builder in
 * `@alecsibilia/luca-core/orchestration`. The algorithm decides whether
 * to emit and what to say; this handler is glue:
 *
 *   1. Read the Claude Code PostToolUse payload from stdin.
 *   2. If it isn't a `Bash` invocation of `luca state advance <step>`,
 *      exit 0 silently (this hook only fires after pipeline advances).
 *   3. Read `.luca/state.json` for the now-current `pipelineStep`.
 *   4. Confirm the requested step matches the current step (i.e. the
 *      advance succeeded). If not, exit 0 silently — the CLI's own
 *      validation rejected the call, and an injected continuation for
 *      a step we didn't actually enter would mislead the agent.
 *   5. Call `computeContinuationMessage()`.
 *   6. Emit the message via the Claude Code PostToolUse hook output
 *      JSON shape:
 *
 *         {
 *           "hookSpecificOutput": {
 *             "hookEventName": "PostToolUse",
 *             "additionalContext": "<system-reminder>...</system-reminder>"
 *           }
 *         }
 *
 *      Exit 0 — `additionalContext` is the hook's only effect on the
 *      session.
 *
 * The Claude Code hook contract (PostToolUse):
 *
 *   stdin JSON shape (snake_case fields per the docs):
 *     {
 *       "session_id": "...",
 *       "hook_event_name": "PostToolUse",
 *       "tool_name": "Bash",
 *       "tool_input": { "command": "luca state advance plan", ... },
 *       "tool_response": { "stdout": "...", "stderr": "...", ... }
 *     }
 *
 *   Exit codes:
 *     0   → all signals come from stdout JSON
 *     2   → block (not used here — this hook is informational)
 *     *   → other non-zero → error (failure-open: we never use this
 *           because a hook bug should never disrupt the session)
 *
 *   Stdout JSON for context injection:
 *     {
 *       "hookSpecificOutput": {
 *         "hookEventName": "PostToolUse",
 *         "additionalContext": "..."
 *       }
 *     }
 *
 * Failure-open philosophy (per E-1 / E-2 reasoning, intentionally
 * reused): if ANYTHING unexpected happens (stdin parse error,
 * state.json missing/malformed, command argv doesn't parse), exit 0
 * silently. A hook that mis-injects a continuation will confuse the
 * agent; a hook that crashes is worse. Choose silent skip.
 */
import {
    computeContinuationMessage,
    type ContinuationInput,
} from '@alecsibilia/luca-core/orchestration'
import { loadCurrentState } from '@alecsibilia/luca-core/state'

/**
 * Shape of the relevant slice of the PostToolUse stdin payload. We
 * only look at `tool_name` and `tool_input.command`; everything else
 * is ignored. Defensive typing — the harness may add fields and the
 * handler should not break on them.
 */
interface PostToolUsePayload {
    tool_name?: string
    toolName?: string
    tool_input?: { command?: string }
    toolInput?: { command?: string }
}

async function main(): Promise<number> {
    const raw = await Bun.stdin.text()
    if (!raw.trim()) {
        // Empty stdin — nothing to do. Allow silently.
        return 0
    }

    let payload: PostToolUsePayload
    try {
        payload = JSON.parse(raw) as PostToolUsePayload
    } catch {
        // Malformed stdin is the harness's problem. Fail open silently.
        return 0
    }

    const toolName = payload.tool_name ?? payload.toolName
    if (toolName !== 'Bash') {
        // The Bash matcher catches every Bash call; we only act on
        // `luca state advance`. Other Bash → silent skip.
        return 0
    }

    const command = payload.tool_input?.command ?? payload.toolInput?.command
    if (typeof command !== 'string') {
        return 0
    }

    const requestedStep = parseAdvanceCommand(command)
    if (requestedStep === null) {
        // Not a `luca state advance` invocation.
        return 0
    }

    const cwd = process.cwd()
    const state = await loadCurrentState({ cwd })

    // Confirm the advance actually happened by comparing the now-current
    // step with the requested step. If they don't match the CLI rejected
    // the transition (or the user wrote an exotic command form we didn't
    // recognise); either way, skip silently rather than inject a
    // misleading continuation.
    if (state.pipelineStep !== requestedStep) {
        return 0
    }

    const input: ContinuationInput = {
        currentStep: state.pipelineStep,
        ...(state.complexity !== undefined
            ? { complexity: state.complexity }
            : {}),
        ...(state.oversight !== undefined
            ? { oversight: state.oversight }
            : {}),
        ...(typeof state.currentPhase === 'number'
            ? { currentPhase: state.currentPhase }
            : {}),
        ...(typeof state.totalPhases === 'number'
            ? { totalPhases: state.totalPhases }
            : {}),
    }

    const verdict = computeContinuationMessage(input)
    if (verdict === null) {
        // No continuation appropriate (e.g. advance into `idle`).
        return 0
    }

    if (verdict.reason === 'unknown-current-step') {
        // The algorithm flagged a data-integrity warning; we don't
        // surface this to the model (it would be alarming and not
        // actionable). Skip silently — the CLI's own validation will
        // catch the underlying state.json corruption.
        return 0
    }

    // Emit the additionalContext payload. Claude Code consumes the
    // first valid JSON object on stdout for PostToolUse hooks.
    const output = {
        hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: verdict.message,
        },
    }
    process.stdout.write(JSON.stringify(output) + '\n')
    return 0
}

/**
 * Parse `luca state advance <step>` (and `luca state advance --to-step
 * <step>` / `--to-step=<step>`) out of a Bash command string. Returns
 * the requested step name, or null if the command doesn't match.
 *
 * Implementation mirrors `pipeline-guard/handler.ts`'s parser — same
 * forms accepted, same conservative-on-edge-cases stance. The two
 * parsers are intentionally duplicated rather than shared via a
 * luca-core helper for now because:
 *
 *   - Each hook is a standalone bun-script; pulling a helper into
 *     luca-core adds a transitive dependency that needs to survive
 *     `luca init`'s artifact copy step (Phase F-2).
 *   - The parser is ~30 lines and stable; duplication cost is bounded.
 *   - If a third caller ever needs this parser, lift it into luca-core
 *     then.
 */
function parseAdvanceCommand(command: string): string | null {
    const trimmed = command.trim()
    // Quick reject so the regex only runs on plausible matches.
    if (
        !/\bluca\b/.test(trimmed) ||
        !/\bstate\b/.test(trimmed) ||
        !/\badvance\b/.test(trimmed)
    ) {
        return null
    }

    const tokens = trimmed.split(/\s+/)
    const lucaIdx = tokens.findIndex(
        (t) => t === 'luca' || t.endsWith('/luca'),
    )
    if (lucaIdx < 0) return null
    if (tokens[lucaIdx + 1] !== 'state') return null
    if (tokens[lucaIdx + 2] !== 'advance') return null

    // Positional: `luca state advance <step>`
    const next = tokens[lucaIdx + 3]
    if (next !== undefined && !next.startsWith('-')) {
        return stripQuotes(next)
    }

    // Long flag: `luca state advance --to-step <step>` or `--to-step=<step>`.
    for (let i = lucaIdx + 3; i < tokens.length; i++) {
        const tok = tokens[i] ?? ''
        if (tok === '--to-step') {
            const v = tokens[i + 1]
            if (v !== undefined) return stripQuotes(v)
            return null
        }
        if (tok.startsWith('--to-step=')) {
            return stripQuotes(tok.slice('--to-step='.length))
        }
    }

    return null
}

function stripQuotes(s: string): string {
    if (s.length >= 2) {
        const first = s[0]
        const last = s[s.length - 1]
        if (
            (first === '"' && last === '"') ||
            (first === "'" && last === "'")
        ) {
            return s.slice(1, -1)
        }
    }
    return s
}

main().then(
    (code) => process.exit(code),
    (err) => {
        // Defensive: any unexpected throw means we fail open silently.
        // No stderr — this is a PostToolUse informational hook; users
        // shouldn't see internal errors.
        void err
        process.exit(0)
    },
)
