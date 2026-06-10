import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
    defaultClaudeHome,
    resolveBundledArtifactsForHooks,
} from './install-skills.ts'

export interface InstallStatuslineOptions {
    /** Global Claude config directory. Defaults to `~/.claude`. */
    claudeHome?: string
    /**
     * Path to the bundled statusline script. Defaults to
     * `<luca-pkg>/dist/claude/.claude/luca-statusline.ts` (emitted by the
     * umbrella's `build:done` hook alongside the bundled hook handlers).
     */
    bundledScriptPath?: string
    log?: (msg: string) => void
}

/**
 * Installed script name inside `~/.claude/`. The `luca-` prefix marks it
 * as luca-owned, and is also the registration's idempotency marker: a
 * `statusLine.command` containing this name is recognised as ours and
 * safely overwritten on re-init; anything else is user-authored and
 * preserved.
 */
const STATUSLINE_SCRIPT_NAME = 'luca-statusline.ts'

interface StatusLineConfig {
    type?: string
    command?: string
    padding?: number
    [k: string]: unknown
}

interface ClaudeSettings {
    /** `null` is meaningful: the user deliberately disabled the statusline. */
    statusLine?: StatusLineConfig | null
    [k: string]: unknown
}

/** Outcome of merging the statusline registration into settings.json. */
export type StatuslineMergeAction =
    | 'installed' // no statusLine existed — luca's was added
    | 'updated' // a luca statusLine existed — command refreshed
    | 'kept-user' // a non-luca statusLine existed — left untouched

/**
 * Install the luca statusline into the *global* Claude scope:
 *
 *   1. Copy the bundled self-contained script to
 *      `~/.claude/luca-statusline.ts`.
 *   2. Merge a `statusLine` entry into `~/.claude/settings.json` pointing
 *      at it (`bun <script>`), without clobbering unrelated settings.
 *
 * A user-authored statusline is sacred: if `settings.json` already has a
 * `statusLine` whose command does NOT reference the luca script, the
 * registration is skipped (the script is still copied so the user can
 * opt in by hand). Idempotent on re-run — a luca-owned entry is simply
 * refreshed to the canonical command.
 *
 * Designed to be called from `luca init` Step 4, next to
 * `installSkills()` and `wireClaudeHooks()`.
 */
export async function installStatusline(
    opts: InstallStatuslineOptions
): Promise<void> {
    const log = opts.log ?? (() => {})
    const claudeHome = opts.claudeHome ?? defaultClaudeHome()

    const src = opts.bundledScriptPath ?? resolveBundledStatuslineScript()
    if (src === null || !existsSync(src)) {
        log(
            '  skip:  bundled statusline script not found (running from a non-bundled dev tree? did the umbrella build run?)'
        )
        return
    }

    await mkdir(claudeHome, { recursive: true })
    const dest = join(claudeHome, STATUSLINE_SCRIPT_NAME)
    await copyFile(src, dest)
    log(`  write: ${dest}`)

    const settingsPath = join(claudeHome, 'settings.json')
    const existing = await readSettings(settingsPath)
    if (existing === null) {
        // Malformed or non-object settings.json — fail open like the
        // missing-bundle case. Touching a file we can't parse risks
        // destroying user config; the script stays copied so the user
        // can register it by hand once the file is repaired.
        log(
            `  skip:  could not parse ${settingsPath} — statusline not registered (repair the file and re-run \`luca init\`)`
        )
        return
    }

    const { next, action } = mergeStatuslineRegistration(existing, dest)
    if (action === 'kept-user') {
        log(
            `  skip:  existing custom statusLine preserved — run \`bun ${dest}\` from your own statusline to opt in`
        )
        return
    }

    await writeFile(settingsPath, JSON.stringify(next, null, 2) + '\n')
    log(`  write: ${settingsPath} (statusLine ${action})`)
}

/**
 * Read and parse a Claude settings.json. Returns `{}` when the file is
 * absent (a fresh install), and `null` when the file exists but cannot
 * be used (malformed JSON, or parses to a non-object like an array or
 * string) — callers must skip registration rather than risk rewriting a
 * file whose contents they don't understand.
 */
async function readSettings(
    settingsPath: string
): Promise<ClaudeSettings | null> {
    if (!existsSync(settingsPath)) return {}
    try {
        const parsed = JSON.parse(
            await readFile(settingsPath, 'utf-8')
        ) as unknown
        if (
            parsed === null ||
            typeof parsed !== 'object' ||
            Array.isArray(parsed)
        ) {
            return null
        }
        return parsed as ClaudeSettings
    } catch {
        return null
    }
}

/**
 * Merge the luca statusline registration into a ClaudeSettings object.
 *
 * - No `statusLine` key at all → add ours (`installed`).
 * - `statusLine: null` → the user deliberately disabled their statusline;
 *   respect that choice (`kept-user`).
 * - Existing `statusLine` whose command IS one of the canonical luca
 *   forms → luca-owned; refresh the command while preserving any other
 *   fields the user tweaked (e.g. `padding`) (`updated`).
 * - Any other `statusLine` → user-authored; leave settings untouched
 *   (`kept-user`). This includes commands that merely *reference* the
 *   luca script (e.g. piping it through a filter) — the opt-in path the
 *   install log recommends — which must never be clobbered back to the
 *   canonical command.
 *
 * Pure function — exported for testability.
 */
export function mergeStatuslineRegistration(
    settings: ClaudeSettings,
    scriptPath: string
): { next: ClaudeSettings; action: StatuslineMergeAction } {
    const command = `bun "${scriptPath}"`
    const entry: StatusLineConfig = {
        type: 'command',
        command,
        padding: 0,
    }

    const existing = settings.statusLine
    if (existing === undefined) {
        return { next: { ...settings, statusLine: entry }, action: 'installed' }
    }
    if (existing === null) {
        // Explicit null is a deliberate "no statusline" choice.
        return { next: settings, action: 'kept-user' }
    }
    // Ownership test is EXACT equality against the canonical command
    // spellings luca has ever written (quoted current form, plus the
    // unquoted variant for robustness). A substring test would also
    // match user-authored wrappers that invoke the script (the
    // recommended opt-in), silently clobbering them on re-init.
    const canonicalForms = [command, `bun ${scriptPath}`]
    if (
        typeof existing.command === 'string' &&
        canonicalForms.includes(existing.command.trim())
    ) {
        return {
            // Refresh only the fields luca owns; user tweaks on the
            // luca-owned entry (e.g. padding) survive the update.
            next: {
                ...settings,
                statusLine: { ...existing, type: 'command', command },
            },
            action: 'updated',
        }
    }
    return { next: settings, action: 'kept-user' }
}

/**
 * Resolve the bundled statusline script inside the umbrella's
 * `dist/claude/.claude/` directory (where the build emits it, next to
 * the hook handlers). Returns null when the umbrella package root can't
 * be located.
 */
function resolveBundledStatuslineScript(): string | null {
    const claudeRoot = resolveBundledArtifactsForHooks()
    if (claudeRoot === null) return null
    return join(claudeRoot, STATUSLINE_SCRIPT_NAME)
}
