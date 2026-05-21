import { loadCurrentConfig } from '../../hook/helpers/load-current-config.ts'

export interface ResolveRepoVaultOptions {
    cwd: string
}

/**
 * Resolve the repo vault name from .luca/config.json.
 *
 * Priority order (per the global vault-routing rule):
 *   1. .luca/config.json#muninn.vault
 *   2. .luca/config.json#vault (legacy / shorthand)
 *   3. LUCA_MUNINN_VAULT environment variable
 *   4. "default" (fallback — collapses to single-vault mode)
 *
 * The env-var fallback matches the documented vault-resolution rule.
 * Returns a non-empty string always; callers can use the result
 * directly as the `vault` argument to muninn tools.
 */
export async function resolveRepoVault(
    opts: ResolveRepoVaultOptions
): Promise<string> {
    const config = await loadCurrentConfig({ cwd: opts.cwd })

    const muninn = config.muninn
    if (muninn && typeof muninn === 'object' && !Array.isArray(muninn)) {
        const v = (muninn as Record<string, unknown>).vault
        if (typeof v === 'string' && v.length > 0) return v
    }

    const topLevelVault = config.vault
    if (typeof topLevelVault === 'string' && topLevelVault.length > 0) {
        return topLevelVault
    }

    const envVault = process.env.LUCA_MUNINN_VAULT
    if (envVault && envVault.length > 0) return envVault

    return 'default'
}
