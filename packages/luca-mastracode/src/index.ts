#!/usr/bin/env bun
/**
 * Luca — Custom Mastra Code distribution.
 *
 * Rewires Luca's 11-step AI coding workflow into Mastra-native primitives:
 * 9 modes (3 stock + 6 pipeline), 7 subagent types, 6 custom tools, and workflow state.
 *
 * Usage:
 *   bun run packages/luca-mastracode/src/index.ts
 *   # or via the monorepo script:
 *   bun run mastracode
 *
 * This file is intentionally minimal — it is the executable entry point and
 * the public API barrel. Implementation lives in sibling modules.
 */
import { main } from './launch.js'

// --- Public API re-exports ---
export { loadBranding, resolveLucaVersion } from './branding.js'
export { buildContinuationMessage } from './continuation-messages.js'
export { createStaticAgent } from './create-static-agent.js'
export {
    installRules,
    installSkills,
    installSlashCommands,
} from './install-bundled-assets.js'
export { main } from './launch.js'
export {
    resolveMastracodeSettingsPath,
    resolvePackModelForMode,
} from './mastracode-config.js'
export { loadAlwaysApplyRules, parseRuleFrontmatter } from './rules-loader.js'
export {
    ANSI_ESCAPE_RE,
    clipToVisibleWidth,
    graphemeWidth,
    visibleWidth,
} from './tui-text-helpers.js'

// --- Boot ---
//
// Suppress Claude Code-format skill loading noise.
// Mastra Code's WorkspaceSkills loader expects YAML frontmatter in SKILL.md files,
// but Luca's compiled skills use Claude Code format (# name\n\ndescription).
// The errors are non-fatal (skills are just skipped), so we suppress the noise.
const _origError = console.error
const _origWarn = console.warn
console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('[WorkspaceSkills]'))
        return
    _origError(...args)
}
console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('[WorkspaceSkills]'))
        return
    _origWarn(...args)
}

main().catch((err) => {
    console.error('Luca startup failed:', err)
    process.exit(1)
})
