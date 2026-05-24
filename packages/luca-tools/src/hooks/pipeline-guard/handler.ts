#!/usr/bin/env bun
/**
 * pipeline-guard handler — `PreToolUse` hook that vets pipeline-step
 * transitions before they execute.
 *
 * This is the Claude Code delivery vehicle for the pure
 * `checkPipelineGuard()` algorithm in `@alecsibilia/luca-core/orchestration`.
 * The algorithm decides legality; this handler is glue:
 *
 *   1. Read the Claude Code PreToolUse payload from stdin.
 *   2. If it isn't a `Bash` invocation of `luca state advance <step>`,
 *      exit 0 (this hook only guards that one command).
 *   3. Read `.luca/state.json` for the current `pipelineStep`.
 *   4. Call `checkPipelineGuard()` with current + requested step.
 *   5. Exit 0 on allow, 2 on block (Claude Code blocks the tool call
 *      and surfaces the stderr message to the model).
 *
 * The Claude Code hook contract (PreToolUse):
 *
 *   stdin JSON shape (snake_case fields per the docs):
 *     {
 *       "session_id": "...",
 *       "hook_event_name": "PreToolUse",
 *       "tool_name": "Bash",
 *       "tool_input": { "command": "luca state advance plan", ... }
 *     }
 *
 *   Exit codes:
 *     0  → allow the tool call
 *     2  → block + send stderr to the model
 *     *  → other non-zero → error (Claude Code surfaces to the user;
 *           we never use this path because we'd rather fail open than
 *           break the user's workflow on a parse error)
 *
 * Why a bun-script: the algorithm needs typed access to
 * `checkPipelineGuard` + the pipeline-transitions table. A shell
 * wrapper would have to re-implement the legality check or shell out
 * to the `luca` CLI; both create drift surfaces. Direct TS import
 * keeps the source of truth in one place.
 *
 * Failure-open philosophy: if ANYTHING unexpected happens (stdin
 * parse error, state.json missing/malformed, command argv doesn't
 * parse), we exit 0 and let the call through. Hooks that crash will
 * break the user's session; hooks that wrongly block will frustrate
 * them. Both are bad — but blocking is worse because the user can't
 * recover without disabling the hook. Choose to fail open and lean
 * on the CLI's own validation (the `luca state advance` command does
 * its own legal-transition check independently).
 */
import { join } from 'node:path'

import { appendLedger } from '@alecsibilia/luca-core/ledger'
import {
    checkPipelineGuard,
    type PipelineGuardInput,
} from '@alecsibilia/luca-core/orchestration'
import { loadCurrentState } from '@alecsibilia/luca-core/state'

/**
 * Shape of the relevant slice of the PreToolUse stdin payload. We
 * only look at `tool_name` and `tool_input.command`; everything else
 * is ignored. Defensive typing — the harness may add fields and the
 * handler should not break on them.
 */
interface PreToolUsePayload {
    tool_name?: string
    toolName?: string
    tool_input?: { command?: string }
    toolInput?: { command?: string }
}

async function main(): Promise<number> {
    const raw = await Bun.stdin.text()
    if (!raw.trim()) {
        // Empty stdin — nothing to guard. Allow.
        return 0
    }

    let payload: PreToolUsePayload
    try {
        payload = JSON.parse(raw) as PreToolUsePayload
    } catch {
        // Malformed stdin is the harness's problem, not ours. Fail open.
        return 0
    }

    const toolName = payload.tool_name ?? payload.toolName
    if (toolName !== 'Bash') {
        // The hook also matches non-Bash tools if registered broadly,
        // but pipeline-guard only cares about `luca state advance`.
        return 0
    }

    const command = payload.tool_input?.command ?? payload.toolInput?.command
    if (typeof command !== 'string') {
        return 0
    }

    const requestedStep = parseAdvanceCommand(command)
    if (requestedStep === null) {
        // Not a `luca state advance` invocation, or shape doesn't
        // match. Nothing to guard.
        return 0
    }

    const cwd = process.cwd()
    const state = await loadCurrentState({ cwd })

    const input: PipelineGuardInput = {
        currentStep: state.pipelineStep,
        requestedStep,
        ...(state.complexity !== undefined
            ? { complexity: state.complexity }
            : {}),
        ...(state.oversight !== undefined
            ? { oversight: state.oversight }
            : {}),
    }

    const verdict = checkPipelineGuard(input)

    // Emit a ledger event for the hook firing. The postmortem analyzer
    // scans the ledger for `hook.pipeline-guard.fired` events to detect
    // pipeline-guard rejections and forced transitions over time.
    // Failure-open: any ledger-write error MUST NOT block the hook.
    try {
        const runId = typeof (state as { sessionId?: unknown }).sessionId === 'string'
            ? (state as { sessionId: string }).sessionId
            : ''
        appendLedger({
            cwd,
            runId,
            event: 'hook.pipeline-guard.fired',
            data: {
                pipelineStep: state.pipelineStep,
                requestedStep,
                decision: verdict.allowed ? 'allow' : 'block',
                reason: verdict.allowed ? undefined : verdict.message,
            },
        })
    } catch {
        // Failure-open: never block the hook on a ledger-write error.
    }

    if (verdict.allowed) {
        return 0
    }

    // Block: print to stderr (Claude Code surfaces to the model) and
    // exit 2.
    process.stderr.write(verdict.message + '\n')
    return 2
}

/**
 * Parse `luca state advance <step>` (and `luca state advance --to-step
 * <step>` / `--to-step=<step>`) out of a Bash command string. Returns
 * the requested step name, or null if the command doesn't match.
 *
 * Why we accept multiple forms: citty (the CLI framework luca-cli
 * uses) accepts both positional and long-flag invocations. Real users
 * type either; the hook should catch both. We're conservative on
 * shape — if any tokenization edge case fails, we return null and
 * let the call through (failure-open). The CLI itself does the
 * authoritative parse.
 *
 * We do NOT spawn a shell parser — Bash command parsing is full of
 * edge cases (quoting, expansion, command substitution). A regex-
 * over-tokens approach is good enough because the hook's job is only
 * to catch the common-case `luca state advance plan` form. Anything
 * weirder (env-var indirection, command substitution) bypasses the
 * hook, and the CLI's own validation catches it.
 */
function parseAdvanceCommand(command: string): string | null {
    const trimmed = command.trim()
    // Quick reject so the regex only runs on plausible matches.
    if (!/\bluca\b/.test(trimmed) || !/\bstate\b/.test(trimmed) ||
        !/\badvance\b/.test(trimmed)) {
        return null
    }

    // Tokenize on whitespace; we don't need a full shell parser
    // because the hook fires before the call runs, so we're matching
    // the literal argv string from the harness.
    const tokens = trimmed.split(/\s+/)
    // Find the `luca` token (allowing for prefixes like `bun run`,
    // `npx`, env-var assignments).
    const lucaIdx = tokens.findIndex((t) => t === 'luca' || t.endsWith('/luca'))
    if (lucaIdx < 0) return null
    if (tokens[lucaIdx + 1] !== 'state') return null
    if (tokens[lucaIdx + 2] !== 'advance') return null

    // Positional: `luca state advance <step>`
    const next = tokens[lucaIdx + 3]
    if (next !== undefined && !next.startsWith('-')) {
        return stripQuotes(next)
    }

    // Long flag: `luca state advance --to-step <step>` or
    // `--to-step=<step>`.
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
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return s.slice(1, -1)
        }
    }
    return s
}

// Touched to suppress unused-import in some toolchains; `join` may be
// folded out by the bundler if unused, but kept here in case future
// edits need explicit cwd handling.
void join

main().then(
    (code) => process.exit(code),
    (err) => {
        // Defensive: any unexpected throw means we fail open. We
        // explicitly do NOT exit 2 on internal errors — that would
        // block the user's command on a hook bug.
        process.stderr.write(
            `pipeline-guard handler: internal error (failing open): ${
                (err as Error).message
            }\n`,
        )
        process.exit(0)
    },
)
