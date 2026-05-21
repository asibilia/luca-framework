/**
 * CLI command group: `luca repo`
 *
 * Repository housekeeping. Part of the v13 `luca` write surface (Phase B).
 *
 * Leaves:
 *   - `repo cleanup-apply` — apply one shadow-scan remediation finding
 */
import { defineCommand } from 'citty'

import { lucaRepoCleanupApplyTool } from '../../write-surface/index.ts'
import { readJsonPayload, runWriteHandler } from './__helpers/run-handler.ts'

const cleanupApplyCommand = defineCommand({
    meta: {
        name: 'cleanup-apply',
        description:
            'Apply a single remediation finding from a ' +
            'luca-shadow-scanner ShadowScanReport. The finding\'s ' +
            'recommended_action drives what gets applied (delete/move). ' +
            'Requires --confirm; phase-agnostic.',
    },
    args: {
        file: {
            type: 'string',
            required: true,
            description:
                'Path to a JSON file containing a single ShadowScanFinding ' +
                'object from a ShadowScanReport.',
        },
        confirm: {
            type: 'boolean',
            default: false,
            description:
                'Must be passed to actually apply the remediation. Without ' +
                'it the command is a no-op preview so a stray call cannot ' +
                'delete or move files.',
        },
    },
    async run({ args }) {
        const finding = await readJsonPayload('repo cleanup-apply', args.file)
        await runWriteHandler(
            'repo cleanup-apply',
            lucaRepoCleanupApplyTool,
            {
                finding,
                confirm: args.confirm,
            }
        )
    },
})

export const repoCommand = defineCommand({
    meta: {
        name: 'repo',
        description: 'Repository housekeeping for the Luca workflow',
    },
    subCommands: {
        'cleanup-apply': cleanupApplyCommand,
    },
})
