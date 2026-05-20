import { join } from 'node:path'

import {
    lucaRootPaths,
    ProjectPreferencesSchema,
} from '@alecsibilia/luca-core'

import { loadCurrentConfig } from '../../../hook/helpers/load-current-config.ts'
import { z, type ToolDescriptor } from '../../schemas.ts'
import { writeAtomicFile } from '../write-atomic.ts'

const inputSchema = z.object({
    preferences: z
        .record(z.string(), z.unknown())
        .describe(
            'Partial preferences object. Top-level sections (branching, commits, pr, release, tracker, schemaVersion) overlay the existing ones; unspecified sections are left unchanged. The merged result is re-validated against ProjectPreferencesSchema before write.',
        ),
})

const KNOWN_SECTIONS = [
    'schemaVersion',
    'branching',
    'commits',
    'pr',
    'release',
    'tracker',
] as const

/**
 * Update `.luca/config.json#preferences` with a section-level shallow
 * merge against the existing preferences. The merged result is
 * validated through ProjectPreferencesSchema so unsafe free-form
 * strings or ReDoS-shaped regexes are rejected before any write occurs.
 *
 * Other top-level keys in config.json (lucaVersion, vault, oversight,
 * etc.) are preserved verbatim — only the `preferences` key is
 * touched. The full file is rewritten atomically.
 */
export const lucaPreferencesWriteTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_preferences_write',
    description:
        'Write/update the preferences section of .luca/config.json. Section-level shallow merge; preserves other config keys. Validated through ProjectPreferencesSchema (rejects unsafe free-form input and ReDoS-shaped regex).',
    inputSchema,
    async handler(args, ctx) {
        const config = await loadCurrentConfig({ cwd: ctx.cwd })
        const currentPrefs =
            'preferences' in config &&
            config.preferences &&
            typeof config.preferences === 'object'
                ? (config.preferences as Record<string, unknown>)
                : {}

        // Section-level shallow merge.
        const mergedPrefs: Record<string, unknown> = { ...currentPrefs }
        for (const section of KNOWN_SECTIONS) {
            if (section in args.preferences) {
                mergedPrefs[section] = args.preferences[section]
            }
        }

        const result = ProjectPreferencesSchema.safeParse(mergedPrefs)
        if (!result.success) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `luca_preferences_write: validation failed: ${result.error.issues
                            .map((i) => `${i.path.join('.')}: ${i.message}`)
                            .join('; ')}`,
                    },
                ],
                isError: true,
            }
        }

        const nextConfig = { ...config, preferences: result.data }
        const absPath = join(ctx.cwd, lucaRootPaths.config)
        await writeAtomicFile(
            absPath,
            JSON.stringify(nextConfig, null, 2) + '\n',
        )

        return {
            content: [
                {
                    type: 'text',
                    text: `wrote .luca/config.json (preferences section updated; ${Object.keys(args.preferences).length} sections merged)`,
                },
            ],
        }
    },
}
