/**
 * install-hooks — copy bundled Claude Code hook handler scripts and merge
 * the bundled hook settings.json into the consumer project.
 *
 * Closes B3 (parity-review §B3, F-2 known gap). The umbrella ships
 * compiled hook handler scripts at
 * `<luca-pkg>/dist/claude/.claude/hooks/<name>.ts` (the umbrella's
 * `build:done` hook in `build.config.ts` copies them out of luca-tools'
 * source tree). The umbrella also ships a settings.json slice at
 * `<luca-pkg>/dist/claude/.claude/settings.json` describing which hook
 * fires on which Claude Code event.
 *
 * Consumer projects need BOTH:
 *
 *   1. `<project>/.claude/hooks/<name>.ts` — the script Claude Code
 *      executes when its hook event fires. The settings.json references
 *      this path via `$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.ts`.
 *
 *   2. `<project>/.claude/settings.json` — the per-project hook
 *      registration. Without this, Claude Code never invokes the
 *      handler. The bundled settings.json is MERGED into any existing
 *      project-local settings.json — luca-defined hook entries replace
 *      prior luca-defined entries, but unrelated user-authored entries
 *      are preserved.
 *
 * Idempotent — running twice produces identical results. Failure-open:
 * if the bundled artifacts can't be located (e.g. running from a
 * non-bundled dev tree), the function logs a clear skip message and
 * returns without throwing.
 */
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { resolveBundledArtifactsForHooks } from './install-skills.ts'

export interface InstallHooksOptions {
    /** Repo root that receives `.claude/hooks/` and `.claude/settings.json`. */
    cwd: string
    /**
     * Root directory containing the bundled `.claude/hooks/` and
     * `.claude/settings.json`. Defaults to the umbrella's bundled
     * `<luca-pkg>/dist/claude/.claude/`.
     */
    claudeArtifactsRoot?: string
    log?: (msg: string) => void
}

/**
 * Identifier embedded in luca-emitted hook command strings so we can
 * recognise our own entries when merging. The compiler embeds
 * `$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.ts` in every command — that
 * unique substring is the de-dup signal.
 */
const LUCA_HOOK_HANDLER_MARKER = '/.claude/hooks/'

interface HookEntry {
    type: 'command'
    command: string
    timeout?: number
    async?: boolean
    statusMessage?: string
}

interface HookEventEntry {
    matcher?: string
    hooks: HookEntry[]
}

interface ClaudeSettings {
    hooks?: Record<string, HookEventEntry[]>
    [k: string]: unknown
}

/**
 * Copy hook handlers and merge the hook settings.json into the consumer
 * project. Idempotent.
 */
export async function installHooks(opts: InstallHooksOptions): Promise<void> {
    const log = opts.log ?? (() => {})

    const artifactsRoot = opts.claudeArtifactsRoot ?? resolveBundledArtifactsForHooks()
    if (artifactsRoot === null) {
        log(
            '  skip:  bundled hook artifacts not found — could not locate the @alecsibilia/luca package root (running from a non-bundled dev tree?)'
        )
        return
    }

    const hooksSrcDir = join(artifactsRoot, 'hooks')
    const hooksDestDir = join(opts.cwd, '.claude', 'hooks')

    if (existsSync(hooksSrcDir)) {
        await mkdir(hooksDestDir, { recursive: true })
        const entries = await readdir(hooksSrcDir, { withFileTypes: true })
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
            const from = join(hooksSrcDir, entry.name)
            const to = join(hooksDestDir, entry.name)
            await copyFile(from, to)
            log(`  write: ${to}`)
        }
    } else {
        log(`  skip:  bundled hook handlers missing (${hooksSrcDir})`)
    }

    const settingsSrc = join(artifactsRoot, 'settings.json')
    const settingsDest = join(opts.cwd, '.claude', 'settings.json')
    if (existsSync(settingsSrc)) {
        await mkdir(dirname(settingsDest), { recursive: true })
        const bundled = JSON.parse(
            await readFile(settingsSrc, 'utf-8')
        ) as ClaudeSettings
        const existing = existsSync(settingsDest)
            ? ((JSON.parse(
                  await readFile(settingsDest, 'utf-8')
              ) as ClaudeSettings) ?? {})
            : {}
        const merged = mergeLucaHookSettings(existing, bundled)
        await writeFile(settingsDest, JSON.stringify(merged, null, 2) + '\n')
        log(`  write: ${settingsDest}`)
    } else {
        log(`  skip:  bundled settings.json missing (${settingsSrc})`)
    }

}

/**
 * Merge luca-defined hook entries from `bundled` into `existing`,
 * de-duping by command string. Luca-defined entries (identified by the
 * `LUCA_HOOK_HANDLER_MARKER` substring in their command) are REPLACED
 * by their bundled counterparts; unrelated entries are preserved
 * verbatim.
 *
 * Pure function — exported for testability.
 */
export function mergeLucaHookSettings(
    existing: ClaudeSettings,
    bundled: ClaudeSettings
): ClaudeSettings {
    const next: ClaudeSettings = { ...existing }
    const mergedHooks: Record<string, HookEventEntry[]> = {
        ...(existing.hooks ?? {}),
    }

    for (const [event, bundledEntries] of Object.entries(bundled.hooks ?? {})) {
        const existingEntries = mergedHooks[event] ?? []
        // Drop any prior luca-defined entries (we'll re-add them from
        // bundled). An entry is luca-defined if any of its `hooks[].command`
        // strings contains LUCA_HOOK_HANDLER_MARKER.
        const filtered = existingEntries.filter(
            (entry) =>
                !entry.hooks.some((h) =>
                    h.command?.includes(LUCA_HOOK_HANDLER_MARKER)
                )
        )
        mergedHooks[event] = [...filtered, ...bundledEntries]
    }

    next.hooks = mergedHooks
    return next
}
