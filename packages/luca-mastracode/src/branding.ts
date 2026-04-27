/**
 * Luca branding + version resolution.
 *
 * Reads `.planning/config.json` for project-level branding overrides and
 * resolves the framework version that the TUI displays in its title bar.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface LucaBranding {
    name: string
    tagline: string
}

export function loadBranding(): LucaBranding {
    const configPath = join(process.cwd(), '.planning', 'config.json')
    if (existsSync(configPath)) {
        try {
            const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
            return {
                name: raw.branding?.name ?? 'Luca',
                tagline:
                    raw.branding?.tagline ?? 'AI-powered development workflow',
            }
        } catch {
            // Fall through to defaults
        }
    }
    return { name: 'Luca', tagline: 'AI-powered development workflow' }
}

/**
 * Resolve the Luca framework version to display in the TUI.
 *
 * Source priority:
 *   1. `LUCA_VERSION` env var — set by `luca run` from the framework package.
 *   2. Bundled luca-framework `package.json` — when the harness is launched
 *      from inside the published tarball (`dist/mastracode/src/index.ts`,
 *      with framework root two levels up).
 *   3. Sibling workspace `luca-framework/package.json` — when running from
 *      the monorepo source.
 *   4. Local `luca-mastracode/package.json` — last-resort fallback.
 *
 * Without this, `MastraTUI` falls back to its built-in default of `0.1.0`,
 * which makes `/update` print "Could not determine the current version".
 */
export function resolveLucaVersion(): string {
    if (process.env.LUCA_VERSION) return process.env.LUCA_VERSION

    const thisDir = dirname(fileURLToPath(import.meta.url))
    const candidates = [
        // Installed: <framework-root>/dist/mastracode/src/ -> ../../../package.json
        join(thisDir, '..', '..', '..', 'package.json'),
        // Workspace: packages/luca-mastracode/src/ -> ../../luca-framework/package.json
        join(thisDir, '..', '..', 'luca-framework', 'package.json'),
        // Last resort: packages/luca-mastracode/src/ -> ../package.json
        join(thisDir, '..', 'package.json'),
    ]

    for (const candidate of candidates) {
        if (!existsSync(candidate)) continue
        try {
            const raw = JSON.parse(readFileSync(candidate, 'utf-8'))
            if (
                raw.name === '@alecsibilia/luca-framework' ||
                raw.name === '@alecsibilia/luca-mastracode'
            ) {
                if (typeof raw.version === 'string') return raw.version
            }
        } catch {
            // Try next candidate
        }
    }

    return '0.0.0-dev'
}
