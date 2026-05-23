#!/usr/bin/env bun
/**
 * read-only-enforcement handler — `PreToolUse` hook that blocks
 * `Write`, `Edit`, and `NotebookEdit` calls in read-only pipeline
 * steps.
 *
 * This is the Claude Code delivery vehicle for the pure
 * `enforceReadOnly()` algorithm in `@alecsibilia/luca-core/orchestration`.
 * The algorithm decides; this handler is glue:
 *
 *   1. Read the Claude Code PreToolUse payload from stdin.
 *   2. Pull `tool_name` + `tool_input.file_path` (or `notebook_path`).
 *   3. Read `.luca/state.json` for the current `pipelineStep`.
 *   4. Call `enforceReadOnly()`.
 *   5. Exit 0 on allow, 2 on block (Claude Code blocks the tool and
 *      surfaces the stderr message to the model).
 *
 * The Claude Code hook contract (PreToolUse):
 *
 *   stdin JSON shape (snake_case fields per the docs):
 *     {
 *       "session_id": "...",
 *       "hook_event_name": "PreToolUse",
 *       "tool_name": "Write" | "Edit" | "NotebookEdit",
 *       "tool_input": { "file_path": "...", ... }
 *     }
 *
 *   Exit codes:
 *     0  → allow the tool call
 *     2  → block + send stderr to the model
 *     *  → other non-zero → error (Claude Code surfaces to the user;
 *           we never use this path because we'd rather fail open than
 *           break the user's workflow on a parse error)
 *
 * Failure-open philosophy (per E-1 reasoning, intentionally reused):
 * if ANYTHING unexpected happens (stdin parse error, state.json
 * missing/malformed, an unknown tool name), exit 0 and let the call
 * through. Hooks that crash break the user's session; hooks that
 * wrongly block frustrate them. Both are bad — but blocking is worse
 * because the user can't recover without disabling the hook. The
 * stage-gate hook (luca-cli) is the authoritative gate; this hook is
 * defense-in-depth.
 */
import {
    enforceReadOnly,
    READ_ONLY_TOOL_CLASS_BY_NAME,
    type ReadOnlyEnforcementInput,
    type ReadOnlyToolClass,
} from '@alecsibilia/luca-core/orchestration'
import { loadCurrentState } from '@alecsibilia/luca-core/state'

/**
 * Shape of the relevant slice of the PreToolUse stdin payload. We only
 * look at `tool_name` and `tool_input.{file_path,notebook_path}`;
 * everything else is ignored. Defensive typing — the harness may add
 * fields and the handler should not break on them.
 */
interface PreToolUsePayload {
    tool_name?: string
    toolName?: string
    tool_input?: {
        file_path?: string
        notebook_path?: string
    }
    toolInput?: {
        file_path?: string
        notebook_path?: string
    }
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
    if (toolName === undefined) {
        return 0
    }

    // Only act on the three tools this hook gates. If the harness
    // matcher fired for some other tool, just allow.
    const toolClass: ReadOnlyToolClass | undefined =
        READ_ONLY_TOOL_CLASS_BY_NAME[toolName]
    if (toolClass === undefined) {
        return 0
    }

    const toolInput = payload.tool_input ?? payload.toolInput
    const targetPath =
        toolInput?.file_path ?? toolInput?.notebook_path ?? undefined

    const cwd = process.cwd()
    const state = await loadCurrentState({ cwd })

    const input: ReadOnlyEnforcementInput = {
        currentStep: state.pipelineStep,
        toolName,
        toolClass,
        ...(targetPath !== undefined ? { targetPath } : {}),
    }

    const verdict = enforceReadOnly(input)
    if (verdict.allowed) {
        return 0
    }

    // Block: print to stderr (Claude Code surfaces to the model) and
    // exit 2.
    process.stderr.write(verdict.message + '\n')
    return 2
}

main().then(
    (code) => process.exit(code),
    (err) => {
        // Defensive: any unexpected throw means we fail open. Do NOT
        // exit 2 on internal errors — that would block the user's
        // command on a hook bug.
        process.stderr.write(
            `read-only-enforcement handler: internal error (failing open): ${
                (err as Error).message
            }\n`,
        )
        process.exit(0)
    },
)
