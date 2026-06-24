/**
 * CLI command group: `luca preferences`
 *
 * Read and update the `preferences` section of `.luca/config.json`. Part
 * of the v13 `luca` write surface (Phase B).
 *
 * Leaves:
 *   - `preferences read`  — read validated project preferences (read)
 *   - `preferences write` — section-level merge into config preferences
 */
import { defineCommand } from 'citty'

import {
    readJsonPayload,
    rejectUnknownFlags,
    runWriteHandler,
} from './__helpers/run-handler.ts'

import {
    lucaPreferencesReadTool,
    lucaPreferencesWriteTool,
} from '../../write-surface/index.ts'

const readCommand = defineCommand({
    meta: {
        name: 'read',
        description:
            'Read the project preferences object from ' +
            '.luca/config.json#preferences. Returns ' +
            'ProjectPreferencesSchema-validated JSON with defaults applied ' +
            'to unset sections. Pure read; allowed in every pipelineStep.',
    },
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('preferences read', cmd, rawArgs)
        await runWriteHandler('preferences read', lucaPreferencesReadTool, {})
    },
})

const writeCommand = defineCommand({
    meta: {
        name: 'write',
        description:
            'Update the preferences section of .luca/config.json. ' +
            'Section-level shallow merge; other config keys are preserved. ' +
            'The merged result is validated against ProjectPreferencesSchema ' +
            'before write (rejects unsafe free-form input and ReDoS regex).',
    },
    args: {
        file: {
            type: 'string',
            required: true,
            description:
                'Path to a JSON file containing the partial preferences ' +
                'object. Top-level sections (branching, commits, pr, ' +
                'release, tracker, schemaVersion) overlay existing ones; ' +
                'unspecified sections are left unchanged. Supplied as a ' +
                'file because the object may be large.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('preferences write', cmd, rawArgs)
        const preferences = await readJsonPayload(
            'preferences write',
            args.file
        )
        await runWriteHandler('preferences write', lucaPreferencesWriteTool, {
            preferences,
        })
    },
})

export const preferencesCommand = defineCommand({
    meta: {
        name: 'preferences',
        description: 'Read and update Luca project preferences',
    },
    subCommands: {
        read: readCommand,
        write: writeCommand,
    },
})
