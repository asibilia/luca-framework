/**
 * CLI command group: `luca branch`
 *
 * Git branch guards. Part of the v13 `luca` write surface (Phase B).
 *
 * Leaves:
 *   - `branch guard` — refuse when on the repository default branch
 */
import { defineCommand } from 'citty'

import { rejectUnknownFlags, runWriteHandler } from './__helpers/run-handler.ts'

import { lucaBranchGuardTool } from '../../write-surface/index.ts'

const guardCommand = defineCommand({
    meta: {
        name: 'guard',
        description:
            'Assert the current git branch is NOT the repository default ' +
            'branch. Exits 1 when on the default branch, otherwise 0. Use ' +
            'before committing to prevent accidental writes to main. ' +
            'Phase-agnostic.',
    },
    args: {
        'default-branch': {
            type: 'string',
            default: 'main',
            description:
                'Branch name that must NOT equal the current branch ' +
                '(typically the repository default branch, default "main").',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('branch guard', cmd, rawArgs)
        await runWriteHandler('branch guard', lucaBranchGuardTool, {
            default_branch: args['default-branch'],
        })
    },
})

export const branchCommand = defineCommand({
    meta: {
        name: 'branch',
        description: 'Git branch guards for the Luca workflow',
    },
    subCommands: {
        guard: guardCommand,
    },
})
