/**
 * Stale-comment filter — identify PR review comments that no longer apply
 * because the cited code has changed since the comment was filed.
 *
 * Background: across the PR-review corpus, ~57% of Copilot inline comments
 * on iterated PRs are stale — they point at code that has already been
 * changed by an earlier fix iteration. Treating them as still-actionable
 * causes the iteration loop to spend cycles on already-fixed issues, post
 * confused replies, and conflate stale findings with current ones.
 *
 * A comment is considered stale when ANY of the following hold:
 *   1. The cited file no longer exists in the working tree.
 *   2. The diff_hunk's "after" lines no longer appear at or near the
 *      cited line in the current working tree (line drift > 5 lines or
 *      content mismatch).
 *   3. The comment's commit_id is older than HEAD AND the cited path was
 *      modified between commit_id and HEAD AND the line content has
 *      changed.
 *
 * Pure data layer. Tool wrapper lives in tools/pr-review.ts.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal PR review comment shape — the subset of GitHub API fields we need.
 * Matches `gh api repos/{owner}/{repo}/pulls/{n}/comments` response items.
 */
export interface PrReviewComment {
    id: number
    path: string
    /** 1-indexed line in the file at `commit_id`. May be null for outdated comments. */
    line: number | null
    /** 1-indexed line at `original_commit_id` (when comment was first filed). */
    original_line: number | null
    /** Most recent commit the comment is anchored to. */
    commit_id: string
    /** Commit at which the comment was originally filed. */
    original_commit_id: string
    /** The unified diff hunk shown in the comment ("@@ ... @@\n + ..." etc.). */
    diff_hunk: string
    /** Comment body. */
    body: string
    /** Reply-to relationship; replies are not first-class findings. */
    in_reply_to_id?: number | null
    /** Author. */
    user?: { login?: string; type?: string }
}

export type StaleReason =
    | 'file-missing'
    | 'line-out-of-range'
    | 'content-mismatch'
    | 'commit-outdated-and-path-modified'
    | 'empty-diff-hunk'

export interface StaleVerdict {
    commentId: number
    stale: boolean
    reason?: StaleReason
    evidence: string
    /** Best-effort line where the original anchored content currently lives, if found. */
    currentLine?: number
}

export interface FilterResult {
    /** Comments judged still-applicable. */
    actionable: PrReviewComment[]
    /** Comments judged stale, with reasons. */
    stale: Array<{ comment: PrReviewComment; verdict: StaleVerdict }>
    /** Replies (in_reply_to_id !== null) — pass through, not first-class findings. */
    replies: PrReviewComment[]
    /**
     * Comments whose verdict is `stale: false, reason: 'empty-diff-hunk'` — routed
     * here because the sentinel reason means UNKNOWN, not actionable. Callers MUST
     * NOT treat `stale === false` alone as "actionable"; route by reason instead.
     */
    unknown: PrReviewComment[]
    /** Audit verdicts for every input comment, keyed by commentId. */
    verdicts: Record<number, StaleVerdict>
}

// ---------------------------------------------------------------------------
// Diff hunk parsing
// ---------------------------------------------------------------------------

/**
 * Extract the "added" / context lines from a unified diff hunk that represent
 * the state of the file AT the comment's commit_id. These are the lines a
 * human would see when viewing the comment — the post-diff version.
 *
 * GitHub's `diff_hunk` looks like:
 *   @@ -10,5 +10,7 @@ context
 *    unchanged line
 *   -removed line
 *   +added line
 *   +another added line
 *    unchanged line
 *
 * For staleness detection we want lines that exist in the post-state:
 * unchanged (' ') and added ('+'). Removed lines ('-') are not in the
 * current file and aren't useful anchors.
 */
export function extractHunkAnchorLines(diffHunk: string): string[] {
    const lines = diffHunk.split('\n')
    const anchors: string[] = []
    for (const line of lines) {
        if (line.startsWith('@@')) continue
        if (line.startsWith('-')) continue
        // ' ' (context) and '+' (added) are present in the post-state.
        if (line.startsWith(' ') || line.startsWith('+')) {
            anchors.push(line.slice(1))
        } else if (line.length === 0) {
            // Empty hunk line — keep as anchor so we don't lose alignment.
            anchors.push('')
        }
    }
    // Trailing trim — GitHub sometimes appends an empty line.
    while (anchors.length > 0 && anchors[anchors.length - 1] === '') {
        anchors.pop()
    }
    return anchors
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFileLines(repoRoot: string, relPath: string): string[] | null {
    const full = join(repoRoot, relPath)
    if (!existsSync(full)) return null
    try {
        return readFileSync(full, 'utf8').split('\n')
    } catch {
        return null
    }
}

interface GitInvokeResult {
    ok: boolean
    stdout: string
}

function git(repoRoot: string, args: string[], timeoutMs = 5000): GitInvokeResult {
    try {
        const r = spawnSync('git', args, {
            cwd: repoRoot,
            encoding: 'utf8',
            timeout: timeoutMs,
        })
        if (r.status !== 0) return { ok: false, stdout: '' }
        return { ok: true, stdout: r.stdout ?? '' }
    } catch {
        return { ok: false, stdout: '' }
    }
}

function isCommitReachable(repoRoot: string, sha: string): boolean {
    if (!sha) return false
    return git(repoRoot, ['cat-file', '-e', `${sha}^{commit}`]).ok
}

function pathChangedBetween(
    repoRoot: string,
    fromSha: string,
    toSha: string,
    path: string
): boolean {
    const r = git(repoRoot, ['diff', '--name-only', `${fromSha}..${toSha}`, '--', path])
    if (!r.ok) return false
    return r.stdout.split('\n').some((l) => l.trim() === path)
}

function getHeadSha(repoRoot: string): string | undefined {
    const r = git(repoRoot, ['rev-parse', 'HEAD'])
    if (!r.ok) return undefined
    return r.stdout.trim() || undefined
}

/**
 * Find the best-matching contiguous run of anchor lines in `fileLines`,
 * preferring matches near `expectedLine`. Returns the 1-indexed start line
 * of the match, or undefined if no acceptable match exists.
 *
 * "Acceptable" means: at least 60% of anchors match exactly in order at
 * a contiguous offset, with no more than 2 intervening mismatches. This
 * tolerates whitespace tweaks and comment edits that don't change the
 * cited code's identity.
 */
export function findAnchorInFile(
    fileLines: string[],
    anchors: string[],
    expectedLine: number | null
): { line: number; matchedRatio: number } | undefined {
    const meaningfulAnchors = anchors.filter((a) => a.trim().length > 0)
    if (meaningfulAnchors.length === 0) return undefined

    // Search window — prefer ±50 lines around expectedLine, fall back to whole file.
    const expected = expectedLine ?? 1
    const windowSize = 50
    const windowStart = Math.max(0, expected - 1 - windowSize)
    const windowEnd = Math.min(fileLines.length, expected - 1 + windowSize)

    type Candidate = { line: number; matchedRatio: number }

    function scoreAt(startIdx: number): Candidate | undefined {
        let matched = 0
        let mismatches = 0
        let cursor = startIdx
        for (const anchor of meaningfulAnchors) {
            // Search forward up to 3 lines for this anchor.
            let found = -1
            for (let probe = 0; probe < 4 && cursor + probe < fileLines.length; probe++) {
                if (fileLines[cursor + probe] === anchor) {
                    found = probe
                    break
                }
            }
            if (found === -1) {
                mismatches++
                if (mismatches > 2) return undefined
                cursor++
                continue
            }
            matched++
            cursor += found + 1
        }
        const ratio = matched / meaningfulAnchors.length
        if (ratio < 0.6) return undefined
        return { line: startIdx + 1, matchedRatio: ratio }
    }

    let best: Candidate | undefined
    for (let i = windowStart; i < windowEnd; i++) {
        const c = scoreAt(i)
        if (!c) continue
        if (!best || c.matchedRatio > best.matchedRatio || Math.abs(c.line - expected) < Math.abs(best.line - expected)) {
            best = c
        }
    }
    if (best) return best

    // Fallback: search whole file for highest-ratio match.
    for (let i = 0; i < fileLines.length; i++) {
        if (i >= windowStart && i < windowEnd) continue
        const c = scoreAt(i)
        if (!c) continue
        if (!best || c.matchedRatio > best.matchedRatio) {
            best = c
        }
    }
    return best
}

// ---------------------------------------------------------------------------
// Per-comment staleness verdict
// ---------------------------------------------------------------------------

export interface VerdictOptions {
    repoRoot: string
    /** HEAD SHA. Defaults to `git rev-parse HEAD`. */
    headSha?: string
    /** Maximum line drift (in lines) before a relocated anchor is considered stale. */
    maxDriftLines?: number
}

/**
 * Classify a single comment as actionable, stale, or unknown.
 *
 * Returns a `StaleVerdict` with three possible interpretations:
 *  • `stale: true` — comment is stale (one of four reasons)
 *  • `stale: false, reason: undefined` — ACTIONABLE: anchor found, drift acceptable, commit not outdated
 *  • `stale: false, reason: 'empty-diff-hunk'` — UNKNOWN: cannot classify (e.g. Copilot comment with no diff_hunk).
 *    Callers MUST route this verdict to `FilterResult.unknown`, NOT to `actionable`.
 *    Checking `stale === false` alone is NOT sufficient to identify actionable comments.
 */
export function verdictFor(
    comment: PrReviewComment,
    opts: VerdictOptions
): StaleVerdict {
    const { repoRoot } = opts
    const maxDrift = opts.maxDriftLines ?? 5

    // 0. Empty diff_hunk → unclassifiable. Cannot anchor the comment without
    // diff context, so we refuse to mark it stale (avoids Copilot-style
    // false positives) and refuse to mark it actionable (avoids surfacing
    // noise to executors).
    if (comment.diff_hunk === '') {
        return {
            commentId: comment.id,
            stale: false,
            reason: 'empty-diff-hunk',
            evidence: 'empty diff_hunk — cannot classify',
        }
    }

    // 1. File missing → stale.
    const fileLines = readFileLines(repoRoot, comment.path)
    if (!fileLines) {
        return {
            commentId: comment.id,
            stale: true,
            reason: 'file-missing',
            evidence: `Cited path '${comment.path}' no longer exists in the working tree.`,
        }
    }

    // 2. Try to anchor the comment via diff_hunk.
    const anchors = extractHunkAnchorLines(comment.diff_hunk)
    const expectedLine = comment.line ?? comment.original_line
    const match = findAnchorInFile(fileLines, anchors, expectedLine)

    if (!match) {
        return {
            commentId: comment.id,
            stale: true,
            reason: 'content-mismatch',
            evidence: `Diff hunk anchors not found in current '${comment.path}'. The cited code has likely been rewritten or removed.`,
        }
    }

    if (expectedLine != null) {
        const drift = Math.abs(match.line - expectedLine)
        if (drift > maxDrift) {
            return {
                commentId: comment.id,
                stale: true,
                reason: 'line-out-of-range',
                evidence: `Cited line ${expectedLine} differs from current anchor location ${match.line} by ${drift} lines (> ${maxDrift}).`,
                currentLine: match.line,
            }
        }
    }

    // 3. Commit-id outdated AND path modified between commit_id and HEAD.
    const headSha = opts.headSha ?? getHeadSha(repoRoot)
    if (
        headSha &&
        comment.commit_id &&
        comment.commit_id !== headSha &&
        isCommitReachable(repoRoot, comment.commit_id) &&
        pathChangedBetween(repoRoot, comment.commit_id, headSha, comment.path)
    ) {
        // Still anchored, but path changed — confirm by re-checking match ratio.
        if (match.matchedRatio < 0.85) {
            return {
                commentId: comment.id,
                stale: true,
                reason: 'commit-outdated-and-path-modified',
                evidence: `Path '${comment.path}' was modified between commit ${comment.commit_id.slice(0, 7)} and HEAD ${headSha.slice(0, 7)} and only ${(match.matchedRatio * 100).toFixed(0)}% of anchors match. Likely stale.`,
                currentLine: match.line,
            }
        }
    }

    return {
        commentId: comment.id,
        stale: false,
        evidence: `Anchored at line ${match.line} (${(match.matchedRatio * 100).toFixed(0)}% match).`,
        currentLine: match.line,
    }
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

export interface FilterOptions {
    repoRoot: string
    /** HEAD SHA. Defaults to current `git rev-parse HEAD`. */
    headSha?: string
    /** Maximum line drift before treating a relocated anchor as stale. */
    maxDriftLines?: number
}

export function filterStaleComments(
    comments: PrReviewComment[],
    opts: FilterOptions
): FilterResult {
    const headSha = opts.headSha ?? getHeadSha(opts.repoRoot)
    const verdictOpts: VerdictOptions = {
        repoRoot: opts.repoRoot,
        headSha,
        maxDriftLines: opts.maxDriftLines,
    }

    const actionable: PrReviewComment[] = []
    const stale: FilterResult['stale'] = []
    const replies: PrReviewComment[] = []
    const unknown: PrReviewComment[] = []
    const verdicts: Record<number, StaleVerdict> = {}

    for (const c of comments) {
        if (c.in_reply_to_id != null) {
            replies.push(c)
            continue
        }
        const v = verdictFor(c, verdictOpts)
        verdicts[c.id] = v
        if (v.stale) {
            stale.push({ comment: c, verdict: v })
        } else if (v.reason === 'empty-diff-hunk') {
            unknown.push(c)
        } else {
            actionable.push(c)
        }
    }

    return { actionable, stale, replies, unknown, verdicts }
}
