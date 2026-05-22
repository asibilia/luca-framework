import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { defaultClaudeHome } from './install-skills.ts'

export interface WireClaudeHooksOptions {
    /** Global Claude config directory. Defaults to `~/.claude`. */
    claudeHome?: string
    log?: (msg: string) => void
}

// Matcher per decision:luca-stage-gate-hook-scope-2026-05-19 (D2): hook fires
// on every tool that can mutate the filesystem.
const STAGE_GATE_MATCHER = 'Edit|Write|NotebookEdit|Bash'

/**
 * Command registered in `~/.claude/settings.json`. The luca CLI is on PATH
 * (installed globally), so the hook needs no wrapper script — it delegates
 * straight to `luca hook stage-gate`, which reads the project's
 * `.luca/state.json` relative to the cwd at invocation time. In a non-luca
 * repo there is no state, so the handler defaults to IDLE and allows
 * everything.
 */
const STAGE_GATE_COMMAND = 'luca hook stage-gate'

interface HookEntry {
    type: 'command'
    command: string
    timeout?: number
    statusMessage?: string
}

interface PreToolUseEntry {
    matcher: string
    hooks: HookEntry[]
}

interface ClaudeSettings {
    hooks?: {
        PreToolUse?: PreToolUseEntry[]
        [k: string]: unknown
    }
    [k: string]: unknown
}

/**
 * Register the luca stage-gate hook in the *global* Claude settings
 * (`~/.claude/settings.json`). Merges the PreToolUse entry into any
 * existing settings without clobbering unrelated config.
 *
 * The hook is installed globally so a single luca CLI version owns it
 * across every project; only `.luca/` planning files are written
 * per-repo. Idempotent — re-running won't duplicate the entry.
 */
export async function wireClaudeHooks(
    opts: WireClaudeHooksOptions
): Promise<void> {
    const log = opts.log ?? (() => {})
    const claudeHome = opts.claudeHome ?? defaultClaudeHome()
    const settingsPath = join(claudeHome, 'settings.json')

    await mkdir(claudeHome, { recursive: true })

    // Read existing settings.json (if any) and merge — never clobber the
    // user's global Claude config.
    const existing = existsSync(settingsPath)
        ? ((JSON.parse(
              await readFile(settingsPath, 'utf-8')
          ) as ClaudeSettings) ?? {})
        : {}

    const next = mergeStageGateRegistration(existing)

    await writeFile(settingsPath, JSON.stringify(next, null, 2) + '\n')
    log(`  write: ${settingsPath}`)
}

/**
 * Merge the stage-gate PreToolUse registration into an existing
 * ClaudeSettings object. If an entry referencing the stage-gate hook
 * already exists anywhere under PreToolUse, this is a no-op (idempotent).
 *
 * Pure function — exported for testability.
 */
export function mergeStageGateRegistration(
    settings: ClaudeSettings
): ClaudeSettings {
    const next: ClaudeSettings = { ...settings }
    next.hooks = { ...(settings.hooks ?? {}) }
    const preToolUse = [...(next.hooks.PreToolUse ?? [])]

    // Idempotency: if any existing entry already references the stage-gate
    // hook (current bare command or a legacy stage-gate.sh wrapper), leave
    // the settings untouched.
    const alreadyRegistered = preToolUse.some((entry) =>
        entry.hooks?.some((h) => h.command?.includes('stage-gate'))
    )
    if (alreadyRegistered) {
        next.hooks.PreToolUse = preToolUse
        return next
    }

    preToolUse.push({
        matcher: STAGE_GATE_MATCHER,
        hooks: [
            {
                type: 'command',
                command: STAGE_GATE_COMMAND,
                timeout: 30,
            },
        ],
    })

    next.hooks.PreToolUse = preToolUse
    return next
}
