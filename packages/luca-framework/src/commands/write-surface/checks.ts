/**
 * CLI command group: `luca checks`
 *
 * Run verification commands sequentially with per-command timeouts. Part
 * of the v13 `luca` write surface (Phase B). Restricted to the `execute`
 * and `checks` pipelineSteps.
 *
 * Leaves:
 *   - `checks run` — run an ordered list of commands, report a summary
 */
import { defineCommand } from 'citty'

import { lucaChecksRunTool } from '../../write-surface/index.ts'
import { readJsonPayload, runWriteHandler } from './__helpers/run-handler.ts'

const runCommand = defineCommand({
    meta: {
        name: 'run',
        description:
            'Run an ordered list of verification commands sequentially, ' +
            'each with a timeout, and report a pass/fail summary. ' +
            'Failures do not stop the sequence. Only callable in the ' +
            'execute or checks pipelineStep.',
    },
    args: {
        file: {
            type: 'string',
            required: true,
            description:
                'Path to a JSON file containing the commands array: ' +
                '[{ argv: string[], label?: string }, ...]. argv[0] is ' +
                'the executable; no shell interpolation is applied.',
        },
        'timeout-ms': {
            type: 'string',
            description:
                'Per-command timeout in milliseconds (range 100-600000, ' +
                'default 90000). On timeout the process is killed.',
        },
    },
    async run({ args }) {
        const commands = await readJsonPayload('checks run', args.file)
        await runWriteHandler('checks run', lucaChecksRunTool, {
            commands,
            timeout_ms:
                args['timeout-ms'] !== undefined
                    ? Number(args['timeout-ms'])
                    : undefined,
        })
    },
})

export const checksCommand = defineCommand({
    meta: {
        name: 'checks',
        description: 'Run Luca verification checks',
    },
    subCommands: {
        run: runCommand,
    },
})
