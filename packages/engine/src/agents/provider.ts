import { z } from 'zod'

/**
 * Pure leaf registry of supported agent providers (`claude` and `agy`) and
 * their ordered model tiers, strongest first. Imported by config schemas and
 * model routing without pulling in any other engine modules.
 */

/** Supported agent execution providers. */
export const ProviderIdSchema = z.enum(['claude', 'agy'])

export type ProviderId = z.infer<typeof ProviderIdSchema>

/** Default provider when `.luca/config.json` omits `models.provider`. */
export const DEFAULT_PROVIDER: ProviderId = 'claude'

/** Antigravity Gemini model tiers, strongest first. */
export const AGY_MODEL_NAMES = [
    'gemini-4-neon-high',
    'gemini-4-argon-high',
    'gemini-3.8-flash-high',
] as const

/** Every launchable model name across all supported providers. */
export const ProviderModelSchema = z.enum([
    'opus',
    'sonnet',
    'haiku',
    ...AGY_MODEL_NAMES,
])

export type ProviderModel = z.infer<typeof ProviderModelSchema>

/** Ordered model tiers and strongest fallback for one provider. */
export type ProviderProfile = {
    id: ProviderId
    tiers: readonly [ProviderModel, ProviderModel, ProviderModel]
    strongest: ProviderModel
}

/** Provider profiles keyed by provider id. */
export const PROVIDERS: Record<ProviderId, ProviderProfile> = {
    claude: {
        id: 'claude',
        tiers: ['opus', 'sonnet', 'haiku'],
        strongest: 'opus',
    },
    agy: {
        id: 'agy',
        tiers: AGY_MODEL_NAMES,
        strongest: AGY_MODEL_NAMES[0],
    },
}

/**
 * Returns the profile for `provider` (defaults to `DEFAULT_PROVIDER`).
 *
 * @example
 * providerOf('agy').strongest // 'gemini-4-neon-high'
 */
export const providerOf = (
    provider: ProviderId = DEFAULT_PROVIDER
): ProviderProfile => PROVIDERS[provider]

/**
 * Whether `model` is one of `provider`'s valid tier models.
 *
 * @example
 * isProviderModel({ provider: 'agy', model: 'gemini-4-argon-high' }) // true
 * isProviderModel({ provider: 'agy', model: 'opus' }) // false
 */
export const isProviderModel = ({
    provider,
    model,
}: {
    provider: ProviderId
    model: string
}): boolean => PROVIDERS[provider].tiers.some((tier) => tier === model)

/**
 * Maps a model floor from `from` to `to` by tier index (`0 | 1 | 2`), falling
 * back to `PROVIDERS[to].strongest` if `floor` is not in `PROVIDERS[from].tiers`.
 *
 * @example
 * mapFloorToProvider({ floor: 'sonnet', from: 'claude', to: 'agy' }) // 'gemini-4-argon-high'
 */
export const mapFloorToProvider = ({
    floor,
    from,
    to,
}: {
    floor: ProviderModel
    from: ProviderId
    to: ProviderId
}): ProviderModel => {
    const index = PROVIDERS[from].tiers.indexOf(floor)
    if (index === -1) return PROVIDERS[to].strongest
    return PROVIDERS[to].tiers[index] ?? PROVIDERS[to].strongest
}

/**
 * The provider whose tiers hold `model`; `DEFAULT_PROVIDER` for a model on
 * no provider's tiers.
 *
 * @example
 * providerOfModel('gemini-4-argon-high') // 'agy'
 * providerOfModel('sonnet') // 'claude'
 */
export const providerOfModel = (model: ProviderModel): ProviderId =>
    ProviderIdSchema.options.find((provider) =>
        isProviderModel({ provider, model })
    ) ?? DEFAULT_PROVIDER

/**
 * The strongest model of `model`'s provider: the baseline a cheaper model
 * on that provider is judged against (Opus for Claude, the top Gemini tier
 * for `agy`).
 *
 * @example
 * strongestModelOf('haiku') // 'opus'
 * strongestModelOf('gemini-3.8-flash-high') // 'gemini-4-neon-high'
 */
export const strongestModelOf = (model: ProviderModel): ProviderModel =>
    PROVIDERS[providerOfModel(model)].strongest
