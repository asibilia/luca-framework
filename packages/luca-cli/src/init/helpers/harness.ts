import { existsSync } from 'node:fs'

import { defaultAntigravityHome, defaultClaudeHome } from './install-skills.ts'
import type { InstallSkillsArtifacts } from './install-skills.ts'
import { installStatusline } from './install-statusline.ts'
import {
    wireAntigravityHooks,
    wireAntigravityMcp,
    wireClaudeHooks,
    wireClaudeMcp,
} from './wire-claude-hooks.ts'
import type { WireClaudeHooksOptions } from './wire-claude-hooks.ts'

/**
 * Which bundled artifact buckets a harness receives during `luca init`.
 * `luca init` Step 4 drives `installSkills` directly off these flags
 * (one call per active harness), so "add a harness = add one descriptor"
 * holds: the descriptor's flags decide what lands in its home.
 *
 * Shares the shape of `InstallSkillsArtifacts` so a descriptor's flags
 * pass straight through to `installSkills({ artifacts })`.
 */
type HarnessInstallArtifacts = InstallSkillsArtifacts

/** Options passed to a harness's optional extra-install hook. */
export interface HarnessInstallExtrasOptions {
    log?: (msg: string) => void
}

/**
 * Descriptor for a coding-agent harness (Claude Code, Antigravity CLI, …).
 *
 * Each descriptor is a thin wrapper around the existing `wire*`/`install*`
 * helpers — it re-authors no merge logic. The `HARNESSES` registry lets
 * `luca init` iterate harnesses rather than hardcode each one; adding a new
 * harness becomes "add one descriptor".
 */
export interface Harness {
    id: 'claude' | 'antigravity'
    displayName: string
    /** Global config directory for this harness (e.g. `~/.claude`). */
    home(): string
    /** Whether the harness's home directory already exists on disk. */
    isInstalled(): boolean
    installArtifacts: HarnessInstallArtifacts
    /** Register the luca stage-gate hook in the harness's global settings. */
    wireHooks(opts: WireClaudeHooksOptions): Promise<void>
    /**
     * Optional MCP wiring. Driven by luca for every harness — Antigravity via
     * its dedicated `mcp_config.json`, Claude via a global file-merge into the
     * user's primary `~/.claude.json` (WS4, replacing the old per-project
     * `claude mcp add` shell-out).
     */
    mcp?: { wire(opts: WireClaudeHooksOptions): Promise<void> }
    /**
     * Optional extra per-harness artifacts beyond skills/agents/commands —
     * currently the Claude statusline. Only harnesses that support the
     * capability implement it; `luca init` calls it conditionally
     * (`await h.installExtras?.(...)`).
     */
    installExtras?(opts: HarnessInstallExtrasOptions): Promise<void>
}

/** Claude Code harness descriptor. */
export const claudeHarness: Harness = {
    id: 'claude',
    displayName: 'Claude Code',
    home: defaultClaudeHome,
    isInstalled: () => existsSync(defaultClaudeHome()),
    installArtifacts: { agents: true, commands: true, skills: true },
    wireHooks: (opts) => wireClaudeHooks(opts),
    mcp: { wire: (opts) => wireClaudeMcp(opts) },
    // Statusline is a Claude-only capability — install it into the Claude
    // home as the harness's "extras".
    installExtras: (opts) =>
        installStatusline({ home: defaultClaudeHome(), log: opts.log }),
}

/** Antigravity CLI harness descriptor. */
export const antigravityHarness: Harness = {
    id: 'antigravity',
    displayName: 'Antigravity CLI',
    home: defaultAntigravityHome,
    isInstalled: () => existsSync(defaultAntigravityHome()),
    installArtifacts: { agents: true, commands: false, skills: true },
    wireHooks: (opts) => wireAntigravityHooks(opts),
    mcp: { wire: (opts) => wireAntigravityMcp(opts) },
}

/** Registry of every harness `luca init` wires hooks/MCP for. */
export const HARNESSES: Harness[] = [claudeHarness, antigravityHarness]
