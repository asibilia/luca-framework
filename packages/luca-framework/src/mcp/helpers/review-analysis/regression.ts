/**
 * Iteration-N regression check — detect when fix commits in a review
 * iteration introduce *new* findings on the paths they touched.
 *
 * Inputs: pre-iteration findings, post-iteration findings, list of paths
 * modified by fix commits in this iteration. Outputs: which findings are
 * regressions (new on a touched path, or severity-escalated), which are
 * resolved, which are unchanged, which are new on untouched paths.
 *
 * `checkRegression` is pure; `diffPaths` shells out to git (with a
 * timeout). Ported from luca-mastracode/src/review-analysis.
 */
import { spawnSync } from 'node:child_process'

import type { ReviewFinding } from './convergence.ts'

export interface RegressionInputs {
    /** Findings present BEFORE the fix iteration commits landed. */
    before: ReviewFinding[]
    /** Findings present AFTER the fix iteration commits landed. */
    after: ReviewFinding[]
    /** Repo-relative paths modified by fix commits in this iteration. */
    touchedPaths: string[]
}

export interface RegressionFinding {
    finding: ReviewFinding
    /**
     * Why this is a regression:
     *  - 'new-on-touched-path': new finding on a path the iteration modified
     *  - 'severity-escalated': same identity as a prior finding, higher severity
     */
    reason: 'new-on-touched-path' | 'severity-escalated'
    evidence: string
}

export interface RegressionReport {
    /** Findings introduced by the fix iteration (true regressions). */
    regressions: RegressionFinding[]
    /** Findings that existed in `before` but are gone in `after`. */
    resolved: ReviewFinding[]
    /** Findings present in both sets, unchanged. */
    unchanged: ReviewFinding[]
    /** New in `after` on untouched paths — likely external, not a regression. */
    newButUntouched: ReviewFinding[]
}

export interface RegressionOptions {
    /** Severity ranking, lowest to highest. Used to detect escalation. */
    severityRank?: string[]
}

const DEFAULT_SEVERITY_RANK: ReadonlyArray<string> = [
    'praise',
    'nit',
    'info',
    'optional',
    'style',
    'improvement',
    'should-fix',
    'should',
    'must-fix',
    'must',
    'high',
    'critical',
]

/**
 * Stable identity for cross-snapshot matching. Comment ids can't be used
 * — re-fetched findings may carry fresh ids. Identity is
 * `(perspective, path, anchor-line, summary-prefix)`.
 */
export function findingIdentity(f: ReviewFinding): string {
    const summaryPrefix = (f.summary ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)
    const anchor = f.line == null ? '?' : String(f.line)
    return [f.perspective, f.path ?? '<no-path>', anchor, summaryPrefix].join(
        '::',
    )
}

function severityIndex(
    severity: string,
    ranking: ReadonlyArray<string>,
): number {
    const idx = ranking.indexOf(severity.toLowerCase())
    return idx === -1 ? 0 : idx
}

function pathIsTouched(
    findingPath: string | undefined,
    touched: ReadonlySet<string>,
): boolean {
    if (!findingPath) return false
    return touched.has(findingPath)
}

/**
 * Compute the regression delta between two finding snapshots.
 */
export function checkRegression(
    inputs: RegressionInputs,
    opts: RegressionOptions = {},
): RegressionReport {
    const ranking = opts.severityRank ?? DEFAULT_SEVERITY_RANK
    const touched = new Set(inputs.touchedPaths)

    const beforeIndex = new Map<string, ReviewFinding>()
    for (const f of inputs.before) {
        const key = findingIdentity(f)
        const existing = beforeIndex.get(key)
        if (
            !existing ||
            severityIndex(f.severity, ranking) >
                severityIndex(existing.severity, ranking)
        ) {
            beforeIndex.set(key, f)
        }
    }

    const afterIndex = new Map<string, ReviewFinding>()
    for (const f of inputs.after) {
        const key = findingIdentity(f)
        const existing = afterIndex.get(key)
        if (
            !existing ||
            severityIndex(f.severity, ranking) >
                severityIndex(existing.severity, ranking)
        ) {
            afterIndex.set(key, f)
        }
    }

    const regressions: RegressionFinding[] = []
    const unchanged: ReviewFinding[] = []
    const newButUntouched: ReviewFinding[] = []
    const resolved: ReviewFinding[] = []

    for (const [key, f] of beforeIndex) {
        if (!afterIndex.has(key)) {
            resolved.push(f)
        }
    }

    for (const [key, f] of afterIndex) {
        const prev = beforeIndex.get(key)
        if (!prev) {
            if (pathIsTouched(f.path, touched)) {
                regressions.push({
                    finding: f,
                    reason: 'new-on-touched-path',
                    evidence: `New finding from '${f.perspective}' at ${f.path ?? '<no-path>'}:${f.line ?? '?'} on a path modified by this iteration.`,
                })
            } else {
                newButUntouched.push(f)
            }
            continue
        }
        const prevSev = severityIndex(prev.severity, ranking)
        const curSev = severityIndex(f.severity, ranking)
        if (curSev > prevSev) {
            regressions.push({
                finding: f,
                reason: 'severity-escalated',
                evidence: `Severity escalated from '${prev.severity}' to '${f.severity}' on the same finding.`,
            })
        } else {
            unchanged.push(f)
        }
    }

    return { regressions, resolved, unchanged, newButUntouched }
}

/**
 * Compute the list of paths modified between two git refs. Returned
 * paths are repo-relative. Returns an empty array on any git error.
 */
export function diffPaths(
    repoRoot: string,
    fromSha: string,
    toSha: string,
): string[] {
    const r = spawnSync('git', ['diff', '--name-only', `${fromSha}..${toSha}`], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 5000,
    })
    if (r.status !== 0) return []
    return (r.stdout ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
}
