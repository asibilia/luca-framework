import { defineSettings } from '@getpaseo/plugin'
import { z } from 'zod'

/**
 * Where the engine lives on this host, and the **usage lines**. The plugin
 * never looks in its own folder: it uses these settings, then an installed
 * `luca-run` command.
 */
export const EngineSettingsSchema = z.object({
    /** Absolute path to the engine's `luca-run.ts` entry. Empty: use `luca-run`. */
    engine_path: z.string().default(''),
    /** Absolute path to Bun. Empty: look in the usual places. */
    bun_path: z.string().default(''),
    /**
     * The weekly usage line: every run pauses once the account's weekly
     * window is this full, in percent.
     */
    weekly_line: z.number().min(0).max(100).default(80),
    /**
     * The 5-hour usage line: every run pauses once the account's 5-hour
     * window is this full, in percent.
     */
    five_hour_line: z.number().min(0).max(100).default(85),
})

export type EngineSettings = z.infer<typeof EngineSettingsSchema>

/** Engine settings as saved: any left out take their defaults. */
export type EngineSettingsInput = z.input<typeof EngineSettingsSchema>

export const engineSettings = defineSettings({
    id: 'engine',
    scope: 'host',
    version: 1,
    schema: EngineSettingsSchema,
})
