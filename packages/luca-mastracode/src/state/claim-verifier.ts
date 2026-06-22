/**
 * Claim verifier — deterministic check that text artifacts (changesets, PR
 * bodies, PLAN.md task entries) cite symbols, file paths, and counts that
 * actually exist in the working tree.
 *
 * Targets the #1 repeat offender across PR-review corpus: changesets that
 * cite renamed/removed symbols, design docs that drift from shipped code,
 * VERIFICATION.md with stale index/trigger names, etc. The pattern is
 * artifacts written before the final review iteration, never reconciled.
 *
 * Three claim types extracted from text:
 *   - symbol:       backtick-wrapped identifier   →  git grep, fail if 0 hits
 *   - file-path:    repo-relative path with ext   →  existsSync, fail if missing
 *   - quantitative: "<N> <countable-noun>"        →  grep noun, ±1 tolerance
 *
 * Pure data layer. Tool wrapper lives in tools/claim-verifier.ts.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { stringifyError } from '@alecsibilia/luca-core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClaimType = 'symbol' | 'file-path' | 'quantitative'

export interface ExtractedClaim {
    type: ClaimType
    /** Raw matched text (e.g. "`MyFunction`", "src/foo.ts", "5 indexes") */
    text: string
    /** For quantitative: numeric value */
    number?: number
    /** For quantitative: counted noun, lowercase, singular */
    noun?: string
    /** Identifier extracted from a backtick wrapper (symbols only) */
    identifier?: string
    /** Path resolved against repo root (file-path only) */
    path?: string
    /** 1-indexed line number in source artifact */
    sourceLine: number
    /** Up to 1 line of context around the match */
    sourceContext: string
}

export type FailureReason =
    | 'symbol-not-found'
    | 'file-not-found'
    | 'count-mismatch'
    | 'timeout'
    | 'artifact-unreadable'

export interface ClaimFailure {
    claim: ExtractedClaim
    reason: FailureReason
    evidence: string
}

export interface ClaimVerificationReport {
    passed: boolean
    totalClaims: number
    failures: ClaimFailure[]
    extractedBreakdown: {
        symbols: number
        filePaths: number
        quantitative: number
    }
    /** True when the budget was exhausted; remaining claims are not verified */
    timedOut: boolean
}

// ---------------------------------------------------------------------------
// Stopwords + allow-lists
// ---------------------------------------------------------------------------

/** Backtick-wrapped tokens to skip (CLI tool names, pure prose, primitives). */
const SYMBOL_STOPWORDS = new Set([
    'true',
    'false',
    'null',
    'undefined',
    'void',
    'any',
    'unknown',
    'never',
    'string',
    'number',
    'boolean',
    'object',
    'array',
    'bun',
    'npm',
    'pnpm',
    'yarn',
    'git',
    'gh',
    'pr',
    'ci',
    'cd',
    'repo',
    'main',
    'master',
    'dev',
    'build',
    'test',
    'lint',
    'tsc',
    'eslint',
    'todo',
    'fixme',
    'note',
    'warn',
    'info',
    'log',
    'http',
    'https',
    'json',
    'yaml',
    'toml',
    'env',
    'src',
    'dist',
    'lib',
    'app',
    'apps',
])

/**
 * Nouns that count as "real countable things" for quantitative claims.
 * Conservative on purpose — false negatives are fine, false positives bite.
 */
const COUNTABLE_NOUNS = new Set([
    'file',
    'files',
    'test',
    'tests',
    'table',
    'tables',
    'index',
    'indexes',
    'indices',
    'function',
    'functions',
    'endpoint',
    'endpoints',
    'route',
    'routes',
    'mutation',
    'mutations',
    'query',
    'queries',
    'action',
    'actions',
    'tool',
    'tools',
    'mode',
    'modes',
    'phase',
    'phases',
    'wave',
    'waves',
    'commit',
    'commits',
    'package',
    'packages',
    'module',
    'modules',
    'class',
    'classes',
    'method',
    'methods',
    'component',
    'components',
    'hook',
    'hooks',
])

/** Singularize a counted noun for grep purposes (cheap heuristic). */
function singularize(noun: string): string {
    const lower = noun.toLowerCase()
    if (lower === 'indices') return 'index'
    if (lower === 'queries') return 'query'
    if (lower === 'classes') return 'class'
    if (lower === 'indexes') return 'index'
    if (lower.endsWith('ies') && lower.length > 3)
        return lower.slice(0, -3) + 'y'
    if (lower.endsWith('s') && !lower.endsWith('ss')) return lower.slice(0, -1)
    return lower
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const BACKTICK_RE = /`([^`\n]+)`/g
const FILE_PATH_RE =
    /(?:^|[\s(`'"])((?:packages|src|apps|lib|tests?|docs?|\.planning|\.luca|\.changeset|\.github)\/[\w./-]+\.[\w]+)(?=[\s)`'".,;!?]|$)/g
const QUANTITATIVE_RE = /\b(\d+)\s+([a-zA-Z]+)\b/g
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Extract all claims from a text artifact.
 *
 * Returns an empty array for empty input. Deduplicates by (type, key) so a
 * symbol cited 5× yields one claim. The first-seen sourceLine wins.
 */
export function extractClaims(text: string): ExtractedClaim[] {
    if (!text) return []

    const lines = text.split('\n')
    const seen = new Set<string>()
    const claims: ExtractedClaim[] = []

    const pushIfNew = (key: string, claim: ExtractedClaim) => {
        if (seen.has(key)) return
        seen.add(key)
        claims.push(claim)
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ''
        const sourceLine = i + 1
        const sourceContext = line.trim().slice(0, 240)

        // Symbols — backtick-wrapped identifiers
        for (const match of line.matchAll(BACKTICK_RE)) {
            const inner = (match[1] ?? '').trim()

            // File-path-shaped backticks → handled by FILE_PATH_RE branch below
            if (inner.includes('/') && /\.\w+(?:[#?:]|$)/.test(inner)) continue

            if (!IDENTIFIER_RE.test(inner)) continue
            if (inner.length < 3) continue
            if (SYMBOL_STOPWORDS.has(inner.toLowerCase())) continue

            const key = `symbol:${inner}`
            pushIfNew(key, {
                type: 'symbol',
                text: match[0],
                identifier: inner,
                sourceLine,
                sourceContext,
            })
        }

        // File paths
        for (const match of line.matchAll(FILE_PATH_RE)) {
            const path = match[1]
            if (!path) continue
            const key = `path:${path}`
            pushIfNew(key, {
                type: 'file-path',
                text: path,
                path,
                sourceLine,
                sourceContext,
            })
        }

        // Quantitative claims
        for (const match of line.matchAll(QUANTITATIVE_RE)) {
            const numStr = match[1]
            const noun = match[2]
            if (!numStr || !noun) continue

            // Skip version-shaped (v1, 1.0 already filtered by \b boundary).
            // Skip 4-digit years.
            if (numStr.length === 4) {
                const n = Number(numStr)
                if (n >= 1900 && n <= 2200) continue
            }

            const lowerNoun = noun.toLowerCase()
            if (!COUNTABLE_NOUNS.has(lowerNoun)) continue

            const num = Number(numStr)
            if (!Number.isFinite(num)) continue

            const key = `count:${num}:${lowerNoun}`
            pushIfNew(key, {
                type: 'quantitative',
                text: `${numStr} ${noun}`,
                number: num,
                noun: singularize(lowerNoun),
                sourceLine,
                sourceContext,
            })
        }
    }

    return claims
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

interface VerifyOpts {
    repoRoot: string
    /** Total budget in ms across all grep/fs operations. Default 30000. */
    totalBudgetMs?: number
    /** Per-claim budget in ms. Default 5000. */
    perClaimBudgetMs?: number
}

interface GrepResult {
    ok: boolean
    matchedFiles: string[]
    timedOut: boolean
}

function gitAvailable(repoRoot: string): boolean {
    const r = spawnSync(
        'git',
        ['-C', repoRoot, 'rev-parse', '--is-inside-work-tree'],
        { encoding: 'utf-8' }
    )
    return r.status === 0
}

function gitGrepFiles(
    repoRoot: string,
    needle: string,
    timeoutMs: number
): GrepResult {
    // `--untracked` is critical: at finalize time, newly-authored files may
    // be untracked (or only staged) but the symbols they contain are still
    // valid claims. Without it, fresh files yield false-positive failures.
    const r = spawnSync(
        'git',
        [
            '-C',
            repoRoot,
            'grep',
            '--untracked',
            '-l',
            '--fixed-strings',
            needle,
        ],
        { encoding: 'utf-8', timeout: timeoutMs }
    )

    if (r.signal === 'SIGTERM' || r.error?.message?.includes('ETIMEDOUT')) {
        return { ok: false, matchedFiles: [], timedOut: true }
    }

    // git grep exits 0 with matches, 1 without, >1 on error.
    if (r.status === 1) return { ok: true, matchedFiles: [], timedOut: false }
    if (r.status !== 0) return { ok: false, matchedFiles: [], timedOut: false }

    const matchedFiles = (r.stdout ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    return { ok: true, matchedFiles, timedOut: false }
}

/**
 * Filesystem-walk fallback for non-git environments. Pure Node — no
 * shell, no `find`, no `xargs`. Slower than `git grep` but portable
 * (works on Windows, Alpine without coreutils, etc.).
 *
 * Skips common vendor/build directories and binary-looking files.
 * Honors the timeout budget by checking elapsed time between files.
 */
const FS_SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '.turbo',
    'coverage',
    '.cache',
])
const FS_SKIP_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.ico',
    '.pdf',
    '.zip',
    '.tar',
    '.gz',
    '.lock',
    '.lockb',
])
const FS_MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB — skip larger files

function fsGrepFiles(
    repoRoot: string,
    needle: string,
    timeoutMs: number
): GrepResult {
    const start = Date.now()
    const matchedFiles: string[] = []
    const stack: string[] = [repoRoot]

    while (stack.length > 0) {
        if (Date.now() - start > timeoutMs) {
            return { ok: false, matchedFiles, timedOut: true }
        }
        const dir = stack.pop()!
        let entries: string[]
        try {
            entries = readdirSync(dir)
        } catch {
            continue
        }
        for (const name of entries) {
            const full = join(dir, name)
            let info
            try {
                info = statSync(full)
            } catch {
                continue
            }
            if (info.isDirectory()) {
                if (FS_SKIP_DIRS.has(name)) continue
                stack.push(full)
                continue
            }
            if (!info.isFile()) continue
            const dotIdx = name.lastIndexOf('.')
            if (dotIdx >= 0) {
                const ext = name.slice(dotIdx).toLowerCase()
                if (FS_SKIP_EXTENSIONS.has(ext)) continue
            }
            if (info.size > FS_MAX_FILE_BYTES) continue
            try {
                const buf = readFileSync(full)
                if (buf.includes(needle)) {
                    matchedFiles.push(full)
                }
            } catch {
                // unreadable — skip
            }
        }
    }

    return {
        ok: true,
        matchedFiles,
        timedOut: false,
    }
}

function searchFiles(
    repoRoot: string,
    needle: string,
    timeoutMs: number,
    useGit: boolean
): GrepResult {
    if (useGit) return gitGrepFiles(repoRoot, needle, timeoutMs)
    return fsGrepFiles(repoRoot, needle, timeoutMs)
}

/**
 * Verify a list of claims against the repo. Stops early when the total
 * budget is exhausted; remaining claims are returned as `timeout` failures.
 */
export function verifyClaims(
    claims: ExtractedClaim[],
    opts: VerifyOpts
): ClaimVerificationReport {
    const totalBudgetMs = opts.totalBudgetMs ?? 30_000
    const perClaimBudgetMs = opts.perClaimBudgetMs ?? 5_000
    const useGit = gitAvailable(opts.repoRoot)
    const start = Date.now()
    const failures: ClaimFailure[] = []
    let timedOut = false

    const breakdown = {
        symbols: 0,
        filePaths: 0,
        quantitative: 0,
    }

    for (const claim of claims) {
        if (claim.type === 'symbol') breakdown.symbols++
        else if (claim.type === 'file-path') breakdown.filePaths++
        else breakdown.quantitative++

        if (Date.now() - start > totalBudgetMs) {
            timedOut = true
            failures.push({
                claim,
                reason: 'timeout',
                evidence: `Total budget ${totalBudgetMs}ms exhausted before this claim was checked.`,
            })
            continue
        }

        if (claim.type === 'symbol' && claim.identifier) {
            const r = searchFiles(
                opts.repoRoot,
                claim.identifier,
                perClaimBudgetMs,
                useGit
            )
            if (r.timedOut) {
                timedOut = true
                failures.push({
                    claim,
                    reason: 'timeout',
                    evidence: `Search for symbol "${claim.identifier}" exceeded ${perClaimBudgetMs}ms.`,
                })
                continue
            }
            if (!r.ok || r.matchedFiles.length === 0) {
                failures.push({
                    claim,
                    reason: 'symbol-not-found',
                    evidence: `git grep for "${claim.identifier}" returned 0 hits.`,
                })
            }
            continue
        }

        if (claim.type === 'file-path' && claim.path) {
            const abs = join(opts.repoRoot, claim.path)
            if (!existsSync(abs)) {
                failures.push({
                    claim,
                    reason: 'file-not-found',
                    evidence: `Path "${claim.path}" does not exist (resolved to ${abs}).`,
                })
            }
            continue
        }

        if (
            claim.type === 'quantitative' &&
            claim.noun &&
            typeof claim.number === 'number'
        ) {
            const r = searchFiles(
                opts.repoRoot,
                claim.noun,
                perClaimBudgetMs,
                useGit
            )
            if (r.timedOut) {
                timedOut = true
                failures.push({
                    claim,
                    reason: 'timeout',
                    evidence: `Search for noun "${claim.noun}" exceeded ${perClaimBudgetMs}ms.`,
                })
                continue
            }
            if (!r.ok) {
                // Treat a hard error as count-mismatch with 0 hits.
                failures.push({
                    claim,
                    reason: 'count-mismatch',
                    evidence: `grep for "${claim.noun}" failed; cannot verify "${claim.text}".`,
                })
                continue
            }
            const found = r.matchedFiles.length
            const claimed = claim.number
            // ±1 tolerance — prose variation is expected.
            if (Math.abs(found - claimed) > 1) {
                failures.push({
                    claim,
                    reason: 'count-mismatch',
                    evidence: `Claim says "${claim.text}", repo has ${found} file(s) mentioning "${claim.noun}" (tolerance ±1).`,
                })
            }
            continue
        }
    }

    return {
        passed: failures.length === 0,
        totalClaims: claims.length,
        failures,
        extractedBreakdown: breakdown,
        timedOut,
    }
}

/**
 * End-to-end: extract + verify a text artifact in one call.
 */
export function verifyTextArtifact(
    text: string,
    opts: VerifyOpts
): ClaimVerificationReport {
    const claims = extractClaims(text)
    return verifyClaims(claims, opts)
}

/**
 * Convenience: load a file from disk and verify it. Returns
 * a synthetic `artifact-unreadable` failure if the file can't be read.
 */
export function verifyFile(
    filePath: string,
    opts: VerifyOpts
): ClaimVerificationReport {
    let text: string
    try {
        text = readFileSync(filePath, 'utf-8')
    } catch (err) {
        const msg = stringifyError(err)
        return {
            passed: false,
            totalClaims: 0,
            failures: [
                {
                    claim: {
                        type: 'file-path',
                        text: filePath,
                        path: filePath,
                        sourceLine: 0,
                        sourceContext: '',
                    },
                    reason: 'artifact-unreadable',
                    evidence: `Could not read "${filePath}": ${msg}`,
                },
            ],
            extractedBreakdown: { symbols: 0, filePaths: 0, quantitative: 0 },
            timedOut: false,
        }
    }
    return verifyTextArtifact(text, opts)
}
