/**
 * pr-review (tool) — Mastra tool wrapper for PR-review hardening primitives.
 *
 * Three actions:
 *   - filter-stale: drop comments whose cited code has been changed since
 *     the comment was filed. Used by gh-pr-address before categorization to
 *     stop the iteration loop from spending cycles on already-fixed issues.
 *   - detect-convergence: group findings by location across reviewer
 *     perspectives; auto-promote severity when >=2 perspectives flag the
 *     same line (catches the case where Copilot + reviewer + claim-verifier
 *     each flag the same code as "should-fix" but together it should be must-fix).
 *   - regression-check: given pre/post fix-iteration finding snapshots and
 *     the list of paths the iteration touched, surface findings introduced
 *     by the iteration itself (new-on-touched-path or severity-escalated).
 *
 * Every call appends a `pr-review-run` ledger event so the postmortem
 * analyzer can observe verifier activity over time.
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { appendLedger } from '../state/session-ledger.js'
import {
    filterStaleComments,
    type PrReviewComment,
} from '../review-analysis/stale-filter.js'
import {
    detectConvergence,
    type ReviewFinding,
} from '../review-analysis/convergence.js'
import {
    checkRegression,
    diffPaths,
} from '../review-analysis/regression.js'

const reviewCommentSchema = z.object({
    id: z.number(),
    path: z.string(),
    line: z.number().nullable(),
    original_line: z.number().nullable(),
    commit_id: z.string(),
    original_commit_id: z.string(),
    diff_hunk: z.string(),
    body: z.string(),
    in_reply_to_id: z.number().nullable().optional(),
    user: z
        .object({
            login: z.string().optional(),
            type: z.string().optional(),
        })
        .optional(),
})

const reviewFindingSchema = z.object({
    id: z.string(),
    perspective: z.string(),
    path: z.string().optional(),
    line: z.number().optional(),
    severity: z.string(),
    category: z.string().optional(),
    summary: z.string(),
})

export const prReviewTool = createTool({
    id: 'pr-review',
    description:
        'Harden the PR-address loop: filter stale Copilot comments whose cited code has been rewritten, ' +
        'detect cross-perspective convergence (auto-promote severity when 2+ reviewers flag the same line), ' +
        'and run iteration-N regression checks (catch findings introduced by fix commits). ' +
        "Use 'filter-stale' before categorization, 'detect-convergence' on combined findings, " +
        "and 'regression-check' after each fix iteration.",
    inputSchema: z.object({
        action: z
            .enum(['filter-stale', 'detect-convergence', 'regression-check'])
            .describe(
                'filter-stale: drop comments whose cited code changed | detect-convergence: group findings, promote severity | regression-check: detect new findings introduced by fix iteration'
            ),
        // filter-stale
        comments: z
            .array(reviewCommentSchema)
            .optional()
            .describe('PR review comments (filter-stale only).'),
        headSha: z
            .string()
            .optional()
            .describe(
                'Override HEAD SHA for stale-filter and regression diffs. Defaults to current git HEAD.'
            ),
        maxDriftLines: z
            .number()
            .optional()
            .describe(
                'Stale-filter: max line drift before treating relocated anchor as stale (default 5).'
            ),
        // detect-convergence
        findings: z
            .array(reviewFindingSchema)
            .optional()
            .describe('Combined findings across perspectives (detect-convergence only).'),
        lineTolerance: z
            .number()
            .optional()
            .describe(
                'Detect-convergence: lines within +/- this distance count as the same location (default 2).'
            ),
        // regression-check
        before: z
            .array(reviewFindingSchema)
            .optional()
            .describe('Pre-iteration findings snapshot (regression-check only).'),
        after: z
            .array(reviewFindingSchema)
            .optional()
            .describe('Post-iteration findings snapshot (regression-check only).'),
        touchedPaths: z
            .array(z.string())
            .optional()
            .describe(
                'Paths modified by fix commits in this iteration. If omitted but `fromSha`/`toSha` are provided, paths are computed via git diff.'
            ),
        fromSha: z
            .string()
            .optional()
            .describe('Iteration-start SHA (regression-check, optional alternative to touchedPaths).'),
        toSha: z
            .string()
            .optional()
            .describe('Iteration-end SHA (regression-check, optional alternative to touchedPaths).'),
    }),
    execute: async (inputData) => {
        const repoRoot = process.cwd()
        const action = inputData.action

        switch (action) {
            case 'filter-stale': {
                const comments = inputData.comments
                if (!comments || comments.length === 0) {
                    appendLedger('pr-review-run', {
                        action,
                        inputCount: 0,
                        staleCount: 0,
                    })
                    return {
                        success: true,
                        message: 'No comments provided.',
                        actionable: [],
                        stale: [],
                        replies: [],
                    }
                }
                const result = filterStaleComments(comments as PrReviewComment[], {
                    repoRoot,
                    headSha: inputData.headSha,
                    maxDriftLines: inputData.maxDriftLines,
                })
                appendLedger('pr-review-run', {
                    action,
                    inputCount: comments.length,
                    actionableCount: result.actionable.length,
                    staleCount: result.stale.length,
                    repliesCount: result.replies.length,
                    unknownCount: result.unknown.length,
                })
                return {
                    success: true,
                    message: `Filtered ${comments.length} comment(s): ${result.actionable.length} actionable, ${result.stale.length} stale, ${result.replies.length} replies, ${result.unknown.length} unknown.`,
                    actionable: result.actionable,
                    stale: result.stale,
                    replies: result.replies,
                    unknown: result.unknown,
                    unknownCount: result.unknown.length,
                    verdicts: result.verdicts,
                }
            }

            case 'detect-convergence': {
                const findings = inputData.findings ?? []
                if (findings.length === 0) {
                    appendLedger('pr-review-run', {
                        action,
                        inputCount: 0,
                        convergentCount: 0,
                    })
                    return {
                        success: true,
                        message: 'No findings provided.',
                        report: {
                            groups: [],
                            convergentGroups: [],
                            promotions: [],
                            promotedFindings: [],
                        },
                    }
                }
                const report = detectConvergence(findings as ReviewFinding[], {
                    lineTolerance: inputData.lineTolerance,
                })
                appendLedger('pr-review-run', {
                    action,
                    inputCount: findings.length,
                    convergentCount: report.convergentGroups.length,
                    promotionCount: report.promotions.length,
                })
                return {
                    success: true,
                    message: `Analyzed ${findings.length} finding(s): ${report.convergentGroups.length} convergent group(s), ${report.promotions.length} promotion(s).`,
                    report,
                }
            }

            case 'regression-check': {
                const before = (inputData.before ?? []) as ReviewFinding[]
                const after = (inputData.after ?? []) as ReviewFinding[]
                let touchedPaths = inputData.touchedPaths ?? []
                if (
                    touchedPaths.length === 0 &&
                    inputData.fromSha &&
                    inputData.toSha
                ) {
                    touchedPaths = diffPaths(
                        repoRoot,
                        inputData.fromSha,
                        inputData.toSha
                    )
                }
                const report = checkRegression({ before, after, touchedPaths })
                appendLedger('pr-review-run', {
                    action,
                    beforeCount: before.length,
                    afterCount: after.length,
                    touchedPathCount: touchedPaths.length,
                    regressionCount: report.regressions.length,
                    resolvedCount: report.resolved.length,
                })
                if (report.regressions.length > 0) {
                    return {
                        success: false,
                        code: 'PR_REVIEW_REGRESSION_DETECTED',
                        message: `Regression check found ${report.regressions.length} regression(s) introduced by this iteration. Re-enter execute mode to address before opening additional iterations.`,
                        report,
                        touchedPaths,
                    }
                }
                return {
                    success: true,
                    message: `Regression check passed: ${report.resolved.length} resolved, ${report.unchanged.length} unchanged, ${report.newButUntouched.length} new on untouched paths.`,
                    report,
                    touchedPaths,
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
