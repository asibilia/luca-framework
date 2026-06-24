/**
 * CLI command group: `luca roadmap`
 *
 * Read and replace the roadmap array in `.luca/state.json`. Part of the
 * v13 `luca` write surface (Phase B).
 *
 * Leaves:
 *   - `roadmap read`   — read the roadmap with currentPhase context (read)
 *   - `roadmap create` — replace the roadmap (idle/triage only)
 */
import { defineCommand } from 'citty'

import {
    readJsonPayload,
    rejectUnknownFlags,
    runWriteHandler,
} from './__helpers/run-handler.ts'

import {
    lucaRoadmapCreateTool,
    lucaRoadmapReadTool,
} from '../../write-surface/index.ts'

const readCommand = defineCommand({
    meta: {
        name: 'read',
        description:
            'Read the roadmap array from .luca/state.json, plus ' +
            'currentPhase and totalPhases for context. Each entry is ' +
            '{ name, deps, status, complexity? }. Pure read; allowed in ' +
            'every pipelineStep.',
    },
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('roadmap read', cmd, rawArgs)
        await runWriteHandler('roadmap read', lucaRoadmapReadTool, {})
    },
})

const createCommand = defineCommand({
    meta: {
        name: 'create',
        description:
            'Replace the roadmap in .luca/state.json with a new ordered ' +
            'list of phases. Resets currentPhase to 0; updates totalPhases. ' +
            'Only callable in the idle or triage pipelineStep.',
    },
    args: {
        file: {
            type: 'string',
            required: true,
            description:
                'Path to a JSON file containing the phases array: ' +
                '[{ name, deps?, status?, complexity? }, ...]. The array ' +
                'may be large, so it is supplied as a file rather than a ' +
                'flag. Defaults applied: deps=[], status=pending.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('roadmap create', cmd, rawArgs)
        const phases = await readJsonPayload('roadmap create', args.file)
        await runWriteHandler('roadmap create', lucaRoadmapCreateTool, {
            phases,
        })
    },
})

export const roadmapCommand = defineCommand({
    meta: {
        name: 'roadmap',
        description: 'Read and replace the Luca workflow roadmap',
    },
    subCommands: {
        read: readCommand,
        create: createCommand,
    },
})
