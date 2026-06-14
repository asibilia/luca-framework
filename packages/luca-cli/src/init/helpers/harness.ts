import { existsSync } from 'node:fs'

import { defaultAntigravityHome, defaultClaudeHome } from './install-skills.ts'
import {
    wireAntigravityHooks,
    wireAntigravityMcp,
    wireClaudeHooks,
} from './wire-claude-hooks.ts'
import type { WireClaudeHooksOptions } from './wire-claude-hooks.ts'

/**
 * Which bundled artifact buckets a harness receives during `luca init`.
 * Forward-scaffolding for phase 4 / WS8: today every harness receives
 * skills + agents regardless of these flags (install-skills writes to both
 * homes in one call), but the descriptor records the intent so future
 * per-harness installs can branch on it.
 */
interface HarnessInstallArtifacts {
    agents: boolean
    commands: boolean
    skills: boolean
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
     * Optional MCP wiring. Present only for harnesses whose MCP registration
     * is driven by luca (Antigravity). Claude's MCP is still registered via
     * the Step-5 `claude mcp add` shell-out this phase.
     */
    mcp?: { wire(opts: WireClaudeHooksOptions): Promise<void> }
}

/** Claude Code harness descriptor. */
export const claudeHarness: Harness = {
    id: 'claude',
    displayName: 'Claude Code',
    home: defaultClaudeHome,
    isInstalled: () => existsSync(defaultClaudeHome()),
    installArtifacts: { agents: true, commands: true, skills: true },
    wireHooks: (opts) => wireClaudeHooks(opts),
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
