#!/usr/bin/env bun
/**
 * context-refresher handler — `PostToolUse` hook that surfaces a
 * per-step `<luca-reminder>` to combat context rot.
 *
 * This is the Claude Code delivery vehicle for the pure
 * `computeContextRefresher()` algorithm in
 * `@alecsibilia/luca-core/orchestration`. The algorithm decides whether
 * to emit and what to say; this handler is glue:
 *
 *   1. Read the Claude Code PostToolUse payload from stdin. We do NOT
 *      narrow on tool_name — the hook is registered with matcher `*`
 *      because every tool call is a context-growth tick.
 *   2. Load (or initialize) the sidecar `.claude/cache/
 *      context-refresher-state.json`.
 *   3. Increment the toolCallCount.
 *   4. Read `.luca/state.json` for the current pipelineStep.
 *   5. Call `computeContextRefresher()`.
 *   6. If the verdict carries `nextState`, persist it back to the
 *      sidecar. If the verdict carries a `refresh-emitted` reason,
 *      emit the message via `additionalContext` in the PostToolUse
 *      hook output JSON shape.
 *   7. Exit 0 always (informational hook — never blocks).
 *
 * The Claude Code hook contract (PostToolUse):
 *
 *   stdin JSON shape (snake_case fields per the docs):
 *     {
 *       "session_id": "...",
 *       "hook_event_name": "PostToolUse",
 *       "tool_name": "<any>",
 *       "tool_input": { ... },
 *       "tool_response": { ... }
 *     }
 *
 *   Exit codes:
 *     0   → all signals come from stdout JSON
 *     2   → block (not used here — this hook is informational)
 *     *   → other non-zero → error (failure-open: we never use this)
 *
 *   Stdout JSON for context injection:
 *     {
 *       "hookSpecificOutput": {
 *         "hookEventName": "PostToolUse",
 *         "additionalContext": "<luca-reminder>...</luca-reminder>"
 *       }
 *     }
 *
 * Sidecar location: `.claude/cache/context-refresher-state.json`. This
 * lives under `.claude/` rather than `.luca/` because it is hook-
 * managed bookkeeping (the cross-invocation counter), not pipeline
 * state. The `.luca/` contract is a strict allowlist of pipeline-state
 * artifacts; the sidecar would violate that contract. `.claude/cache/`
 * is a fresh subdirectory (Claude Code's harness ignores unknown
 * files under `.claude/`, so we own the namespace) — wipe it freely
 * during Phase H cleanup if needed.
 *
 * Failure-open philosophy (per E-1 / E-2 / E-3 reasoning, intentionally
 * reused): if ANYTHING unexpected happens (stdin parse error, state.json
 * missing/malformed, sidecar read/write failure), exit 0 silently. A
 * hook that mis-emits a reminder is mildly annoying; a hook that
 * crashes the session is worse. Choose silent skip.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { appendLedger } from '@alecsibilia/luca-core/ledger'
import {
    computeContextRefresher,
    type ContextRefresherCarryState,
    type ContextRefresherInput,
} from '@alecsibilia/luca-core/orchestration'
import { loadCurrentState } from '@alecsibilia/luca-core/state'

/**
 * Shape of the relevant slice of the PostToolUse stdin payload. We do
 * not introspect the payload beyond reading it; the matcher (`*`) is
 * the only gate on this hook. Defensive typing — the harness may add
 * fields and the handler should not break on them.
 */
interface PostToolUsePayload {
    tool_name?: string
    toolName?: string
}

/**
 * On-disk sidecar shape. Identical fields to ContextRefresherCarryState
 * with a `schemaVersion` for future migrations. The handler reads the
 * sidecar with defensive defaults — a missing or malformed file
 * collapses to "no prior state" (counter zero, no lastFiredStep).
 */
interface SidecarFile {
    schemaVersion: 1
    toolCallCount: number
    lastFiredStep?: string
    lastFiredAt?: string
}

const SIDECAR_RELATIVE_PATH = '.claude/cache/context-refresher-state.json'

async function main(): Promise<number> {
    const raw = await Bun.stdin.text()
    if (!raw.trim()) {
        // Empty stdin — nothing to do. Allow silently.
        return 0
    }

    try {
        // We don't need any field from the payload — the matcher (`*`)
        // already filtered to "every tool call". We still parse to
        // detect malformed payloads and fail open silently in that case.
        JSON.parse(raw) as PostToolUsePayload
    } catch {
        // Malformed stdin is the harness's problem. Fail open silently.
        return 0
    }

    const cwd = process.cwd()

    // Load prior sidecar state (or default to a fresh counter).
    const priorRaw = await readSidecar(cwd)
    // Increment the counter to reflect THIS tool call BEFORE calling
    // the algorithm — the algorithm's threshold check compares the
    // post-increment value to toolCallsPerRefresh.
    const priorState: ContextRefresherCarryState = {
        toolCallCount: priorRaw.toolCallCount + 1,
        ...(priorRaw.lastFiredStep !== undefined
            ? { lastFiredStep: priorRaw.lastFiredStep }
            : {}),
        ...(priorRaw.lastFiredAt !== undefined
            ? { lastFiredAt: priorRaw.lastFiredAt }
            : {}),
    }

    const state = await loadCurrentState({ cwd })
    const now = new Date().toISOString()

    const input: ContextRefresherInput = {
        currentStep: state.pipelineStep,
        priorState,
        now,
        ...(state.complexity !== undefined
            ? { complexity: state.complexity }
            : {}),
        ...(state.oversight !== undefined
            ? { oversight: state.oversight }
            : {}),
    }

    const verdict = computeContextRefresher(input)

    // Persist nextState when present. We do this BEFORE writing to
    // stdout so a downstream stdout error doesn't leave the counter
    // un-incremented (which would let the refresher fire on every
    // subsequent tool call until the counter caught up again).
    if (verdict?.nextState !== undefined) {
        await writeSidecar(cwd, verdict.nextState)
    } else {
        // No nextState in the verdict — either the algorithm returned
        // null (idle step, no carry needed) or this is an
        // unknown-current-step verdict. In either case persist a
        // fresh counter from the increment so we don't lose ticks.
        await writeSidecar(cwd, priorState)
    }

    // Emit a ledger event for the hook firing. Only log on decisive
    // outcomes (emit vs skipped) — every tool call fires this hook, so
    // logging every tick would flood the ledger. Failure-open.
    if (verdict !== null && verdict.reason === 'refresh-emitted') {
        try {
            const runId = typeof (state as { sessionId?: unknown }).sessionId === 'string'
                ? (state as { sessionId: string }).sessionId
                : ''
            appendLedger({
                cwd,
                runId,
                event: 'hook.context-refresher.fired',
                data: {
                    pipelineStep: state.pipelineStep,
                    decision: 'emitted',
                    toolCallCount: priorState.toolCallCount,
                },
            })
        } catch {
            // Failure-open.
        }
    }

    if (verdict === null) {
        // Idle step or quiet skip. No additionalContext emitted.
        return 0
    }

    if (verdict.reason !== 'refresh-emitted') {
        // No reminder for this tick (cooldown active, counter below
        // threshold, or unknown step — we don't surface internal
        // warnings to the model).
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
 * Read the sidecar file, returning defaults on missing/malformed file.
 * Never throws — every error path collapses to "no prior state".
 */
async function readSidecar(cwd: string): Promise<SidecarFile> {
    const fallback: SidecarFile = { schemaVersion: 1, toolCallCount: 0 }
    const p = join(cwd, SIDECAR_RELATIVE_PATH)
    if (!existsSync(p)) return fallback
    try {
        const raw = await readFile(p, 'utf-8')
        if (!raw.trim()) return fallback
        const parsed = JSON.parse(raw) as Partial<SidecarFile>
        if (typeof parsed.toolCallCount !== 'number') return fallback
        return {
            schemaVersion: 1,
            toolCallCount: parsed.toolCallCount,
            ...(typeof parsed.lastFiredStep === 'string'
                ? { lastFiredStep: parsed.lastFiredStep }
                : {}),
            ...(typeof parsed.lastFiredAt === 'string'
                ? { lastFiredAt: parsed.lastFiredAt }
                : {}),
        }
    } catch {
        return fallback
    }
}

/**
 * Write the sidecar file atomically (write-then-rename). On any error,
 * swallow silently — we'd rather lose a counter tick than crash the
 * session over a transient disk hiccup.
 */
async function writeSidecar(
    cwd: string,
    state: ContextRefresherCarryState,
): Promise<void> {
    const p = join(cwd, SIDECAR_RELATIVE_PATH)
    const dir = dirname(p)
    const tmp = `${p}.tmp`
    const payload: SidecarFile = {
        schemaVersion: 1,
        toolCallCount: state.toolCallCount,
        ...(state.lastFiredStep !== undefined
            ? { lastFiredStep: state.lastFiredStep }
            : {}),
        ...(state.lastFiredAt !== undefined
            ? { lastFiredAt: state.lastFiredAt }
            : {}),
    }
    try {
        await mkdir(dir, { recursive: true })
        await writeFile(tmp, JSON.stringify(payload) + '\n', 'utf-8')
        // Bun-supported rename via fs/promises (atomic on POSIX).
        const { rename } = await import('node:fs/promises')
        await rename(tmp, p)
    } catch {
        // Sidecar persistence failure is non-fatal — next invocation
        // will recompute from a fresh counter. Silently absorb.
    }
}

main().then(
    (code) => process.exit(code),
    (err) => {
        // Defensive: any unexpected throw means we fail open silently.
        // No stderr — informational hook; users shouldn't see internal
        // errors.
        void err
        process.exit(0)
    },
)
