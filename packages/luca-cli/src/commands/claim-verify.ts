/**
 * CLI command: `luca claim-verify <file>`
 *
 * Deterministically checks that a text artifact (changeset, PR body, plan
 * task entry) cites symbols, file paths, and counts that actually exist in
 * the working tree. Closes §3 functional gap #7 of the migration-recovery
 * plan — the claim verifier had no v13 CLI surface.
 *
 * Exit code: 0 when every claim verifies, 1 when any claim fails.
 * Forbidden-language findings are ADVISORY ONLY — they are printed as
 * warnings and never influence the exit code or gate verdict.
 */
import { verifyFile } from '@alecsibilia/luca-core'
import { defineCommand } from 'citty'
import { resolve } from 'pathe'

import { logger } from '../utils/logger.ts'
import { sanitizeControlChars } from '../write-surface/helpers/sanitize-control-chars.ts'

export const claimVerifyCommand = defineCommand({
    meta: {
        name: 'claim-verify',
        description:
            'Verify that a text artifact cites symbols, file paths and ' +
            'counts that exist in the working tree.',
    },
    args: {
        file: {
            type: 'positional',
            required: true,
            description:
                'Path to the text artifact to verify (changeset, PR body, plan).',
        },
        'repo-root': {
            type: 'string',
            description:
                'Repo root that claims are resolved against (default: cwd).',
        },
    },
    run({ args }) {
        const repoRoot = args['repo-root']
            ? resolve(args['repo-root'])
            : process.cwd()
        const report = verifyFile(resolve(args.file), { repoRoot })

        const b = report.extractedBreakdown
        logger.info(
            `Verified ${report.totalClaims} claim(s): ${b.symbols} symbol, ` +
                `${b.filePaths} path, ${b.quantitative} quantitative.`
        )
        if (report.timedOut) {
            logger.warn(
                'Time budget exhausted — some claims were not verified.'
            )
        }

        for (const failure of report.failures) {
            const loc =
                failure.claim.sourceLine > 0
                    ? ` (line ${failure.claim.sourceLine})`
                    : ''
            logger.error(
                `${failure.reason}: ${sanitizeControlChars(failure.claim.text)}${loc}\n  ${sanitizeControlChars(failure.evidence)}`
            )
        }

        // Advisory only — these warnings NEVER affect process.exitCode.
        for (const warning of report.forbiddenLanguage) {
            logger.warn(
                `forbidden-language: "${warning.phrase}" (line ${warning.sourceLine}) ` +
                    `has no nearby probe evidence\n  ${sanitizeControlChars(warning.sourceContext)}`
            )
        }

        if (report.passed) {
            logger.success('All claims verified.')
            process.exitCode = 0
        } else {
            logger.error(
                `${report.failures.length} claim(s) failed verification.`
            )
            process.exitCode = 1
        }
    },
})
