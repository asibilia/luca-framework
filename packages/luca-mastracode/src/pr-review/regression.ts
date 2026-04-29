/**
 * Iteration-N regression check — detect when fix commits in a review
 * iteration introduce *new* findings on the paths they touched.
 *
 * Background: across the PR-review corpus, a non-trivial fraction of
 * "fix" commits introduce new issues that weren't flagged in the original
 * review. The harness currently doesn't re-check after each iteration —
 * fixes are pushed, replies are posted, the iteration is closed. New
 * findings only surface in the *next* review pass, costing another full
 * iteration cycle.
 *
 * This module is the deterministic delta layer:
 *   - Inputs: pre-iteration findings, post-iteration findings, list of
 *     paths modified by fix commits in this iteration.
 *   - Outputs: which findings are regressions (new in post-set on a
 *     touched path), which are resolved (gone from post-set), which are
 *     unchanged (present in both).
 *
 * The "actually re-run the reviewer" part is the orchestration layer's
 * job — pr-address.md tells the harness to snapshot, commit, re-fetch,
 * then call this regression check on the delta.
 *
 * Pure data layer. Tool wrapper lives in tools/pr-review.ts.
 */
import { spawnSync } from 'node:child_process'

import type { ReviewFinding } from './convergence.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegressionInputs {
    /** Findings present BEFORE the fix iteration commits landed. */
    before: ReviewFinding[]
    /** Findings present AFTER the fix iteration commits landed. */
    after: ReviewFinding[]
    /** Repo-relative paths that were modified by fix commits in this iteration. */
    touchedPaths: string[]
}

export interface RegressionFinding {
    finding: ReviewFinding
    /**
     * Why we believe this is a regression:
     *   - 'new-on-touched-path': a finding on a path the iteration modified that wasn't in the pre-iteration set
     *   - 'severity-escalated': a finding with the same identity as one before, but at higher severity
     */
    reason: 'new-on-touched-path' | 'severity-escalated'
    evidence: string
}

export interface RegressionReport {
    /** Findings introduced by the fix iteration (true regressions). */
    regressions: RegressionFinding[]
    /** Findings that existed in `before` but are no longer in `after` — the iteration's wins. */
    resolved: ReviewFinding[]
    /** Findings present in both sets, unchanged. */
    unchanged: ReviewFinding[]
    /** Findings new in `after` but on paths the iteration did not touch — likely external (e.g. new CI rule), not a regression. */
    newButUntouched: ReviewFinding[]
}

export interface RegressionOptions {
    /**
     * Severity ranking, lowest to highest. Used to detect escalation.
     * Default: ['nit','info','optional','should-fix','must-fix','critical']
     */
    severityRank?: string[]
    /** Treat a path as touched if it appears in any of these lists. */
    touchedPathsAlias?: { [logical: string]: string[] }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Stable identity for cross-snapshot matching. We can't use comment id
 * because re-fetched findings may have different ids if the perspective
 * regenerates them. Instead, identity is `(perspective, path, anchor-line, summary-prefix)`.
 */
export function findingIdentity(f: ReviewFinding): string {
    const summaryPrefix = (f.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const anchor = f.line == null ? '?' : String(f.line)
    return [f.perspective, f.path ?? '<no-path>', anchor, summaryPrefix].join('::')
}

function severityIndex(severity: string, ranking: ReadonlyArray<string>): number {
    const idx = ranking.indexOf(severity.toLowerCase())
    return idx === -1 ? 0 : idx
}

function pathIsTouched(
    findingPath: string | undefined,
    touched: ReadonlySet<string>
): boolean {
    if (!findingPath) return false
    return touched.has(findingPath)
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export function checkRegression(
    inputs: RegressionInputs,
    opts: RegressionOptions = {}
): RegressionReport {
    const ranking = opts.severityRank ?? DEFAULT_SEVERITY_RANK
    const touched = new Set(inputs.touchedPaths)

    // Index `before` by identity. If multiple findings share an identity we
    // keep the highest-severity one (worst case for the agent).
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

    // Findings in `before` no longer in `after` → resolved.
    for (const [key, f] of beforeIndex) {
        if (!afterIndex.has(key)) {
            resolved.push(f)
        }
    }

    // Findings in `after`:
    //   - if not in `before` AND on touched path → regression (new-on-touched-path).
    //   - if not in `before` AND on untouched path → newButUntouched.
    //   - if in `before` with lower severity → regression (severity-escalated).
    //   - if in `before` with same/lower severity → unchanged.
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

// ---------------------------------------------------------------------------
// Touched-path extraction helpers
// ---------------------------------------------------------------------------

/**
 * Compute the list of paths modified between two git refs. Returned paths
 * are repo-relative. Returns an empty array on any git error (caller can
 * decide whether to treat that as "nothing touched" or fall back to a
 * different strategy).
 *
 * Implementation note: callers usually pass `before = baseBranch` and
 * `after = HEAD`, but this is left to the caller because the right pair
 * depends on the iteration boundary (e.g. the SHA at iteration-start vs.
 * the latest fix-commit SHA).
 */
export function diffPaths(
    repoRoot: string,
    fromSha: string,
    toSha: string
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
