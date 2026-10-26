/**
 * Loading the engine config (`loadEngineConfig`). The config's shape is in
 * `engine-config-schema.ts`, the reads of its fields in `config-fields.ts`,
 * and the test commands in `test-commands.ts`; this module re-exports all of
 * them, so importers use `./engine-config` as ever.
 */
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import { featureMapPath, isFeatureMapFolder } from './config-fields'
import {
    ENGINE_CONFIG_FILE,
    EngineConfigSchema,
    type EngineConfig,
} from './engine-config-schema'

export {
    DEFAULT_PREPARE_CONCURRENCY,
    DEFAULT_PREPARE_TIMEOUT_MS,
    decisionModelOf,
    featureMapPath,
    isFeatureMapFolder,
    modelsOf,
    prepareConcurrencyOf,
    prepareTimeoutOf,
    testTimeoutOf,
} from './config-fields'
export {
    DecisionModelConfigSchema,
    DEFAULT_MODEL,
    EffortLevelSchema,
    ENGINE_CONFIG_FILE,
    EngineConfigSchema,
    ModelNameSchema,
    ModelsConfigSchema,
    MuninnConfigSchema,
    ROUTED_ROLES,
    TestResultsSchema,
} from './engine-config-schema'
export type {
    EffortLevel,
    EngineConfig,
    ModelName,
    ModelsConfig,
    TestResults,
} from './engine-config-schema'
export {
    bunTestCommands,
    caseLimitOf,
    fastBunCommand,
    givesPerTestResults,
    hasSlowTests,
    isBunTestCommand,
    slowTestCommands,
    testCommands,
    type TestCommand,
} from './test-commands'

export type LoadEngineConfigResult =
    | { ok: true; config: EngineConfig }
    | { ok: false; error: string }

const parseJson = ({
    text,
}: {
    text: string
}): { ok: true; value: unknown } | { ok: false; error: string } => {
    try {
        return { ok: true, value: JSON.parse(text) }
    } catch (error) {
        return { ok: false, error: String(error) }
    }
}

/**
 * Reads and checks the engine config at `<repo_root>/.luca/config.json`.
 *
 * Never throws: a missing file, bad JSON, or a config of the wrong shape comes
 * back as `{ ok: false, error }` with a message a person can act on.
 *
 * @example
 * const result = await loadEngineConfig({ repo_root: process.cwd() })
 * if (result.ok) console.log(result.config.checks.test)
 */
export const loadEngineConfig = async ({
    repo_root,
}: {
    repo_root: string
}): Promise<LoadEngineConfigResult> => {
    const path = join(repo_root, ENGINE_CONFIG_FILE)
    const file = Bun.file(path)
    if (!(await file.exists())) {
        return { ok: false, error: `No engine config found at ${path}` }
    }
    const json = parseJson({ text: await file.text() })
    if (!json.ok) {
        return {
            ok: false,
            error: `${path} is not valid JSON: ${json.error}`,
        }
    }
    const parsed = EngineConfigSchema.safeParse(json.value)
    if (!parsed.success) {
        return {
            ok: false,
            error: `${path} is not a valid engine config:\n${z.prettifyError(parsed.error)}`,
        }
    }
    const map = featureMapPath({ config: parsed.data })
    if (
        map !== null &&
        isFeatureMapFolder({ path: map }) &&
        (await isFile({ path: join(repo_root, map) }))
    ) {
        return {
            ok: false,
            error: `${path} is not a valid engine config: feature_map ${map} is a file, but a path not ending in ".md" names a folder of pages. Rename the map to end in ".md", or make it a folder of *.md pages.`,
        }
    }
    return { ok: true, config: parsed.data }
}

/** Whether a path is a file (or a link to one), without failing. */
const isFile = async ({ path }: { path: string }): Promise<boolean> => {
    try {
        return (await stat(path)).isFile()
    } catch {
        return false
    }
}
