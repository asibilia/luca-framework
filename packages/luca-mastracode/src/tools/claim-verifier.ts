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
import { basename, isAbsolute, join, resolve, sep } from 'node:path'

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
 *   1. Absolute inputs: normalised via `resolve()` and containment-checked
 *      against repoRoot. Out-of-repo absolutes (incl. those that normalise
 *      out, e.g. `${repoRoot}/../x`) are redirected to a guaranteed-missing
 *      sentinel path so `verifyFile()` surfaces ENOENT instead of reading
 *      arbitrary host files.
 *   2. Relative inputs with path separators or `..` segments: resolved
 *      against repoRoot via `resolve()` and containment-checked. The guard
 *      runs BEFORE existsSync so normalised traversal escapes are caught
 *      even when the target exists on disk. Out-of-repo escapes redirect
 *      to the sentinel path. Phase/planning fallbacks are skipped.
 *   3. Safe bare filenames (no separators, not `..`): tried at repoRoot,
 *      then phase dir, then `.planning/` root, then repoRoot as last resort.
 *
 * Security properties:
 *   - No file outside repoRoot is returned for any input (post-normalisation).
 *   - Traversal-normalised escapes cannot bypass via existsSync (guard first).
 *   - Phase/planning fallbacks only reachable by bare, safe filenames.
 *   (#220 security review — extended in #222 to use `resolve()` so raw-prefix
 *   bypasses like `${repoRoot}/../secrets.txt` are caught.)
 */
function resolveArtifactPath(repoRoot: string, p: string): string {
    // Normalised repoRoot prefix used for all containment checks below.
    // `resolve()` collapses any `..` segments before comparison so inputs like
    // `${repoRoot}/../secrets.txt` (PR #222 review) cannot bypass via raw
    // prefix-equality.
    const normRoot = resolve(repoRoot)
    const normRootWithSep = normRoot.endsWith(sep) ? normRoot : normRoot + sep
    // Sentinel directory that does not exist on disk. Returning a path under
    // it guarantees `verifyFile()` surfaces ENOENT/artifact-unreadable rather
    // than reading an out-of-repo file. We sanitise the basename so traversal
    // tokens like `..` don't collapse the join back into the parent dir
    // (PR #222 review hardening).
    const outOfRepoSentinel = (orig: string): string => {
        const b = basename(orig)
        const safe = b && b !== '.' && b !== '..' ? b : 'x'
        return join(repoRoot, '.claim-verifier-out-of-repo', safe)
    }

    // 1. Absolute paths: constrain to repo boundary AFTER normalisation.
    //    Out-of-repo absolutes (incl. `${repoRoot}/../x`) → sentinel path.
    if (isAbsolute(p)) {
        const resolved = resolve(p)
        if (!resolved.startsWith(normRootWithSep) && resolved !== normRoot) {
            return outOfRepoSentinel(p)
        }
        // Within-repo absolute — return the normalised form.
        return resolved
    }

    // 2. Traversal guard (runs BEFORE existsSync to catch normalised escapes).
    //    A relative path is unsafe if it contains any separator or equals '..'.
    if (p.includes('/') || p.includes('\\') || p === '..') {
        // Resolve relative to repoRoot then containment-check the normalised
        // result. `resolve()` collapses `../` sequences so escapes are caught
        // even when the target exists on disk.
        const resolved = resolve(repoRoot, p)
        if (!resolved.startsWith(normRootWithSep) && resolved !== normRoot) {
            // Out-of-repo escape → sentinel path (ENOENT) instead of raw
            // traversal string, which `readFileSync` would otherwise resolve
            // against `process.cwd()` and read outside the workspace
            // (PR #222 review).
            return outOfRepoSentinel(p)
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
