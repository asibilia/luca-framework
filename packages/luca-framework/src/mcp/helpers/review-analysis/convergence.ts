/**
 * Cross-perspective convergence — when two or more independent reviewer
 * perspectives flag the same location, that location is materially more
 * likely to be a real issue. Auto-promote severity accordingly.
 *
 * A "perspective" is anything that produces a finding with a path/line:
 *   - GitHub PR review comments (Copilot, humans, CodeRabbit, etc.)
 *   - The project's claim-verifier output
 *   - The Luca reviewer subagents' MUST-FIX/SHOULD-FIX entries
 *   - External CI annotations (lint, typecheck, test failures)
 *
 * Findings are grouped by (path, line ±LINE_TOLERANCE). When >= 2
 * distinct perspectives target the same group, severity is promoted:
 *   - any 'should-fix' or weaker finding in the group → 'must-fix'
 *   - 'must-fix' findings get a convergence marker but no further bump
 *
 * Pure data layer — no I/O. Ported from luca-mastracode/src/review-analysis.
 */

export interface ReviewFinding {
    /** Stable id within a perspective. */
    id: string
    /** Which reviewer / source produced this. */
    perspective: string
    /** Repo-relative path the finding applies to. May be omitted. */
    path?: string
    /** 1-indexed line number the finding applies to. May be omitted. */
    line?: number
    /** Free-form severity (e.g. 'must-fix', 'should-fix', 'nit'). */
    severity: string
    /** Short categorization label (e.g. 'security', 'bug', 'style'). */
    category?: string
    /** Human-readable summary of the finding. */
    summary: string
}

export interface ConvergenceGroup {
    /** Stable group key for idempotent referencing. */
    key: string
    path: string
    /** Anchor line — the median line of all findings in the group. */
    anchorLine: number
    minLine: number
    maxLine: number
    /** Distinct perspectives represented. */
    perspectives: string[]
    findings: ReviewFinding[]
}

export interface ConvergencePromotion {
    findingId: string
    perspective: string
    fromSeverity: string
    toSeverity: string
    reason: string
    groupKey: string
}

export interface ConvergenceReport {
    groups: ConvergenceGroup[]
    /** Subset of groups that have >=2 distinct perspectives. */
    convergentGroups: ConvergenceGroup[]
    promotions: ConvergencePromotion[]
    /** Findings with severity adjusted (originals are not mutated). */
    promotedFindings: ReviewFinding[]
}

export interface DetectOptions {
    /** Lines within +/- this distance count as "same location". Default 2. */
    lineTolerance?: number
    /** Severity levels weaker than 'must-fix' and eligible for promotion. */
    promotableSeverities?: string[]
}

const DEFAULT_LINE_TOLERANCE = 2

const DEFAULT_PROMOTABLE: ReadonlySet<string> = new Set([
    'nit',
    'info',
    'optional',
    'should-fix',
    'should',
    'style',
    'improvement',
    'minor',
    'low',
])

function median(nums: number[]): number {
    if (nums.length === 0) return 0
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    if (sorted.length % 2 === 0) {
        const a = sorted[mid - 1] ?? 0
        const b = sorted[mid] ?? 0
        return Math.floor((a + b) / 2)
    }
    return sorted[mid] ?? 0
}

function distinctPerspectives(findings: ReviewFinding[]): string[] {
    const set = new Set<string>()
    for (const f of findings) set.add(f.perspective)
    return [...set].sort()
}

/**
 * Greedy single-link clustering by line proximity. Findings on the same
 * path whose line numbers fall within `lineTolerance` of any existing
 * group member are merged. Findings without a path or line become
 * singleton groups (they can never converge — convergence needs a
 * location).
 */
function groupFindings(
    findings: ReviewFinding[],
    lineTolerance: number,
): ConvergenceGroup[] {
    const byPath = new Map<string, ReviewFinding[]>()
    const orphaned: ReviewFinding[] = []
    for (const f of findings) {
        if (!f.path || f.line == null) {
            orphaned.push(f)
            continue
        }
        const arr = byPath.get(f.path) ?? []
        arr.push(f)
        byPath.set(f.path, arr)
    }

    const groups: ConvergenceGroup[] = []

    for (const [path, items] of byPath) {
        items.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
        const buckets: ReviewFinding[][] = []
        for (const f of items) {
            const line = f.line ?? 0
            const target = buckets.find((b) => {
                const maxLine = Math.max(...b.map((x) => x.line ?? 0))
                return Math.abs(maxLine - line) <= lineTolerance
            })
            if (target) {
                target.push(f)
            } else {
                buckets.push([f])
            }
        }
        for (const b of buckets) {
            const lines = b.map((x) => x.line ?? 0)
            groups.push({
                key: `${path}:${Math.min(...lines)}-${Math.max(...lines)}`,
                path,
                anchorLine: median(lines),
                minLine: Math.min(...lines),
                maxLine: Math.max(...lines),
                perspectives: distinctPerspectives(b),
                findings: b,
            })
        }
    }

    for (const f of orphaned) {
        groups.push({
            key: `orphan:${f.perspective}:${f.id}`,
            path: f.path ?? '<no-path>',
            anchorLine: f.line ?? 0,
            minLine: f.line ?? 0,
            maxLine: f.line ?? 0,
            perspectives: [f.perspective],
            findings: [f],
        })
    }

    return groups
}

/**
 * Detect cross-perspective convergence and produce severity promotions.
 * Input findings are never mutated — `promotedFindings` is a fresh array.
 */
export function detectConvergence(
    findings: ReviewFinding[],
    opts: DetectOptions = {},
): ConvergenceReport {
    const tolerance = opts.lineTolerance ?? DEFAULT_LINE_TOLERANCE
    const promotable = opts.promotableSeverities
        ? new Set(opts.promotableSeverities.map((s) => s.toLowerCase()))
        : DEFAULT_PROMOTABLE

    const groups = groupFindings(findings, tolerance)
    const convergentGroups = groups.filter((g) => g.perspectives.length >= 2)
    const promotions: ConvergencePromotion[] = []

    const promoted: ReviewFinding[] = findings.map((f) => ({ ...f }))
    const indexById = new Map<string, number>()
    promoted.forEach((f, i) => indexById.set(f.id, i))

    for (const g of convergentGroups) {
        for (const f of g.findings) {
            const sev = f.severity.toLowerCase()
            const idx = indexById.get(f.id)
            if (promotable.has(sev)) {
                promotions.push({
                    findingId: f.id,
                    perspective: f.perspective,
                    fromSeverity: f.severity,
                    toSeverity: 'must-fix',
                    reason: `Converged with ${g.perspectives.length} perspectives at ${g.path}:${g.minLine}-${g.maxLine}: ${g.perspectives.join(', ')}.`,
                    groupKey: g.key,
                })
                if (idx !== undefined) {
                    promoted[idx] = { ...f, severity: 'must-fix' }
                }
            } else if (
                sev === 'must-fix' ||
                sev === 'must' ||
                sev === 'high' ||
                sev === 'critical'
            ) {
                promotions.push({
                    findingId: f.id,
                    perspective: f.perspective,
                    fromSeverity: f.severity,
                    toSeverity: f.severity,
                    reason: `Already must-fix; converged with ${g.perspectives.length} perspectives at ${g.path}:${g.minLine}-${g.maxLine}: ${g.perspectives.join(', ')}.`,
                    groupKey: g.key,
                })
            }
        }
    }

    return {
        groups,
        convergentGroups,
        promotions,
        promotedFindings: promoted,
    }
}
