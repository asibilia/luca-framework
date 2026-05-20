import { ProjectPreferencesSchema } from '@alecsibilia/luca-core'

import { loadCurrentConfig } from '../../../hook/helpers/load-current-config.ts'
import { z, type ToolDescriptor } from '../../schemas.ts'

const inputSchema = z.object({})

/**
 * Read project preferences from .luca/config.json's `preferences` key.
 *
 * Returns ProjectPreferencesSchema-validated JSON. Missing file or
 * missing preferences key both yield the schema defaults — that's the
 * "permissive when not initialized" contract.
 *
 * Returns isError ONLY when an explicit preferences object is present
 * but fails validation (e.g. unsafe free-form strings, ReDoS-shaped
 * regex). That case demands explicit user attention rather than a
 * silent fallback.
 */
export const lucaPreferencesReadTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_preferences_read',
    description:
        'Read the project preferences object from .luca/config.json#preferences. Returns ProjectPreferencesSchema-validated JSON, with defaults applied to unset sections. Pure read — allowed in every pipelineStep.',
    inputSchema,
    async handler(_args, ctx) {
        const config = await loadCurrentConfig({ cwd: ctx.cwd })
        const raw =
            'preferences' in config &&
            config.preferences !== null &&
            config.preferences !== undefined
                ? config.preferences
                : {}

        const result = ProjectPreferencesSchema.safeParse(raw)
        if (!result.success) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `luca_preferences_read: .luca/config.json#preferences failed validation: ${result.error.issues
                            .map((i) => `${i.path.join('.')}: ${i.message}`)
                            .join('; ')}`,
                    },
                ],
                isError: true,
            }
        }

        return {
            content: [
                { type: 'text', text: JSON.stringify(result.data, null, 2) },
            ],
        }
    },
}
