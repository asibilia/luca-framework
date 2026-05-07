/**
 * Vault helpers — project-scoped MuninnDB vault resolution.
 *
 * `sanitizeVaultName` mirrors the regex from
 * `packages/luca-framework/src/utils/vault-setup.ts:108-114` (lowercase,
 * `[^a-z0-9-]` → `-`, collapse runs, trim ends). The framework re-exports
 * this function so existing consumers continue to import it from
 * `@alecsibilia/luca-framework`.
 *
 * `resolveProjectVault` reads `.planning/config.json` via `CONFIG_PATH()` and
 * extracts `muninn.vault`, applying `sanitizeVaultName` and falling back to
 * `"default"` when the file is missing, malformed, or the key is unset.
 */
import { existsSync, readFileSync } from 'node:fs'

import { CONFIG_PATH } from '../util/phase-paths.js'

/**
 * Sanitize a string into a valid vault name (lowercase kebab-case).
 *
 * Converts to lowercase, replaces non-alphanumeric characters with dashes,
 * collapses consecutive dashes, and trims leading/trailing dashes.
 *
 * @example
 * sanitizeVaultName("My Cool App!")  // "my-cool-app"
 * sanitizeVaultName("@scope/pkg")    // "scope-pkg"
 */
export function sanitizeVaultName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}

/**
 * Resolve the project-scoped MuninnDB vault name.
 *
 * Reads `.planning/config.json`, extracts `muninn.vault`, sanitizes it via
 * `sanitizeVaultName`, and returns the result. Falls back to `"default"` when
 * the file is missing, unreadable, malformed, or the key is unset/empty.
 */
export function resolveProjectVault(): string {
    const p = CONFIG_PATH()
    if (!existsSync(p)) return 'default'
    try {
        const raw = JSON.parse(readFileSync(p, 'utf-8')) as {
            muninn?: { vault?: unknown }
        }
        const vault = raw?.muninn?.vault
        if (typeof vault !== 'string' || vault.trim() === '') return 'default'
        const sanitized = sanitizeVaultName(vault)
        return sanitized.length > 0 ? sanitized : 'default'
    } catch {
        return 'default'
    }
}
