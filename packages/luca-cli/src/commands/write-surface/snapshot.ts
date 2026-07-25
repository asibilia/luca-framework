/**
 * CLI command group: `luca snapshot`
 *
 * Review-gate worktree snapshots. Part of the v13 `luca` write surface.
 *
 * Leaves:
 *   - `snapshot create` — capture a worktree snapshot tree and write the
 *     consume-once payload `.luca/tmp/review-prefix-tree.json`
 *   - `snapshot diff` — consume the payload, diff prior vs current
 *     worktree trees, and intersect changed paths with prior audit cites
 */
import { defineCommand } from 'citty'

import { rejectUnknownFlags, runWriteHandler } from './__helpers/run-handler.ts'

import {
    lucaSnapshotCreateTool,
    lucaSnapshotDiffTool,
} from '../../write-surface/index.ts'

const createCommand = defineCommand({
    meta: {
        name: 'create',
        description:
            'Capture a worktree snapshot tree (temp-index mechanism — ' +
            'real index and worktree untouched) and write the ' +
            'consume-once payload {"tree","phase"} to ' +
            '.luca/tmp/review-prefix-tree.json for the review diff-gate. ' +
            'Phase-agnostic.',
    },
    args: {},
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('snapshot create', cmd, rawArgs)
        await runWriteHandler('snapshot create', lucaSnapshotCreateTool, {})
    },
})

const diffCommand = defineCommand({
    meta: {
        name: 'diff',
        description:
            'Consume the review-gate snapshot payload (deleted on every ' +
            'path), diff the prior snapshot tree against the current ' +
            'worktree tree, intersect changed paths with prior ' +
            'MUST-FIX/SHOULD-FIX audit cites, and print ' +
            '{"verdict","changed_paths","cite_paths","reason"} where ' +
            'verdict is empty | zero-overlap | overlap | ambiguous ' +
            '(fail-safe). Phase-agnostic.',
    },
    args: {},
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('snapshot diff', cmd, rawArgs)
        await runWriteHandler('snapshot diff', lucaSnapshotDiffTool, {})
    },
})

export const snapshotCommand = defineCommand({
    meta: {
        name: 'snapshot',
        description:
            'Worktree snapshot capture + diff for the review diff-gate',
    },
    subCommands: {
        create: createCommand,
        diff: diffCommand,
    },
})
