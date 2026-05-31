import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { sanitizeVaultName } from './sanitize-vault-name.ts'

/**
 * Resolve the project-scoped MuninnDB vault name for the repo at `cwd`.
 *
 * Reads `<cwd>/.luca/config.json`, extracts `muninn.vault`, sanitizes it via
 * {@link sanitizeVaultName}, and returns the result. Falls back to `'default'`
 * when the file is missing, unreadable, malformed, or the key is unset/empty.
 *
 * Ported from luca-mastracode `state/vault.ts` `resolveProjectVault()` —
 * retargeted from `.planning/config.json` to the v13 `.luca/config.json`, and
 * parameterized by `cwd` (mastracode used an implicit `process.cwd()`).
 */
export function resolveProjectVault(cwd: string): string {
    const configPath = join(cwd, '.luca', 'config.json')
    if (!existsSync(configPath)) return 'default'
    try {
        const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as {
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
