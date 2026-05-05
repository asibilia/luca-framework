/**
 * Phase path resolution — single chokepoint for `.planning/` filesystem layout.
 *
 * Per issue #220, all session artifacts live under `.planning/phases/<slug>/`
 * (per-phase) or directly under `.planning/` (cross-session, append-only).
 * This module is the *only* place that should construct `.planning/...` paths;
 * every consumer (tools, state modules, subagents) routes through these
 * helpers so the layout can evolve without 177-occurrence diffusion.
 *
 * Slug semantics intentionally mirror `sanitizeVaultName` from
 * `packages/luca-framework/src/utils/vault-setup.ts:108-114` (lowercase,
 * `[^a-z0-9-]` → `-`, collapse runs, trim ends).
 *
 * All operations are synchronous. Root path constants are exposed as
 * zero-arg functions (not module-init constants) so they always reflect the
 * *current* working directory — Mastra Code can chdir into a workspace
 * after this module is loaded.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Absolute path to the workspace's `.planning/` directory.
 *
 * Resolved at call time against `process.cwd()` so the helper survives
 * harness chdir between import and use.
 */
export function planningRoot(): string {
    return join(process.cwd(), '.planning')
}

/**
 * Sanitize a free-form string into a slug-safe segment.
 *
 * Lowercases, replaces any character outside `[a-z0-9-]` with `-`, collapses
 * runs of dashes, and trims leading/trailing dashes. Returns `''` for empty
 * input or input containing no slug-safe characters.
 *
 * Mirrors `sanitizeVaultName` semantics from `vault-setup.ts:108-114`.
 *
 * @example
 * slugifySegment('My Cool App!')   // 'my-cool-app'
 * slugifySegment('@scope/pkg')     // 'scope-pkg'
 * slugifySegment('---trim---')     // 'trim'
 * slugifySegment('')               // ''
 */
export function slugifySegment(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}

/**
 * Extract the first ticket-style identifier (e.g. `PT-11089`, `JIRA-1`) from
 * a free-form intent string.
 *
 * Matches `\b([A-Z]{2,}-\d+)\b`. Returns the first match, or `null` when no
 * ticket id is present.
 *
 * @example
 * parseTicketId('PT-11089 fix loading flash')   // 'PT-11089'
 * parseTicketId('add a new feature')            // null
 * parseTicketId('JIRA-1 and PT-2')              // 'JIRA-1'
 */
export function parseTicketId(intent: string): string | null {
    const match = intent.match(/\b([A-Z]{2,}-\d+)\b/)
    return match ? (match[1] ?? null) : null
}

/**
 * Format a `Date` as a local-time `YYYYMMDD-HHmm` slug fragment.
 *
 * @example
 * formatTimestampSlug(new Date('2026-05-05T17:23:00'))   // '20260505-1723'
 */
export function formatTimestampSlug(date?: Date): string {
    const d = date ?? new Date()
    const yyyy = String(d.getFullYear()).padStart(4, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${yyyy}${mm}${dd}-${hh}${mi}`
}

/**
 * Derive a deterministic phase slug from a triage intent string.
 *
 * - When the intent contains a ticket id, the slug is
 *   `<TICKET>-<slugified-intent-minus-ticket[:48]>`. The ticket is stripped
 *   from the intent before slugifying so we don't produce duplicate prefixes
 *   like `PT-220-pt-220-...` (PR #222 review).
 * - Otherwise the slug is `<YYYYMMDD-HHmm>-<slugified-intent[:48]>`.
 *
 * The slug is **never empty**: if both the ticket and the slugified intent
 * yield nothing, the helper falls back to `legacy` (preceded by the timestamp
 * fragment when applicable) so consumers can always construct a phase dir.
 *
 * @example
 * deriveSlug('PT-220 refactor planning paths')
 *   // 'PT-220-refactor-planning-paths'
 *
 * deriveSlug('PT-220')
 *   // 'PT-220'
 *
 * deriveSlug('add darkmode toggle', { now: new Date('2026-05-05T17:23:00') })
 *   // '20260505-1723-add-darkmode-toggle'
 */
export function deriveSlug(intent: string, opts?: { now?: Date }): string {
    const ticket = parseTicketId(intent)
    // Strip the ticket id from the intent before slugifying to avoid producing
    // duplicate prefixes (e.g. ticket `PT-220` + intent `PT-220 refactor` →
    // `PT-220-pt-220-refactor`). If no ticket was found, leave intent intact.
    const intentForSlug = ticket
        ? intent.replace(new RegExp(`\\b${ticket}\\b`, 'g'), ' ')
        : intent
    const intentSlug = slugifySegment(intentForSlug.slice(0, 48))

    if (ticket) {
        if (intentSlug.length > 0) {
            return `${ticket}-${intentSlug}`
        }
        return ticket
    }

    const stamp = formatTimestampSlug(opts?.now)
    if (intentSlug.length > 0) {
        return `${stamp}-${intentSlug}`
    }
    return `${stamp}-legacy`
}

/**
 * Resolve the directory holding per-phase artifacts for `slug`.
 *
 * - `phaseDir(undefined)` (or empty slug) returns `planningRoot()` — the
 *   backward-compatibility fallback for in-flight runs upgraded mid-stream
 *   without a `currentPhaseSlug` (issue #220 decision 8).
 * - Otherwise returns `<planningRoot>/phases/<slug>`.
 *
 * Does **not** create the directory; use `ensurePhaseDir` or `phasePath`
 * when the directory must exist.
 *
 * @example
 * phaseDir(undefined)   // '<cwd>/.planning'
 * phaseDir('foo')       // '<cwd>/.planning/phases/foo'
 */
export function phaseDir(slug?: string | undefined): string {
    if (!slug || slug.length === 0) {
        return planningRoot()
    }
    return join(planningRoot(), 'phases', slug)
}

/**
 * Ensure the phase directory for `slug` exists and return its path.
 *
 * `mkdirSync({ recursive: true })` is idempotent and safe under concurrent
 * pipelines; it never throws on existing directories.
 *
 * @example
 * ensurePhaseDir('PT-220-refactor')   // '<cwd>/.planning/phases/PT-220-refactor'
 */
export function ensurePhaseDir(slug: string): string {
    const dir = phaseDir(slug)
    mkdirSync(dir, { recursive: true })
    return dir
}

/**
 * Resolve a per-phase artifact path, ensuring its parent directory exists.
 *
 * `filename` must be a bare filename; embedded path separators (`/` or `\`)
 * and `..` segments are rejected to prevent path-traversal escapes out of
 * the phase dir. When `slug` is omitted, the file resolves under
 * `planningRoot()` (legacy fallback).
 *
 * @example
 * phasePath('PLAN.md', 'PT-220-refactor')
 *   // '<cwd>/.planning/phases/PT-220-refactor/PLAN.md'
 *
 * phasePath('../etc', 'foo')        // throws
 * phasePath('a/b', 'foo')           // throws
 */
export function phasePath(filename: string, slug?: string | undefined): string {
    if (
        filename.includes('/') ||
        filename.includes('\\') ||
        filename === '..' ||
        filename === '.' ||
        filename.length === 0
    ) {
        throw new Error(
            'phasePath filename must be a non-empty bare filename ' +
                '(no path separators, no "." or "..")'
        )
    }
    const dir = phaseDir(slug)
    mkdirSync(dir, { recursive: true })
    return join(dir, filename)
}

/**
 * Choose a non-colliding slug derived from `baseSlug`.
 *
 * If `phaseDir(baseSlug)` is absent or empty, returns `baseSlug` unchanged
 * (re-entry idempotency: an empty pre-created dir is reused). Otherwise
 * appends `-2`, `-3`, ... until a free dir is found, then attempts
 * `mkdirSync` on the chosen dir as a belt-and-suspenders guard against
 * `EEXIST` races. The chosen slug is returned.
 *
 * @example
 * resolveAvailableSlug('alpha')   // 'alpha'   (when phases/alpha is absent)
 * resolveAvailableSlug('alpha')   // 'alpha-2' (when phases/alpha has files)
 */
export function resolveAvailableSlug(baseSlug: string): string {
    const isOccupied = (slug: string): boolean => {
        const dir = phaseDir(slug)
        if (!existsSync(dir)) return false
        try {
            return readdirSync(dir).length > 0
        } catch {
            return false
        }
    }

    let chosen = baseSlug
    let suffix = 2
    while (isOccupied(chosen)) {
        chosen = `${baseSlug}-${suffix}`
        suffix += 1
    }

    // Belt-and-suspenders: if a concurrent triage created the dir between
    // the existence check and now, mkdirSync({ recursive: true }) is a
    // no-op; if it created it as non-empty under the chosen slug, the
    // caller will collide downstream — but we've at minimum claimed the
    // path for this run.
    mkdirSync(phaseDir(chosen), { recursive: true })
    return chosen
}

// -- Root path constants -----------------------------------------------------
//
// Exposed as functions (not module-load constants) so they always resolve
// against the current `process.cwd()`. Tests and harness chdir freely.

/** `.planning/luca-state.json` — pipeline state snapshot. */
export function STATE_PATH(): string {
    return join(planningRoot(), 'luca-state.json')
}

/** `.planning/.luca-lock.json` — pipeline mutex lockfile. */
export function LOCK_PATH(): string {
    return join(planningRoot(), '.luca-lock.json')
}

/** `.planning/ROADMAP.md` — multi-phase plan (cross-phase, root-level). */
export function ROADMAP_PATH(): string {
    return join(planningRoot(), 'ROADMAP.md')
}

/** `.planning/todos/` — todo backlog directory (root-level). */
export function TODOS_ROOT(): string {
    return join(planningRoot(), 'todos')
}

/** `.planning/session-ledger.jsonl` — append-only routing audit. */
export function LEDGER_PATH(): string {
    return join(planningRoot(), 'session-ledger.jsonl')
}

/** `.planning/routing-history.jsonl` — append-only mode-routing log. */
export function ROUTING_HISTORY_PATH(): string {
    return join(planningRoot(), 'routing-history.jsonl')
}

/** `.planning/verification-history.jsonl` — append-only verification log. */
export function VERIFICATION_HISTORY_PATH(): string {
    return join(planningRoot(), 'verification-history.jsonl')
}

/** `.planning/confidence-journal.jsonl` — append-only confidence log. */
export function CONFIDENCE_JOURNAL_PATH(): string {
    return join(planningRoot(), 'confidence-journal.jsonl')
}

/** `.planning/runs/` — legacy fallback for archived runs when slug absent. */
export function RUNS_ROOT(): string {
    return join(planningRoot(), 'runs')
}

/** `.planning/config.json` — workspace-level Luca configuration. */
export function CONFIG_PATH(): string {
    return join(planningRoot(), 'config.json')
}
