import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface LoadCurrentConfigOptions {
    cwd: string
}

/**
 * Read .luca/config.json and return the parsed object.
 *
 * Returns `{}` when the file is missing OR malformed — preserves the
 * "permissive when not initialized" contract. Callers that need a
 * specific section (e.g. preferences, muninn) apply their own schema
 * to the returned object.
 *
 * Treated as an opaque record at this layer — the config has multiple
 * sections (muninn, preferences, oversight, …) each with its own
 * schema. The .luca/config.json file itself has no top-level schema.
 */
export async function loadCurrentConfig(
    opts: LoadCurrentConfigOptions,
): Promise<Record<string, unknown>> {
    const configPath = join(opts.cwd, '.luca', 'config.json')
    if (!existsSync(configPath)) return {}
    try {
        const raw = JSON.parse(await readFile(configPath, 'utf-8'))
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            return raw as Record<string, unknown>
        }
        return {}
    } catch {
        return {}
    }
}
