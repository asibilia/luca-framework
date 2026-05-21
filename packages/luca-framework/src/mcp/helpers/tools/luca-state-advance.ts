import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
    isLegalTransition,
    PipelineStep,
    PIPELINE_TRANSITIONS,
} from '@alecsibilia/luca-core'

import { loadCurrentState } from '../../../hook/helpers/load-current-state.ts'
import { z, type ToolDescriptor } from '../../schemas.ts'

const inputSchema = z.object({
    toStep: PipelineStep.describe(
        'Target pipelineStep. Must be a legal transition from the current step (see the pipeline-transitions table).'
    ),
})

export const lucaStateAdvanceTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_state_advance',
        description:
            'Atomically advance the workflow pipelineStep. Validates the transition against the pipeline-transitions table; legal forward + loop-back transitions allowed, illegal jumps rejected.',
        inputSchema,
        async handler(args, ctx) {
            const state = await loadCurrentState({ cwd: ctx.cwd })
            const from = state.pipelineStep
            const to = args.toStep

            if (!isLegalTransition(from, to)) {
                const allowed = PIPELINE_TRANSITIONS[from].join(', ')
                return {
                    content: [
                        {
                            type: 'text',
                            text: `illegal transition: '${from}' → '${to}'. Allowed next steps from '${from}': [${allowed}].`,
                        },
                    ],
                    isError: true,
                }
            }

            const next = { ...state, pipelineStep: to }
            const lucaDir = join(ctx.cwd, '.luca')
            await mkdir(lucaDir, { recursive: true })
            const path = join(lucaDir, 'state.json')
            const tmp = `${path}.tmp`
            await writeFile(tmp, JSON.stringify(next, null, 2) + '\n')
            await rename(tmp, path)

            return {
                content: [
                    {
                        type: 'text',
                        text: `pipelineStep advanced: '${from}' → '${to}'`,
                    },
                ],
            }
        },
    }
