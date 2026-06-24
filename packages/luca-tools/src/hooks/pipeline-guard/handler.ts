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
import {
    loadCurrentState,
    parseAdvanceCommand,
} from '@alecsibilia/luca-core/state'

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
        const runId =
            typeof (state as { sessionId?: unknown }).sessionId === 'string'
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

// `parseAdvanceCommand` (and its `stripQuotes` helper) was promoted to
// `@alecsibilia/luca-core/state` (see `packages/luca-core/src/state/
// cli-parse.ts`) — both the pipeline-guard hook and the
// continuation-messages hook used byte-identical copies, so the
// helper now lives in luca-core and is imported above (CF11).

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
            }\n`
        )
        process.exit(0)
    }
)
