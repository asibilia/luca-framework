import { defineSettings } from '@getpaseo/plugin'
import { z } from 'zod'

/**
 * Where the engine lives on this host. The plugin never looks in its own
 * folder: it uses these settings, then an installed `luca-run` command.
 */
export const EngineSettingsSchema = z.object({
    /** Absolute path to the engine's `luca-run.ts` entry. Empty: use `luca-run`. */
    engine_path: z.string().default(''),
    /** Absolute path to Bun. Empty: look in the usual places. */
    bun_path: z.string().default(''),
})

export type EngineSettings = z.infer<typeof EngineSettingsSchema>

export const engineSettings = defineSettings({
    id: 'engine',
    scope: 'host',
    version: 1,
    schema: EngineSettingsSchema,
})
