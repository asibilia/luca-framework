/**
 * Reads of single config fields, each with the default the engine uses when
 * the config leaves it out: the prepare and test time limits, how many
 * prepares run at once, the decision model, the models block, and the feature
 * map's path.
 */
import { normalize } from 'node:path'

import {
    DecisionModelConfigSchema,
    ModelsConfigSchema,
    type EngineConfig,
    type ModelsConfig,
} from './engine-config-schema'

import type { DecisionModelId } from '../jev/jev-schemas'
import { DEFAULT_COMMAND_TIMEOUT_MS } from '../shell/run-command'

/**
 * How long the prepare command may run when the config doesn't say: 30
 * minutes. A first build in a fresh worktree can take many minutes
 * (HeartGold's takes about 8), far past the 5 minutes other commands get.
 */
export const DEFAULT_PREPARE_TIMEOUT_MS = 30 * 60 * 1000

/**
 * The prepare command's time limit: the config's `prepare_timeout_ms`, else
 * the default.
 *
 * @example
 * prepareTimeoutOf({ config: { ...config, prepare_timeout_ms: 3_600_000 } }) // 3_600_000
 */
export const prepareTimeoutOf = ({
    config,
}: {
    config: EngineConfig
}): number => config.prepare_timeout_ms ?? DEFAULT_PREPARE_TIMEOUT_MS

/**
 * Each test command's time limit (#542): the config's `test_timeout_ms`,
 * else the engine's default for any command. It holds for every run of a
 * test command (baseline, red check, gates); types and lint keep the default.
 *
 * @example
 * testTimeoutOf({ config: { ...config, test_timeout_ms: 900_000 } }) // 900_000
 */
export const testTimeoutOf = ({ config }: { config: EngineConfig }): number =>
    config.test_timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS

/**
 * How many prepare runs may go at once when the config doesn't say: 1. A
 * build is often heavy on the CPU, so builds at the same time only slow each
 * other down (HeartGold's four first builds took 19 to 25 minutes each at
 * once, against 8 to 10 alone).
 */
export const DEFAULT_PREPARE_CONCURRENCY = 1

/**
 * How many prepare runs may go at once: the config's `prepare_concurrency`,
 * else the default.
 *
 * @example
 * prepareConcurrencyOf({ config: { ...config, prepare_concurrency: 2 } }) // 2
 */
export const prepareConcurrencyOf = ({
    config,
}: {
    config: EngineConfig
}): number => config.prepare_concurrency ?? DEFAULT_PREPARE_CONCURRENCY

/**
 * The decision model a run asks: the config's `decision_model.model`, else
 * Clef (`DEFAULT_DECISION_MODEL`).
 *
 * @example
 * decisionModelOf({ config: { ...config, decision_model: { model: '@cf/cloudflare/clef-flash' } } })
 * // '@cf/cloudflare/clef-flash'
 */
export const decisionModelOf = ({
    config,
}: {
    config: EngineConfig
}): DecisionModelId =>
    config.decision_model?.model ?? DecisionModelConfigSchema.parse({}).model

/**
 * The run's model floors and confidence bar: the config's `models`, else
 * the schema's defaults (every floor `opus`).
 *
 * @example
 * modelsOf({ config }).floors['test-writer'] // 'opus'
 */
export const modelsOf = ({ config }: { config: EngineConfig }): ModelsConfig =>
    config.models ?? ModelsConfigSchema.parse({})

/**
 * The feature map's path (#583), in the form a worktree-relative path takes
 * everywhere else (`normalize`, no leading `./`), or `null` with no map.
 * `./docs/feature-map.md` and `docs//feature-map.md` are both
 * `docs/feature-map.md`. The role rules, the permission rules, the prompts,
 * and the red check all read the map's path here, so they agree on it
 * whatever way the config spells it.
 *
 * @example
 * featureMapPath({ config: { ...config, feature_map: './docs/feature-map.md' } }) // 'docs/feature-map.md'
 */
export const featureMapPath = ({
    config,
}: {
    config: EngineConfig
}): string | null =>
    config.feature_map === undefined
        ? null
        : normalize(config.feature_map).replace(/^\.\//, '')

/**
 * Whether a feature map path names a folder of pages (#597): any path not
 * ending in `.md`. The path alone decides, so the guard and the prompts,
 * which never read the disk, agree with the red check. `loadEngineConfig`
 * refuses such a path when it is a file, so a map file must end in `.md`.
 *
 * @example
 * isFeatureMapFolder({ path: 'docs/feature-map' }) // true
 * isFeatureMapFolder({ path: 'docs/feature-map.md' }) // false
 */
export const isFeatureMapFolder = ({ path }: { path: string }): boolean =>
    !path.toLowerCase().endsWith('.md')
