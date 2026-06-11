/**
 * CLI command group: `luca workflow`
 *
 * Workflow lifecycle operations. Part of the v13 `luca` write surface
 * (Phase B).
 *
 * Leaves:
 *   - `workflow reset` — reset .luca/state.json to idle defaults
 */
import { defineCommand } from 'citty'

import { lucaWorkflowResetTool } from '../../write-surface/index.ts'
import { rejectUnknownFlags, runWriteHandler } from './__helpers/run-handler.ts'

const resetCommand = defineCommand({
    meta: {
        name: 'reset',
        description:
            'Reset .luca/state.json to schema defaults (idle) and remove ' +
            'the pipeline lock. Destructive but recoverable — only resets ' +
            'workflow bookkeeping, no source-tree changes. Requires ' +
            '--confirm. Phase-agnostic.',
    },
    args: {
        confirm: {
            type: 'boolean',
            default: false,
            description:
                'Must be passed to actually perform the reset. Without it ' +
                'the command refuses so an accidental call cannot wipe the ' +
                'workflow.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('workflow reset', cmd, rawArgs)
        await runWriteHandler('workflow reset', lucaWorkflowResetTool, {
            confirm: args.confirm,
        })
    },
})

export const workflowCommand = defineCommand({
    meta: {
        name: 'workflow',
        description: 'Luca workflow lifecycle operations',
    },
    subCommands: {
        reset: resetCommand,
    },
})
