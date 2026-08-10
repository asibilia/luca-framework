/**
 * CLI command: `luca graph`
 *
 * Pure visualization of the pipeline. Emits a Mermaid `stateDiagram-v2` to
 * stdout. Reads NO `.luca/` state — the render logic lives in luca-core; this
 * verb only formats and prints.
 *
 * DECISION (state-machine deletion): `--format json` is DROPPED. It was
 * literally `JSON.stringify(pipelineMachine.toJSON())` — an honest dump of the
 * deleted machine's own definition. With the machine gone there is no such
 * definition to dump, and the alternative (fabricating a JSON schema over
 * `PIPELINE_TRANSITIONS`) was explicitly rejected when the verb shipped. Rather
 * than invent one, the flag is removed. Nothing in the repo consumed it (no doc
 * embeds it, no skill runs it). `--format mermaid` is a straight PORT: its
 * edges and grouping always came from `PIPELINE_TRANSITIONS` + the coarse-phase
 * mapping, and its output is pinned byte-for-byte by a golden.
 *
 * `--format` is retained (rather than removed outright) so the shipped
 * `--format mermaid` invocation keeps working; any other value still exits 1.
 */
import { renderPipelineMermaid } from '@alecsibilia/luca-core'
import { defineCommand } from 'citty'

const FORMATS = new Set(['mermaid'])

export const graphCommand = defineCommand({
    meta: {
        name: 'graph',
        description: 'Visualize the pipeline as a Mermaid stateDiagram-v2.',
    },
    args: {
        format: {
            type: 'string',
            default: 'mermaid',
            description: 'Output format: mermaid (the only supported format).',
        },
        annotate: {
            type: 'boolean',
            default: false,
            description: 'Annotate Mermaid edges with fix-loop action labels.',
        },
    },
    run({ args }) {
        if (!FORMATS.has(args.format)) {
            process.exitCode = 1
            return
        }

        process.stdout.write(
            `${renderPipelineMermaid({ annotate: args.annotate })}\n`
        )
    },
})
