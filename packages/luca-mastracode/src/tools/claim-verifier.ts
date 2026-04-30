/**
 * claim-verifier (tool) — Mastra tool wrapper for the claim verifier.
 *
 * Three actions:
 *   - verify-text: verify claims in an inline text string (e.g. PR body draft).
 *   - verify-file: verify claims in a file on disk (e.g. .changeset/<slug>.md).
 *   - gate: verify across multiple paths/texts; returns CLAIM_VERIFICATION_FAILED
 *           if any input has unverifiable claims. Used by finalize before PR creation.
 *
 * Every call appends a `claim-verifier-run` ledger event with totals so
 * the postmortem analyzer can observe verifier activity over time.
 */
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
    verifyFile,
    verifyTextArtifact,
    type ClaimVerificationReport,
} from '../claim-verifier.js'
import { appendLedger } from '../session-ledger.js'

const PLANNING_DIR = '.planning'

/**
 * Resolve an artifact path. Tries:
 *   1. The path as-is (absolute or repo-relative).
 *   2. The path under .planning/ as a fallback.
 */
function resolveArtifactPath(repoRoot: string, p: string): string {
    if (isAbsolute(p)) return p
    const direct = join(repoRoot, p)
    if (existsSync(direct)) return direct
    const planning = join(repoRoot, PLANNING_DIR, p)
    if (existsSync(planning)) return planning
    return direct
}

interface SourcedReport {
    source: string
    report: ClaimVerificationReport
}

export const claimVerifierTool = createTool({
    id: 'claim-verifier',
    description:
        'Verify factual claims (symbols, file paths, quantitative counts) in narrative artifacts ' +
        '(changesets, PR bodies, PLAN.md, REVIEW-*.md) against the working tree. ' +
        "Use 'verify-text' for inline strings, 'verify-file' for on-disk artifacts, " +
        "and 'gate' as a pre-PR finalize check that blocks on any unverifiable claim. " +
        'Catches doc-claim drift before it ships.',
    inputSchema: z.object({
        action: z
            .enum(['verify-text', 'verify-file', 'gate'])
            .describe(
                'verify-text: verify an inline string | verify-file: verify a file path | gate: verify multiple inputs and block on failures'
            ),
        text: z
            .string()
            .optional()
            .describe('Inline text to verify (verify-text only).'),
        path: z
            .string()
            .optional()
            .describe(
                'Path to verify (verify-file only). Resolved relative to repo root, then .planning/.'
            ),
        paths: z
            .array(z.string())
            .optional()
            .describe(
                'Multiple file paths to verify (gate action). Each is resolved like verify-file.'
            ),
        texts: z
            .array(z.string())
            .optional()
            .describe(
                'Multiple inline texts to verify (gate action). Tagged "text-0", "text-1", ...'
            ),
    }),
    execute: async (inputData) => {
        const { action, text, path, paths, texts } = inputData
        const repoRoot = process.cwd()

        switch (action) {
            case 'verify-text': {
                if (!text) {
                    return {
                        success: false,
                        message: 'verify-text requires `text`',
                    }
                }
                const report = verifyTextArtifact(text, { repoRoot })
                appendLedger('claim-verifier-run', {
                    action,
                    totalClaims: report.totalClaims,
                    failureCount: report.failures.length,
                    paths: [],
                })
                return {
                    success: report.passed,
                    message: report.passed
                        ? `Verified ${report.totalClaims} claim(s), all passed.`
                        : `Verified ${report.totalClaims} claim(s), ${report.failures.length} failure(s).`,
                    report,
                    pitfalls: [],
                }
            }
            case 'verify-file': {
                if (!path) {
                    return {
                        success: false,
                        message: 'verify-file requires `path`',
                    }
                }
                const resolved = resolveArtifactPath(repoRoot, path)
                const report = verifyFile(resolved, { repoRoot })
                appendLedger('claim-verifier-run', {
                    action,
                    totalClaims: report.totalClaims,
                    failureCount: report.failures.length,
                    paths: [path],
                })
                return {
                    success: report.passed,
                    message: report.passed
                        ? `Verified ${report.totalClaims} claim(s) in ${path}, all passed.`
                        : `Verified ${report.totalClaims} claim(s) in ${path}, ${report.failures.length} failure(s).`,
                    report,
                    pitfalls: [],
                }
            }
            case 'gate': {
                const reports: SourcedReport[] = []
                const ledgerPaths: string[] = []
                let totalClaims = 0
                let totalFailures = 0

                for (const p of paths ?? []) {
                    const resolved = resolveArtifactPath(repoRoot, p)
                    const report = verifyFile(resolved, { repoRoot })
                    reports.push({ source: p, report })
                    ledgerPaths.push(p)
                    totalClaims += report.totalClaims
                    totalFailures += report.failures.length
                }

                for (let i = 0; i < (texts ?? []).length; i++) {
                    const t = (texts ?? [])[i] ?? ''
                    const tag = `text-${i}`
                    const report = verifyTextArtifact(t, { repoRoot })
                    reports.push({ source: tag, report })
                    totalClaims += report.totalClaims
                    totalFailures += report.failures.length
                }

                appendLedger('claim-verifier-run', {
                    action,
                    totalClaims,
                    failureCount: totalFailures,
                    paths: ledgerPaths,
                })

                if (totalFailures > 0) {
                    return {
                        success: false,
                        code: 'CLAIM_VERIFICATION_FAILED',
                        message: `Claim verifier gate failed: ${totalFailures} failure(s) across ${reports.length} input(s). Fix the draft (or the code) until claims match the working tree.`,
                        reports,
                        pitfalls: [],
                    }
                }

                return {
                    success: true,
                    message: `Claim verifier gate passed: ${totalClaims} claim(s) verified across ${reports.length} input(s).`,
                    reports,
                    pitfalls: [],
                }
            }
            default:
                return {
                    success: false,
                    message: `Unknown action: ${String(action)}`,
                }
        }
    },
})
