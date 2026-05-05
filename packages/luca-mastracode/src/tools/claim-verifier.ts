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
import { basename, isAbsolute, join, sep } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
    verifyFile,
    verifyTextArtifact,
    type ClaimVerificationReport,
} from '../state/claim-verifier.js'
import { readLucaState } from '../state/luca-store.js'
import { appendLedger } from '../state/session-ledger.js'
import { phaseDir, planningRoot } from '../util/phase-paths.js'

/**
 * Resolve an artifact path. Tries (in order):
 *   1. Absolute inputs: returned as-is only when they remain inside repoRoot;
 *      out-of-repo absolutes are returned unchanged so verifyFile surfaces a
 *      normal ENOENT/access-denied instead of reading arbitrary host files.
 *   2. Relative inputs with path separators or `..` segments: resolved against
 *      repoRoot. The guard runs BEFORE existsSync so normalised traversal
 *      escapes (e.g. `./../etc/passwd` → `/etc/passwd`) are caught even when
 *      the target exists on disk. Phase/planning fallbacks are skipped.
 *   3. Safe bare filenames (no separators, not `..`): tried at repoRoot, then
 *      phase dir, then `.planning/` root, then repoRoot as last resort.
 *
 * Security properties:
 *   - No file outside repoRoot is returned for absolute inputs.
 *   - Traversal-normalised escapes cannot bypass via existsSync (guard first).
 *   - Phase/planning fallbacks only reachable by bare, safe filenames.
 *   (#220 security review — supersedes prior ordering with guard-after-existsSync)
 */
function resolveArtifactPath(repoRoot: string, p: string): string {
    // 1. Absolute paths: constrain to repo boundary.
    //    Out-of-repo absolutes (e.g. /etc/passwd) are rebuffed by returning a
    //    repo-contained placeholder path that does not exist, so verifyFile
    //    surfaces artifact-unreadable rather than reading arbitrary host files.
    if (isAbsolute(p)) {
        const norm = repoRoot.endsWith(sep) ? repoRoot : repoRoot + sep
        if (!p.startsWith(norm) && p !== repoRoot) {
            // Redirect to a guaranteed-nonexistent path so the claim surfaces as
            // unresolvable rather than silently reading an out-of-repo file.
            return join(repoRoot, '.claim-verifier-out-of-repo', basename(p))
        }
        // Within-repo absolute — pass through normally.
        return p
    }

    // 2. Traversal guard (runs BEFORE existsSync to catch normalised escapes).
    //    A relative path is unsafe if it contains any separator or equals '..'.
    //    With no separators, split yields [p], so `some(s => s === '..')` ≡ `p === '..'`.
    if (p.includes('/') || p.includes('\\') || p === '..') {
        // Compute the normalised join first, then containment-check it.
        // `join` resolves `../` sequences: './../etc/passwd' → '/etc/passwd'.
        // If the result escapes repoRoot, return the raw (unnormalised) string so
        // verifyFile surfaces ENOENT rather than reading an out-of-repo file.
        const norm = repoRoot.endsWith(sep) ? repoRoot : repoRoot + sep
        const resolved = join(repoRoot, p)
        if (!resolved.startsWith(norm) && resolved !== repoRoot) {
            return p // raw string: will not resolve to any real file path
        }
        return resolved
    }

    // 3. Safe bare filename: try repo-root → phase dir → .planning/ root.
    const direct = join(repoRoot, p)
    if (existsSync(direct)) return direct

    const slug = readLucaState().currentPhaseSlug
    if (slug) {
        const phaseScoped = join(phaseDir(slug), p)
        if (existsSync(phaseScoped)) return phaseScoped
    }
    const planning = join(planningRoot(), p)
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
                'Path to verify (verify-file only). Resolved relative to repo root, then the active phase dir (.planning/phases/<slug>/), then .planning/.'
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
