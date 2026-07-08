/**
 * CLI command: `luca graph`
 *
 * Pure visualization of the pipeline state machine. Emits a Mermaid
 * `stateDiagram-v2` (default) or the machine-definition JSON to stdout. Reads
 * NO `.luca/` state and creates NO actor — the render logic lives in luca-core
 * (which owns the xstate dependency); this verb only formats and prints.
 */
import {
    pipelineDefinitionJson,
    renderPipelineMermaid,
} from '@alecsibilia/luca-core'
import { defineCommand } from 'citty'

const FORMATS = new Set(['mermaid', 'json'])

export const graphCommand = defineCommand({
    meta: {
        name: 'graph',
        description:
            'Visualize the pipeline state machine (Mermaid stateDiagram-v2 or JSON).',
    },
    args: {
        format: {
            type: 'string',
            default: 'mermaid',
            description: 'Output format: mermaid (default) or json.',
        },
        annotate: {
            type: 'boolean',
            default: false,
            description:
                'Annotate Mermaid edges with fix-loop action labels (mermaid only).',
        },
    },
    run({ args }) {
        if (!FORMATS.has(args.format)) {
            process.exitCode = 1
            return
        }

        const out =
            args.format === 'json'
                ? pipelineDefinitionJson()
                : renderPipelineMermaid({ annotate: args.annotate })

        process.stdout.write(`${out}\n`)
    },
})
