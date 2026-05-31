/**
 * emit-hook — compile a `HookDefinition` to its Claude Code hook
 * configuration slice + optional handler script.
 *
 * The Claude Code hook contract (see
 * `packages/luca-framework/.claude/settings.json` for the
 * hand-written precedent) is:
 *
 *   {
 *     "hooks": {
 *       "<EventName>": [
 *         {
 *           "matcher": "Edit|Write",
 *           "hooks": [
 *             {
 *               "type": "command",
 *               "command": "<shell command>",
 *               "timeout": <seconds>,
 *               "async": true,
 *               "statusMessage": "..."
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   }
 *
 * Multiple hooks on the same event compose into the same event array.
 * The top-level `compile()` is what merges all per-hook slices into a
 * single settings.json — this emitter ONLY returns the slice.
 *
 * Handler runtimes:
 *  - `bun-script`: handler is a path-like reference (e.g.
 *    `.claude/hooks/post-edit-typecheck.ts`). Command becomes
 *    `bun "$CLAUDE_PROJECT_DIR"/<path>`.
 *  - `shell`: handler is a path-like reference (`.sh`). Command becomes
 *    `bash "$CLAUDE_PROJECT_DIR"/<path>`.
 *  - `inline`: handler IS the command string. Emitted as-is.
 *
 * The emitter does NOT write the handler script itself — D-3 ports
 * the handler scripts as part of the broader Phase E hook re-impl
 * work. For D-2 we lay down the config slice only; if the slice
 * references a `bun-script` path, D-3/E-1 wires the script there.
 */
import type { HookDefinition } from '../define/index.ts'

import type { EmitResult } from './emit-util.ts'

/**
 * One entry inside a Claude Code hook event array. This matches the
 * shape the harness consumes — not a public schema, just the JSON
 * structure we serialize into settings.json.
 */
export interface HookSettingsEntry {
    matcher?: string
    hooks: Array<{
        type: 'command'
        command: string
        timeout?: number
        async?: boolean
        statusMessage?: string
    }>
}

/**
 * Result of emitting one hook: the event it attaches to + the slice to
 * merge into the settings.json hooks block. The top-level compile()
 * collects these and groups by event.
 */
export interface HookEmitSlice extends EmitResult {
    /** Claude Code lifecycle event name (e.g. `PostToolUse`). */
    event: HookDefinition['event']
    /** Entry to append into `settings.json` -> `hooks[event]`. */
    entry: HookSettingsEntry
}

/**
 * Build the config slice for a hook. Returns BOTH the EmitResult
 * shape (so the compile report can include it) AND the event +
 * entry the top-level compile() merges into settings.json.
 *
 * No filesystem writes happen here — the slice is data only. The
 * top-level compile() serializes the merged settings.json once all
 * hooks are aggregated. Async signature matches the other emitters
 * for symmetry; nothing inside actually awaits.
 */
export async function emitHook(
    def: HookDefinition,
    outputRoot: string,
): Promise<HookEmitSlice> {
    const command = buildCommand(def)
    const entry: HookSettingsEntry = {
        hooks: [
            {
                type: 'command',
                command,
                ...(def.timeoutMs !== undefined
                    ? { timeout: msToSeconds(def.timeoutMs) }
                    : {}),
                ...(def.background ? { async: true } : {}),
                statusMessage: def.description,
            },
        ],
    }
    if (def.matcher !== undefined) {
        entry.matcher = def.matcher
    }
    // The `path` field on EmitResult is a logical path — settings.json
    // is the eventual write target, but it's the merge step that owns
    // that write. Here we report the *would-be* config-slice location.
    // The compiler report can show it to the user without confusion
    // because the kind is `hook`.
    const path = `${outputRoot}/.claude/settings.json#hooks.${def.event}[${def.id}]`
    return { path, kind: 'hook', event: def.event, entry }
}

/**
 * Convert a HookDefinition into the shell command Claude Code will
 * execute. The `$CLAUDE_PROJECT_DIR` reference matches the existing
 * hand-written settings.json — the harness substitutes the repo root
 * at invocation time.
 *
 * Why we double-quote the path: hand-written precedents do (`"$VAR"/path`)
 * to survive spaces in repo paths. The compiler honors that.
 */
function buildCommand(def: HookDefinition): string {
    switch (def.runtime) {
        case 'bun-script':
            return `bun "$CLAUDE_PROJECT_DIR"/${def.handler}`
        case 'shell':
            return `bash "$CLAUDE_PROJECT_DIR"/${def.handler}`
        case 'inline':
            return def.handler
    }
}

/**
 * Claude Code's `timeout` field in settings.json is in SECONDS, not
 * milliseconds. The HookDefinition's `timeoutMs` is the canonical
 * source of truth (ms is the right unit for typed configs); we round
 * UP when converting so we never under-shoot the author's intent.
 */
function msToSeconds(ms: number): number {
    return Math.ceil(ms / 1000)
}
