/**
 * Claim verifier — deterministic check that text artifacts (changesets, PR
 * bodies, plan task entries) cite symbols, file paths, and counts that
 * actually exist in the working tree.
 *
 * Targets the #1 repeat offender across the PR-review corpus: changesets that
 * cite renamed/removed symbols, design docs that drift from shipped code,
 * verification notes with stale index/trigger names — artifacts written
 * before the final review iteration and never reconciled.
 *
 * Three claim types extracted from text:
 *   - symbol:       backtick-wrapped identifier   →  git grep, fail if 0 hits
 *   - file-path:    repo-relative path with ext   →  existsSync, fail if missing
 *   - quantitative: "<N> <countable-noun>"        →  grep noun, ±1 tolerance
 *
 * Ported verbatim from luca-mastracode `state/claim-verifier.ts` — the module
 * was already a pure data layer with `repoRoot` parameterized, so no path
 * retargeting was needed. The `FILE_PATH_RE` deliberately still matches
 * `.planning/` paths: a PR body citing a removed `.planning/` path is exactly
 * the kind of drift this tool exists to catch. The Mastra `createTool` wrapper
 * (`tools/claim-verifier.ts`) is not ported; a `luca` CLI surface lands in
 * Phase C.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { stringifyError } from '../utils/stringify-error.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClaimType = 'symbol' | 'file-path' | 'quantitative'

export interface ExtractedClaim {
    type: ClaimType
    /** Raw matched text (e.g. "`MyFunction`", "src/foo.ts", "5 indexes"). */
    text: string
    /** For quantitative: numeric value. */
    number?: number
    /** For quantitative: counted noun, lowercase, singular. */
    noun?: string
    /** Identifier extracted from a backtick wrapper (symbols only). */
    identifier?: string
    /** Path resolved against repo root (file-path only). */
    path?: string
    /** 1-indexed line number in the source artifact. */
    sourceLine: number
    /** Up to 1 line of context around the match. */
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
    /** True when the budget was exhausted; remaining claims are unverified. */
    timedOut: boolean
    /**
     * Advisory forbidden-language findings (see `scanForbiddenLanguage`).
     * Warnings only — NEVER feed into `passed` or any gate verdict.
     */
    forbiddenLanguage: ForbiddenLanguageWarning[]
}

export interface VerifyOpts {
    /** Repo root — claims are resolved/grepped relative to this. */
    repoRoot: string
    /** Total budget in ms across all grep/fs operations. Default 30000. */
    totalBudgetMs?: number
    /** Per-claim budget in ms. Default 5000. */
    perClaimBudgetMs?: number
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
    if (lower.endsWith('ies') && lower.length > 3) {
        return `${lower.slice(0, -3)}y`
    }
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
 * symbol cited 5× yields one claim; the first-seen sourceLine wins.
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

        // Symbols — backtick-wrapped identifiers.
        for (const match of line.matchAll(BACKTICK_RE)) {
            const inner = (match[1] ?? '').trim()

            // File-path-shaped backticks → handled by FILE_PATH_RE below.
            if (inner.includes('/') && /\.\w+(?:[#?:]|$)/.test(inner)) continue

            if (!IDENTIFIER_RE.test(inner)) continue
            if (inner.length < 3) continue
            if (SYMBOL_STOPWORDS.has(inner.toLowerCase())) continue

            pushIfNew(`symbol:${inner}`, {
                type: 'symbol',
                text: match[0],
                identifier: inner,
                sourceLine,
                sourceContext,
            })
        }

        // File paths.
        for (const match of line.matchAll(FILE_PATH_RE)) {
            const path = match[1]
            if (!path) continue
            pushIfNew(`path:${path}`, {
                type: 'file-path',
                text: path,
                path,
                sourceLine,
                sourceContext,
            })
        }

        // Quantitative claims.
        for (const match of line.matchAll(QUANTITATIVE_RE)) {
            const numStr = match[1]
            const noun = match[2]
            if (!numStr || !noun) continue

            // Skip 4-digit years (version-shaped tokens already excluded by \b).
            if (numStr.length === 4) {
                const n = Number(numStr)
                if (n >= 1900 && n <= 2200) continue
            }

            const lowerNoun = noun.toLowerCase()
            if (!COUNTABLE_NOUNS.has(lowerNoun)) continue

            const num = Number(numStr)
            if (!Number.isFinite(num)) continue

            pushIfNew(`count:${num}:${lowerNoun}`, {
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
// Forbidden language (advisory)
// ---------------------------------------------------------------------------

/**
 * Canonical list of confidence-theater phrases from the verification
 * doctrine. Each phrase is forbidden only WITHOUT attached probe evidence —
 * the phrases are fine when accompanied by tool output.
 *
 * Single source of truth: the luca-tools doctrine constant
 * (`packages/luca-tools/src/artifacts/shared/verification-doctrine.ts`)
 * interpolates this export. Keep the list here.
 */
export const FORBIDDEN_LANGUAGE_PHRASES = [
    'should work',
    'looks fine',
    'tests pass',
    'expected to',
    'done',
] as const

export interface ForbiddenLanguageWarning {
    /** The matched phrase (canonical lowercase form from the list). */
    phrase: string
    /** 1-indexed line number in the source artifact. */
    sourceLine: number
    /** Up to 1 line of context around the match. */
    sourceContext: string
}

/** Word-boundary, case-insensitive matcher per phrase, built once. */
const FORBIDDEN_PHRASE_MATCHERS = FORBIDDEN_LANGUAGE_PHRASES.map((phrase) => ({
    phrase,
    re: new RegExp(`\\b${phrase.replace(/ /g, '\\s+')}\\b`, 'i'),
}))

/**
 * Heuristic: a line "carries evidence" when it looks like tool output or an
 * explicit evidence reference — a fenced-code delimiter, a shell prompt, or
 * an evidence keyword (exit/exit code, stdout, stderr, output, evidence,
 * probe, tool). Deliberately loose: this scan is advisory-only, so false
 * negatives (missed flags) are preferred over false positives.
 */
const EVIDENCE_MARKER_RE =
    /```|^\s*\$\s|\b(?:exit(?:\s+code)?|stdout|stderr|output|evidence|probe|tool)\b/i

/**
 * Mask the contents of inline backtick code spans with spaces (preserving
 * each span's length) so code-span text never triggers the forbidden-phrase
 * match. Same-length space masking mirrors the precedent in luca-cli's
 * plan-lint handler (`maskInlineCodeSpans`); reimplemented locally because
 * that helper is private to luca-cli and luca-core must not import from it.
 */
function maskInlineCodeSpans(line: string): string {
    return line.replace(
        /`[^`]*`/g,
        (span) => `\`${' '.repeat(span.length - 2)}\``
    )
}

/**
 * Advisory scan for forbidden confidence-theater language in prose.
 *
 * A phrase occurrence is flagged when no evidence marker is nearby, where
 * "nearby" = the same line or an adjacent line (±1) matches
 * `EVIDENCE_MARKER_RE`. Inline code spans are space-masked before matching
 * so `` `done` `` (a code token) never flags; lines inside fenced code
 * blocks are skipped entirely — fenced content IS tool output. Evidence
 * detection runs on the RAW lines (backtick content like `exit 0` counts
 * as evidence).
 *
 * Output is warnings only — callers MUST NOT gate verdicts or exit codes
 * on these findings.
 */
export function scanForbiddenLanguage(
    text: string
): ForbiddenLanguageWarning[] {
    if (!text) return []

    const lines = text.split('\n')
    const warnings: ForbiddenLanguageWarning[] = []
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i] ?? ''
        if (/^\s*(?:```|~~~)/.test(raw)) {
            inFence = !inFence
            continue
        }
        if (inFence) continue

        const masked = maskInlineCodeSpans(raw)
        const hits = FORBIDDEN_PHRASE_MATCHERS.filter(({ re }) =>
            re.test(masked)
        )
        if (hits.length === 0) continue

        const nearby = [lines[i - 1], raw, lines[i + 1]]
        const hasEvidence = nearby.some(
            (l) => l !== undefined && EVIDENCE_MARKER_RE.test(l)
        )
        if (hasEvidence) continue

        for (const { phrase } of hits) {
            warnings.push({
                phrase,
                sourceLine: i + 1,
                sourceContext: raw.trim().slice(0, 240),
            })
        }
    }

    return warnings
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

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
    // `--untracked` is critical: at finalize time, newly-authored files may be
    // untracked (or only staged) but the symbols they contain are still valid
    // claims. Without it, fresh files yield false-positive failures.
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
 * Filesystem-walk fallback for non-git environments. Pure Node — no shell, no
 * `find`, no `xargs`. Slower than `git grep` but portable. Skips common
 * vendor/build directories and binary-looking files, and honors the timeout
 * budget by checking elapsed time between files.
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
        const dir = stack.pop()
        if (dir === undefined) break
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
                if (readFileSync(full).includes(needle)) {
                    matchedFiles.push(full)
                }
            } catch {
                // unreadable — skip
            }
        }
    }

    return { ok: true, matchedFiles, timedOut: false }
}

function searchFiles(
    repoRoot: string,
    needle: string,
    timeoutMs: number,
    useGit: boolean
): GrepResult {
    return useGit
        ? gitGrepFiles(repoRoot, needle, timeoutMs)
        : fsGrepFiles(repoRoot, needle, timeoutMs)
}

/**
 * Verify a list of claims against the repo. Stops early when the total budget
 * is exhausted; remaining claims are returned as `timeout` failures.
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

    const breakdown = { symbols: 0, filePaths: 0, quantitative: 0 }

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
            // ±1 tolerance — prose variation is expected.
            if (Math.abs(found - claim.number) > 1) {
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
        // verifyClaims has no source text — text-level callers
        // (verifyTextArtifact) overwrite this with the real scan.
        forbiddenLanguage: [],
    }
}

/** End-to-end: extract + verify a text artifact in one call. */
export function verifyTextArtifact(
    text: string,
    opts: VerifyOpts
): ClaimVerificationReport {
    return {
        ...verifyClaims(extractClaims(text), opts),
        forbiddenLanguage: scanForbiddenLanguage(text),
    }
}

/**
 * Convenience: load a file from disk and verify it. Returns a synthetic
 * `artifact-unreadable` failure if the file cannot be read.
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
            forbiddenLanguage: [],
        }
    }
    return verifyTextArtifact(text, opts)
}
