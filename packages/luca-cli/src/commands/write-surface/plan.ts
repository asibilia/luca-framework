/**
 * CLI command group: `luca plan`
 *
 * Advisory tooling over phase plan files. Phase-agnostic — the explicit
 * `'plan lint': []` entry in `WRITE_COMMAND_PHASES` (luca-core
 * step-artifacts) declares it runnable in any pipelineStep.
 *
 * Leaves:
 *   - `plan lint` — warn-only advisory linter for a plan.md. Emits one
 *     warning per finding plus a summary, and exits 0 on lint findings:
 *     warnings never block progression (only operational errors, e.g. an
 *     unreadable file, exit 1). The four regex checks (missing ac-NN /
 *     anti-NN IDs, compound criteria, absolute quantifiers without .M
 *     sub-criteria, missing anti-criteria) are keyed to the pinned
 *     architect criterion grammar; judgment checks (probe nameability,
 *     can-A-pass-while-B-fails) stay instruction-side in the architect /
 *     plan-reviewer prompts.
 */
import { defineCommand } from 'citty'

import { lucaPlanLintTool } from '../../write-surface/index.ts'
import {
    rejectUnknownFlags,
    runWriteHandler,
} from './__helpers/run-handler.ts'

const lintCommand = defineCommand({
    meta: {
        name: 'lint',
        description:
            'Warn-only advisory lint of a plan.md against the pinned ' +
            'criterion grammar (ac-NN / anti-NN IDs, compound criteria, ' +
            'absolute quantifiers, missing anti-criteria). Exits 0 on ' +
            'lint findings — they are warnings, never blockers (only ' +
            'operational errors like an unreadable file exit 1). ' +
            'Phase-agnostic.',
    },
    args: {
        file: {
            type: 'string',
            required: true,
            description:
                'Path to the plan.md to lint (e.g. ' +
                '.luca/phases/<NN-slug>/plan.md).',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('plan lint', cmd, rawArgs)
        await runWriteHandler('plan lint', lucaPlanLintTool, {
            file: args.file,
        })
    },
})

export const planCommand = defineCommand({
    meta: {
        name: 'plan',
        description: 'Advisory tooling over Luca phase plans',
    },
    subCommands: {
        lint: lintCommand,
    },
})
