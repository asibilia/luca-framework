/**
 * Mastracode settings interop — read upstream settings.json and resolve the
 * model that the active model pack maps to for a given mode.
 *
 * Used by the post-login model-pack restore patch to undo mastracode's
 * default-model override.
 */
import { join } from 'node:path'

/**
 * Resolve the path to mastracode's settings.json on the host platform.
 * Mirrors mastracode's `getAppDataDir()` (chunk-XV4ZDFJA.js:79).
 */
export function resolveMastracodeSettingsPath(): string | undefined {
    const platform = process.platform
    let baseDir: string
    if (platform === 'darwin') {
        const home = process.env.HOME
        if (!home) return undefined
        baseDir = join(home, 'Library', 'Application Support')
    } else if (platform === 'win32') {
        const appData =
            process.env.APPDATA ??
            (process.env.USERPROFILE
                ? join(process.env.USERPROFILE, 'AppData', 'Roaming')
                : undefined)
        if (!appData) return undefined
        baseDir = appData
    } else {
        const xdg = process.env.XDG_DATA_HOME
        const home = process.env.HOME
        if (xdg) baseDir = xdg
        else if (home) baseDir = join(home, '.local', 'share')
        else return undefined
    }
    return join(baseDir, 'mastracode', 'settings.json')
}

/**
 * Resolve the model ID the active pack maps to for a given mode, mirroring
 * mastracode's `getAvailableModePacks` (chunk-D6MEBQTC.js:410) for built-in
 * provider packs and consulting `customModelPacks` for custom ones.
 *
 * Returns undefined when:
 *   - The pack isn't recognised (e.g. user has neither logged into the
 *     provider nor saved a custom pack with that id)
 *   - The pack doesn't define a model for the requested mode
 */
export function resolvePackModelForMode({
    settings,
    activeModelPackId,
    providerId,
    modeId,
    isOauth,
}: {
    settings: { customModelPacks?: unknown }
    activeModelPackId: string
    providerId: string
    modeId: string
    isOauth: boolean
}): string | undefined {
    if (activeModelPackId === 'anthropic') {
        // Mirrors `getAvailableModePacks` in chunk-D6MEBQTC.js:414 — the
        // Anthropic pack's build/plan model differs by access mode.
        const anthropicBuild = isOauth
            ? 'anthropic/claude-opus-4-7'
            : 'anthropic/claude-sonnet-4-6'
        const anthropicPack: Record<string, string> = {
            build: anthropicBuild,
            plan: anthropicBuild,
            fast: 'anthropic/claude-haiku-4-5',
        }
        return anthropicPack[modeId]
    }
    if (activeModelPackId === 'openai') {
        const openaiPack: Record<string, string> = {
            build: 'openai/gpt-5.4',
            plan: 'openai/gpt-5.4',
            fast: 'openai/gpt-5.4-mini',
        }
        return openaiPack[modeId]
    }
    if (activeModelPackId.startsWith('custom:')) {
        const name = activeModelPackId.slice('custom:'.length)
        const customPacks = Array.isArray(settings.customModelPacks)
            ? (settings.customModelPacks as Array<{
                  name?: unknown
                  models?: Record<string, unknown>
              }>)
            : []
        const pack = customPacks.find(
            (p) => typeof p?.name === 'string' && p.name === name
        )
        const modelId = pack?.models?.[modeId]
        return typeof modelId === 'string' && modelId.length > 0
            ? modelId
            : undefined
    }
    // Unknown pack id — nothing to do. Reference providerId so eslint stays
    // quiet about the unused parameter when callers pass it for future use.
    void providerId
    return undefined
}
