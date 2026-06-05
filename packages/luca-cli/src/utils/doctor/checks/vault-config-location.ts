/**
 * Doctor check: `.luca/config.json` stores the vault in the wrong place.
 *
 * The canonical vault location is `muninn.vault` (see `resolveRepoVault` and the
 * vault-routing rule). An earlier `luca init` skeleton wrote a TOP-LEVEL `vault`
 * key instead, so projects initialized before the fix carry a stale top-level
 * `vault` (usually `null`) alongside the real `muninn.vault` that `luca
 * vault:init` writes. The top-level key is never primary — `resolveRepoVault`
 * only consults it as a legacy fallback — so it is dead weight that misleads
 * anyone reading the config.
 *
 * Project-scoped (reads `<cwd>/.luca/config.json`). Warning-only with an
 * auto-`fix()` that folds a non-empty top-level `vault` into `muninn.vault`
 * (only when `muninn.vault` is unset) and removes the top-level key, preserving
 * every other config key.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { CheckResult, DoctorCheck, DoctorFixResult } from '../types'

const CHECK_NAME = 'Vault config location'

function configPath(): string {
    return join(process.cwd(), '.luca', 'config.json')
}

async function readConfig(): Promise<Record<string, unknown> | null> {
    const p = configPath()
    if (!existsSync(p)) return null
    try {
        const raw = JSON.parse(await readFile(p, 'utf-8')) as unknown
        return raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : null
    } catch {
        return null
    }
}

/** Return the trimmed string if non-empty after trimming, else undefined. */
function nonEmptyTrimmed(v: unknown): string | undefined {
    if (typeof v === 'string') {
        const trimmed = v.trim()
        if (trimmed.length > 0) return trimmed
    }
    return undefined
}

/** Read `muninn.vault` as a non-empty (trimmed) string, or undefined. */
function muninnVaultOf(config: Record<string, unknown>): string | undefined {
    const muninn = config.muninn
    if (muninn && typeof muninn === 'object' && !Array.isArray(muninn)) {
        return nonEmptyTrimmed((muninn as Record<string, unknown>).vault)
    }
    return undefined
}

export const vaultConfigLocationCheck: DoctorCheck = {
    name: CHECK_NAME,
    scope: 'project',

    async run(): Promise<CheckResult> {
        const pass = (message: string): CheckResult => ({
            name: CHECK_NAME,
            status: 'pass',
            message,
            fixCommand: null,
            details: null,
        })

        const config = await readConfig()
        if (config === null) {
            return pass('no .luca/config.json to check')
        }
        if (!('vault' in config)) {
            return pass('no legacy top-level vault key present')
        }

        // A stale top-level `vault` key is present.
        const topLevel = nonEmptyTrimmed(config.vault)
        const muninnVault = muninnVaultOf(config)
        const wouldFold = topLevel !== undefined && muninnVault === undefined

        const detail = wouldFold
            ? `It carries "${topLevel}" and muninn.vault is unset — \`--fix\` `
              + `folds it into muninn.vault, then removes the top-level key.`
            : `\`--fix\` removes it (muninn.vault is the source of truth).`

        return {
            name: CHECK_NAME,
            status: 'warning',
            message:
                'config.json has a top-level `vault` key (canonical location is `muninn.vault`)',
            fixCommand: 'luca doctor --fix',
            details: [
                `.luca/config.json stores a top-level \`vault\` key. The `
                    + `canonical location is \`muninn.vault\`; the top-level key `
                    + `is only read as a legacy fallback.`,
                detail,
            ].join('\n  '),
        }
    },

    async fix(): Promise<DoctorFixResult> {
        const config = await readConfig()
        if (config === null || !('vault' in config)) {
            return { applied: [], errors: [] }
        }
        try {
            const topLevel = nonEmptyTrimmed(config.vault)
            const muninnVault = muninnVaultOf(config)
            const next: Record<string, unknown> = { ...config }
            const applied: string[] = []

            if (topLevel !== undefined && muninnVault === undefined) {
                const existingMuninn =
                    config.muninn &&
                    typeof config.muninn === 'object' &&
                    !Array.isArray(config.muninn)
                        ? (config.muninn as Record<string, unknown>)
                        : {}
                next.muninn = { ...existingMuninn, vault: topLevel }
                applied.push(`Folded top-level vault "${topLevel}" → muninn.vault`)
            }

            delete next.vault
            applied.push('Removed stale top-level `vault` key from .luca/config.json')

            await writeFile(configPath(), JSON.stringify(next, null, 2) + '\n')
            return { applied, errors: [] }
        } catch (err) {
            return {
                applied: [],
                errors: [
                    `Failed to normalize .luca/config.json vault location: `
                        + `${(err as Error).message}`,
                ],
            }
        }
    },
}
