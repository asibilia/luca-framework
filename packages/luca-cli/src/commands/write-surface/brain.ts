/**
 * CLI command group: `luca brain`
 *
 * Brain-tree (project identity / requirements) root resolution. Brain trees
 * live in MuninnDB; because `muninn_recall_tree` requires a ULID and rejects
 * a concept as `root_id`, the tree's root ULID is cached in
 * `.luca/config.json#muninn.brainRoots` at creation and resolved back here.
 *
 * Leaves:
 *   - `brain set-root`     — persist a brain tree root ULID (local write)
 *   - `brain recall-root`  — emit a muninn_recall_tree procedure for a tree
 */
import { defineCommand } from 'citty'

import { rejectUnknownFlags, runWriteHandler } from './__helpers/run-handler.ts'

import {
    lucaBrainRecallRootTool,
    lucaBrainSetRootTool,
} from '../../write-surface/index.ts'

const setRootCommand = defineCommand({
    meta: {
        name: 'set-root',
        description:
            'Persist a brain tree root engram ULID (returned by ' +
            'muninn_remember_tree) to .luca/config.json#muninn.brainRoots ' +
            'for the current vault. Local write — run once per brain tree at ' +
            'creation (project-new / seed-memory) so readers resolve the ' +
            'root by ULID. Phase-agnostic.',
    },
    args: {
        concept: {
            type: 'string',
            required: true,
            description:
                'The brain tree root concept (e.g. ' +
                '"brain:project-identity", "brain:project-requirements").',
        },
        id: {
            type: 'string',
            required: true,
            description:
                'The brain tree root engram ULID (the root_id returned by ' +
                'muninn_remember_tree).',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('brain set-root', cmd, rawArgs)
        await runWriteHandler('brain set-root', lucaBrainSetRootTool, {
            concept: args.concept,
            id: args.id,
        })
    },
})

const recallRootCommand = defineCommand({
    meta: {
        name: 'recall-root',
        description:
            'Emit a muninn_recall_tree procedure for a brain tree, resolved ' +
            'by its cached root ULID (replaces the broken ' +
            'recall_tree(id="brain:project-identity")). Uninitialized → a ' +
            'plain notice. Phase-agnostic.',
    },
    args: {
        concept: {
            type: 'string',
            required: true,
            description:
                'The brain tree root concept to recall (e.g. ' +
                '"brain:project-identity").',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('brain recall-root', cmd, rawArgs)
        await runWriteHandler('brain recall-root', lucaBrainRecallRootTool, {
            concept: args.concept,
        })
    },
})

export const brainCommand = defineCommand({
    meta: {
        name: 'brain',
        description:
            'Resolve MuninnDB brain trees (project identity) by cached root ULID',
    },
    subCommands: {
        'set-root': setRootCommand,
        'recall-root': recallRootCommand,
    },
})
