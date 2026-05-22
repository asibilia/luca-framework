import { join } from 'node:path'

import {
    loadCurrentConfig,
    lucaRootPaths,
    mergePreferences,
} from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { writeAtomicFile } from '../helpers/write-atomic.ts'

const inputSchema = z.object({
    preferences: z
        .record(z.string(), z.unknown())
        .describe(
            'Partial preferences object. Top-level sections (branching, commits, pr, release, tracker, schemaVersion) overlay the existing ones; unspecified sections are left unchanged. The merged result is re-validated against ProjectPreferencesSchema before write.'
        ),
})

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
        const result = mergePreferences(config, args.preferences)
        if (!result.ok) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `luca_preferences_write: validation failed: ${result.error}`,
                    },
                ],
                isError: true,
            }
        }

        const absPath = join(ctx.cwd, lucaRootPaths.config)
        await writeAtomicFile(
            absPath,
            JSON.stringify(result.nextConfig, null, 2) + '\n'
        )

        const ignoredNote =
            result.ignoredKeys.length > 0
                ? `; ignored ${result.ignoredKeys.length} unknown key(s): ${result.ignoredKeys.join(', ')}`
                : ''

        return {
            content: [
                {
                    type: 'text',
                    text: `wrote .luca/config.json (preferences section updated; ${result.mergedSections.length} section(s) merged${ignoredNote})`,
                },
            ],
        }
    },
}
