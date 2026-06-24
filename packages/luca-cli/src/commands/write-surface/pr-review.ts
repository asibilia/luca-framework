/**
 * CLI command group: `luca pr-review`
 *
 * Read-only PR-review analysis used by the gh-pr-address workflow. These
 * commands inspect comments/findings against the working tree and git
 * history — they never mutate `.luca/`. Part of the v13 `luca` write
 * surface (Phase B). Phase-agnostic (pure reads).
 *
 * Each command takes a structured array payload too large for a flag, so
 * the payload is supplied via `--file` (a JSON file).
 *
 * Leaves:
 *   - `pr-review filter-stale`        — drop comments on rewritten code
 *   - `pr-review detect-convergence`  — promote cross-perspective clusters
 *   - `pr-review regression-check`    — flag findings introduced by a fix
 */
import { defineCommand } from 'citty'

import {
    readJsonPayload,
    rejectUnknownFlags,
    runWriteHandler,
} from './__helpers/run-handler.ts'

import {
    lucaPrReviewDetectConvergenceTool,
    lucaPrReviewFilterStaleTool,
    lucaPrReviewRegressionCheckTool,
} from '../../write-surface/index.ts'

const filterStaleCommand = defineCommand({
    meta: {
        name: 'filter-stale',
        description:
            'Classify PR review comments against the current working ' +
            'tree and drop those whose cited code has been rewritten. ' +
            'Pure read; phase-agnostic.',
    },
    args: {
        file: {
            type: 'string',
            required: true,
            description:
                'Path to a JSON file containing the comments array ' +
                '(gh api pulls/<n>/comments shape).',
        },
        'head-sha': {
            type: 'string',
            description:
                'Override HEAD SHA used for stale detection. Defaults to ' +
                'current git HEAD.',
        },
        'max-drift-lines': {
            type: 'string',
            description:
                'Max line drift before a relocated anchor is treated as ' +
                'stale (default 5).',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('pr-review filter-stale', cmd, rawArgs)
        const comments = await readJsonPayload(
            'pr-review filter-stale',
            args.file
        )
        await runWriteHandler(
            'pr-review filter-stale',
            lucaPrReviewFilterStaleTool,
            {
                comments,
                head_sha: args['head-sha'],
                max_drift_lines:
                    args['max-drift-lines'] !== undefined
                        ? Number(args['max-drift-lines'])
                        : undefined,
            }
        )
    },
})

const detectConvergenceCommand = defineCommand({
    meta: {
        name: 'detect-convergence',
        description:
            'Detect cross-perspective convergence: when 2+ independent ' +
            'reviewer perspectives flag the same location, promote weaker ' +
            'findings in that cluster to must-fix. Pure read; phase-agnostic.',
    },
    args: {
        file: {
            type: 'string',
            required: true,
            description:
                'Path to a JSON file containing the combined findings ' +
                'array across every reviewer perspective.',
        },
        'line-tolerance': {
            type: 'string',
            description:
                'Lines within +/- this distance count as the same ' +
                'location (default 2).',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('pr-review detect-convergence', cmd, rawArgs)
        const findings = await readJsonPayload(
            'pr-review detect-convergence',
            args.file
        )
        await runWriteHandler(
            'pr-review detect-convergence',
            lucaPrReviewDetectConvergenceTool,
            {
                findings,
                line_tolerance:
                    args['line-tolerance'] !== undefined
                        ? Number(args['line-tolerance'])
                        : undefined,
            }
        )
    },
})

const regressionCheckCommand = defineCommand({
    meta: {
        name: 'regression-check',
        description:
            'Detect findings introduced by a fix iteration. Compares ' +
            'before/after finding snapshots and flags anything new on a ' +
            'touched path, or any severity escalation. Pure read; ' +
            'phase-agnostic. Exits 1 when regressions are present.',
    },
    args: {
        file: {
            type: 'string',
            required: true,
            description:
                'Path to a JSON file with the full payload: ' +
                '{ before: Finding[], after: Finding[], ' +
                'touched_paths?: string[], from_sha?: string, ' +
                'to_sha?: string }.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('pr-review regression-check', cmd, rawArgs)
        const payload = await readJsonPayload(
            'pr-review regression-check',
            args.file
        )
        await runWriteHandler(
            'pr-review regression-check',
            lucaPrReviewRegressionCheckTool,
            payload
        )
    },
})

export const prReviewCommand = defineCommand({
    meta: {
        name: 'pr-review',
        description: 'Read-only PR-review analysis for the gh-pr-address flow',
    },
    subCommands: {
        'filter-stale': filterStaleCommand,
        'detect-convergence': detectConvergenceCommand,
        'regression-check': regressionCheckCommand,
    },
})
