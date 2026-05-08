/**
 * repo-cleanup — Mastra tool that scans and cleans up AI-session debris.
 *
 * Orchestrates the shadow-scanner subagent. Six actions:
 *   • scan              — prepare scan parameters and config summary
 *   • parse-report      — validate scanner output → cleanup-report.ts
 *   • apply-fix         — apply remediation → cleanup-fixes.ts
 *   • summary           — surface current shadow-debt config
 *   • cleanup-artifacts — remove intermediate capture/convergence files
 *                         (recurses into .planning/phases/<slug>/)
 *   • archive-loose     — move root stragglers into the active phase dir
 *
 * Per issue #220, this module also exports straggler-detection helpers that
 * the finalize gate consumes to verify the .planning/ root contains only
 * cross-phase artifacts.
 */
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    statSync,
    unlinkSync,
} from 'node:fs'
import { basename, join } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { applyDelete, applyGitignore, applyMove } from './cleanup-fixes.js'
import { parseShadowScanReport } from './cleanup-report.js'

import {
    determineScanMode,
    loadShadowDebtConfig,
    SCAN_MODE_CATEGORIES,
    type ScanMode,
} from '../state/shadow-scanner.js'
import {
    LOCK_PATH,
    phaseDir,
    planningRoot,
    STATE_PATH,
} from '../util/phase-paths.js'

// ── Whitelists ────────────────────────────────────────────────────────────
//
// What is allowed where in `.planning/`. Exported for testability.
//
// Files allowed at `.planning/` root — cross-phase / cross-run artifacts that
// must persist independent of the active phase slug.
//
// Includes both Luca framework files and bridge files used by the framework
// state layer and context-monitor hooks (e.g. `state.json`,
// `.context-metrics.json`, `.context-checkpoint.json`). Repos using either
// the framework state bridge or the context-monitor will produce these at
// `.planning/` root in normal operation, so omitting them would falsely
// flag healthy workspaces and block phase completion (PR #222 review).
export const ROOT_WHITELIST: ReadonlySet<string> = new Set([
    // Core Luca state + locks.
    'luca-state.json',
    '.luca-lock.json',
    'config.json',
    // Project preferences cache (Phase A foundation; Phase C committed it).
    'preferences.json',
    // Multi-phase plan + JSONL audit logs.
    'ROADMAP.md',
    'session-ledger.jsonl',
    'routing-history.jsonl',
    'verification-history.jsonl',
    'confidence-journal.jsonl',
    // Framework state bridge (luca-framework consumers expose `state.json`
    // alongside `luca-state.json`).
    'state.json',
    // Context-monitor hooks emit these at root in normal operation; they
    // are gitignored runtime artifacts but must not be treated as
    // stragglers when present on disk during a session.
    '.context-metrics.json',
    '.context-checkpoint.json',
    // Legacy multi-phase planning artifacts kept by some downstream repos
    // (mirrors the broader shadow-scanner planning_root_allowlist).
    'PROJECT.md',
    'CANONICAL-DECISIONS.md',
    'MILESTONE-AUDIT.md',
    'checks-result.json',
])

// Directories allowed at `.planning/` root.
export const ROOT_WHITELIST_DIRS: ReadonlySet<string> = new Set([
    'phases',
    'todos',
    // Legacy fallback for archives written before currentPhaseSlug existed.
    'runs',
    // Per-run reports + cursor state from `/memory-audit` skill.
    'audits',
])

// Files allowed under `phases/<slug>/` when a slug is active (strict mode).
export const PHASE_WHITELIST_STRICT: ReadonlySet<string> = new Set([
    'PLAN.md',
    'CONTEXT.md',
    'RESEARCH.md',
    'POSTMORTEM.md',
    'SESSION-ARCHIVE.md',
    'SUGGESTED-RULES.md',
    // Per-phase artifacts that issue #220 routes under phases/<slug>/.
    'CONFIDENCE-JOURNAL.md',
    'verification-result.json',
    'checks-convergence.json',
])

// Extra files tolerated at `.planning/` root in lenient mode (no slug yet —
// pre-#220 layout). These only appear here as legacy stragglers; once a slug
// is set the strict mode treats their root presence as cleanup targets.
//
// Lenient mode mirrors the full PHASE_WHITELIST_STRICT set so that legacy
// in-flight runs (which keep PLAN/CONTEXT/RESEARCH/POSTMORTEM at root before
// a slug is derived) are not flagged as stragglers — keeping the documented
// upgrade path workable (PR #222 review).
export const PHASE_WHITELIST_LENIENT_EXTRA: ReadonlySet<string> = new Set([
    'PLAN.md',
    'CONTEXT.md',
    'RESEARCH.md',
    'POSTMORTEM.md',
    'SESSION-ARCHIVE.md',
    'SUGGESTED-RULES.md',
    'CONFIDENCE-JOURNAL.md',
    'verification-result.json',
    'checks-convergence.json',
])

// Capture artifacts (intermediate `*-capture-*.md` files) at `.planning/`
// root are always stragglers: they're per-iteration scratch and `cleanup-
// artifacts` removes them outright.
function isCaptureArtifact(filename: string): boolean {
    return /-capture-/.test(filename) && filename.endsWith('.md')
}

// `REVIEW-<n>.md` files at `.planning/` root are migration targets —
// `archive-loose` should move them into `phases/<slug>/`. They are NOT
// removable scratch like capture artifacts (PR #222 review).
function isReviewArtifact(filename: string): boolean {
    return filename.startsWith('REVIEW-') && filename.endsWith('.md')
}

interface LockInfo {
    sessionId?: string
    pid?: number
    [key: string]: unknown
}

/**
 * Detect cross-phase stragglers under `.planning/`.
 *
 * Walks `.planning/` and reports:
 *   - `rootStragglers`: files at root not in `ROOT_WHITELIST`. Includes
 *     `REVIEW-*.md` files (which `archive-loose` migrates), and excludes
 *     capture artifacts (`*-capture-*.md`) which `cleanup-artifacts`
 *     handles separately.
 *   - `unknownRootDirs`: directories at root not in `ROOT_WHITELIST_DIRS`.
 *     `archive-loose` only migrates files, so unknown dirs surface here so
 *     the finalize gate can prompt the operator.
 *   - `orphanedPhaseDirs`: reserved (always empty today; finalize gate may
 *     opt in later for orphan-phase detection).
 *
 * When `currentPhaseSlug` is set in luca-state.json, runs in strict mode
 * (per-phase artifacts at root are stragglers). When no slug is set, runs
 * in lenient mode (the full PHASE_WHITELIST_STRICT set is tolerated at root
 * as legacy pre-#220 layout — see PR #222 review).
 */
export function detectStragglers(): {
    rootStragglers: string[]
    orphanedPhaseDirs: string[]
    unknownRootDirs: string[]
} {
    const root = planningRoot()
    if (!existsSync(root)) {
        return {
            rootStragglers: [],
            orphanedPhaseDirs: [],
            unknownRootDirs: [],
        }
    }

    let slug: string | undefined
    const statePath = STATE_PATH()
    if (existsSync(statePath)) {
        try {
            const state = JSON.parse(readFileSync(statePath, 'utf-8'))
            if (typeof state?.currentPhaseSlug === 'string') {
                slug = state.currentPhaseSlug
            }
        } catch {
            // Corrupt state file — treat as no slug (lenient).
        }
    }
    const strict = typeof slug === 'string' && slug.length > 0

    const rootStragglers: string[] = []
    const unknownRootDirs: string[] = []
    let entries: import('node:fs').Dirent[] = []
    try {
        entries = readdirSync(root, { withFileTypes: true })
    } catch {
        return {
            rootStragglers: [],
            orphanedPhaseDirs: [],
            unknownRootDirs: [],
        }
    }

    for (const entry of entries) {
        const name = entry.name
        if (entry.isDirectory()) {
            // Unknown directories at root are flagged so the finalize gate
            // can surface them — `archive-loose` only moves files, so stray
            // dirs must be cleaned up manually (PR #222 review).
            if (!ROOT_WHITELIST_DIRS.has(name)) {
                unknownRootDirs.push(name)
            }
            continue
        }
        if (!entry.isFile()) continue
        if (ROOT_WHITELIST.has(name)) continue
        // Capture artifacts are scratch — `cleanup-artifacts` removes them,
        // they are not migration targets.
        if (isCaptureArtifact(name)) continue
        // REVIEW-*.md files ARE migration targets — fall through into
        // rootStragglers so `archive-loose` picks them up.
        if (!strict && !isReviewArtifact(name)) {
            // Lenient mode (no slug yet): tolerate legacy phase artifacts at
            // root, but still flag REVIEW-*.md so they migrate when a slug
            // is finally set.
            if (PHASE_WHITELIST_LENIENT_EXTRA.has(name)) continue
        }
        rootStragglers.push(name)
    }

    return { rootStragglers, orphanedPhaseDirs: [], unknownRootDirs }
}

/**
 * Move root stragglers into the active phase directory.
 *
 * Refuses to run if another session holds the pipeline lock or if no
 * `currentPhaseSlug` is set in luca-state.json (cannot determine target).
 * Skips any straggler whose target path already exists (no overwrite).
 * Idempotent: safe to call repeatedly — once stragglers are gone the call
 * is a no-op.
 */
export function archiveLoose(): {
    archived: string[]
    skipped: string[]
} {
    // Lock check: refuse if another live session holds the lock.
    const lockPath = LOCK_PATH()
    if (existsSync(lockPath)) {
        try {
            const lock: LockInfo = JSON.parse(readFileSync(lockPath, 'utf-8'))
            const heldByOther =
                typeof lock.pid === 'number' && lock.pid !== process.pid
            if (heldByOther) {
                let alive = false
                try {
                    process.kill(lock.pid as number, 0)
                    alive = true
                } catch {
                    alive = false
                }
                if (alive) {
                    throw new Error(
                        `archiveLoose refused: pipeline lock held by another session (PID ${lock.pid}). Wait for the holder to finish or release the lock.`
                    )
                }
            }
        } catch (err) {
            // JSON parse / kill failures: re-throw the explicit refusal,
            // but tolerate a corrupt lock (treated as no holder).
            if (
                err instanceof Error &&
                err.message.startsWith('archiveLoose refused')
            ) {
                throw err
            }
        }
    }

    // Read state for slug.
    let slug: string | undefined
    const statePath = STATE_PATH()
    if (existsSync(statePath)) {
        try {
            const state = JSON.parse(readFileSync(statePath, 'utf-8'))
            if (typeof state?.currentPhaseSlug === 'string') {
                slug = state.currentPhaseSlug
            }
        } catch {
            /* fall through to slug-missing error */
        }
    }
    if (!slug || slug.length === 0) {
        throw new Error(
            'archiveLoose refused: no currentPhaseSlug in luca-state.json — cannot determine target phase directory.'
        )
    }

    const { rootStragglers } = detectStragglers()

    // Also collect `*-capture-*.md` files at root. These are skipped from
    // detectStragglers because `cleanup-artifacts` removes them outright,
    // but the migration docs (#220) document `archive-loose` as the
    // migration helper for legacy root layouts — including capture files.
    // Migrating preserves them as part of phase history; users can still
    // run `cleanup-artifacts` afterwards if they want to discard scratch.
    const root = planningRoot()
    const captureFiles: string[] = []
    try {
        for (const entry of readdirSync(root, { withFileTypes: true })) {
            if (!entry.isFile()) continue
            if (isCaptureArtifact(entry.name)) {
                captureFiles.push(entry.name)
            }
        }
    } catch {
        // ignore unreadable root
    }

    const allTargets = [...rootStragglers, ...captureFiles]
    if (allTargets.length === 0) {
        return { archived: [], skipped: [] }
    }

    const targetDir = phaseDir(slug)
    // Lazy mkdir: phaseDir is created when the first move happens, but we
    // create it up-front so an empty-slug-dir is consistent.
    const archived: string[] = []
    const skipped: string[] = []
    // Ensure phase dir exists before moves.
    mkdirSync(targetDir, { recursive: true })

    for (const name of allTargets) {
        const src = join(root, name)
        const dst = join(targetDir, basename(name))
        if (existsSync(dst)) {
            skipped.push(`${name} (target already exists)`)
            continue
        }
        try {
            renameSync(src, dst)
            archived.push(name)
        } catch (err) {
            skipped.push(
                `${name} (rename failed: ${err instanceof Error ? err.message : String(err)})`
            )
        }
    }

    return { archived, skipped }
}

export const repoCleanupTool = createTool({
    id: 'repo-cleanup',
    description:
        'Scan and clean up AI-session debris in the repository. ' +
        'Orchestrates the shadow-scanner subagent: prepares scan parameters, ' +
        'parses scanner output, applies fixes, and reports summaries. ' +
        'Run during finalization before PR creation — not during execution.',
    inputSchema: z.object({
        action: z
            .enum([
                'scan',
                'parse-report',
                'apply-fix',
                'summary',
                'cleanup-artifacts',
                'archive-loose',
            ])
            .describe('Operation to perform'),
        scan_mode: z
            .enum(['quick', 'standard', 'full'])
            .optional()
            .describe(
                'Explicit scan mode (for scan action). Auto-determined if omitted.'
            ),
        raw_output: z
            .string()
            .optional()
            .describe(
                'Raw shadow-scanner subagent output (for parse-report action)'
            ),
        file_path: z
            .string()
            .optional()
            .describe('File path to apply fix to (for apply-fix action)'),
        recommended_action: z
            .enum(['move', 'delete', 'gitignore'])
            .optional()
            .describe('Fix action to apply (for apply-fix action)'),
        target_path: z
            .string()
            .optional()
            .describe(
                'Destination path for move action (for apply-fix action)'
            ),
    }),
    execute: async (input) => {
        const {
            action,
            scan_mode,
            raw_output,
            file_path,
            recommended_action,
            target_path,
        } = input

        switch (action) {
            case 'scan': {
                const config = loadShadowDebtConfig()
                if (!config.enabled) {
                    return {
                        status: 'disabled',
                        message:
                            'Shadow debt scanning is disabled in .planning/config.json',
                    }
                }

                const mode: ScanMode = scan_mode ?? determineScanMode({})
                const categories = SCAN_MODE_CATEGORIES[mode]

                return {
                    status: 'ready',
                    scan_mode: mode,
                    categories_to_scan: categories,
                    config_summary: {
                        denylist_patterns: config.denylist_patterns,
                        known_good_script_dirs: config.known_good_script_dirs,
                        known_artifact_dirs: config.known_artifact_dirs,
                        allowlist: config.allowlist,
                        planning_root_allowlist: config.planning_root_allowlist,
                        planning_root_dirs: config.planning_root_dirs,
                        planning_root_versioned_patterns:
                            config.planning_root_versioned_patterns,
                        repo_root_markdown_allowlist:
                            config.repo_root_markdown_allowlist,
                    },
                    instructions:
                        `Spawn the shadow-scanner subagent with task: ` +
                        `"Run a ${mode} shadow scan (categories ${categories.join(', ')}). ` +
                        `Use the shadow_debt config from .planning/config.json."`,
                }
            }

            case 'parse-report': {
                if (!raw_output) {
                    return { error: 'raw_output is required for parse-report' }
                }
                return parseShadowScanReport(raw_output)
            }

            case 'apply-fix': {
                if (!file_path || !recommended_action) {
                    return {
                        error: 'file_path and recommended_action are required for apply-fix',
                    }
                }

                switch (recommended_action) {
                    case 'delete':
                        return applyDelete(file_path)
                    case 'move':
                        return applyMove(file_path, target_path)
                    case 'gitignore':
                        return applyGitignore(file_path)
                    default:
                        return {
                            error: `Unknown action: ${recommended_action}`,
                        }
                }
            }

            case 'summary': {
                const config = loadShadowDebtConfig()
                return {
                    enabled: config.enabled,
                    phase_scan_mode: config.phase_scan_mode,
                    milestone_scan_mode: config.milestone_scan_mode,
                    block_milestone_on_critical:
                        config.block_milestone_on_critical,
                    denylist_patterns: config.denylist_patterns,
                    allowlist: config.allowlist,
                }
            }

            case 'cleanup-artifacts': {
                const planningDir = planningRoot()
                const phasesDir = join(planningDir, 'phases')
                const removed: string[] = []

                /**
                 * Remove capture/convergence artifacts in a single directory
                 * (non-recursive). Captures: *-capture-*.md. Convergence:
                 * checks-convergence.json.
                 */
                const cleanDir = (dir: string, displayPrefix: string) => {
                    if (!existsSync(dir)) return
                    for (const file of readdirSync(dir)) {
                        if (/-capture-/.test(file) && file.endsWith('.md')) {
                            unlinkSync(join(dir, file))
                            removed.push(`${displayPrefix}${file}`)
                        }
                    }
                    const convergenceFile = join(dir, 'checks-convergence.json')
                    if (existsSync(convergenceFile)) {
                        unlinkSync(convergenceFile)
                        removed.push(`${displayPrefix}checks-convergence.json`)
                    }
                }

                // Clean root .planning/ (legacy / pre-#220 layout)
                cleanDir(planningDir, '')

                // Recurse into .planning/phases/<slug>/ (post-#220 layout)
                if (existsSync(phasesDir)) {
                    for (const slug of readdirSync(phasesDir)) {
                        const phaseDirPath = join(phasesDir, slug)
                        try {
                            if (!statSync(phaseDirPath).isDirectory()) continue
                        } catch {
                            continue
                        }
                        cleanDir(phaseDirPath, `phases/${slug}/`)
                    }
                }

                return {
                    status: removed.length > 0 ? 'cleaned' : 'nothing-to-clean',
                    removed,
                    message:
                        removed.length > 0
                            ? `Removed ${removed.length} artifact(s): ${removed.join(', ')}`
                            : 'No capture artifacts found in .planning/ (root or phases/*/)',
                }
            }

            case 'archive-loose': {
                try {
                    const result = archiveLoose()
                    // Three outcomes (PR #222 review):
                    //   - `archived` non-empty: at least one file moved.
                    //   - `archived` empty + `skipped` non-empty: every
                    //     straggler was skipped (target exists or rename
                    //     failed). Migration is incomplete; surface a
                    //     distinct status so callers don't mistake this
                    //     for a clean root.
                    //   - both empty: genuinely nothing to do.
                    const status =
                        result.archived.length > 0
                            ? 'archived'
                            : result.skipped.length > 0
                              ? 'skipped-only'
                              : 'nothing-to-archive'
                    const message =
                        result.archived.length > 0
                            ? `Archived ${result.archived.length} loose file(s) into the active phase dir; ${result.skipped.length} skipped.`
                            : result.skipped.length > 0
                              ? `No files migrated — all ${result.skipped.length} straggler(s) were skipped (target already exists or rename failed). Resolve manually before re-running.`
                              : 'No loose files at .planning/ root to archive.'
                    return {
                        status,
                        archived: result.archived,
                        skipped: result.skipped,
                        message,
                    }
                } catch (err) {
                    const message =
                        err instanceof Error ? err.message : String(err)
                    // Normalize to {success:false, error} so the action's
                    // return shape matches workflowStateTool's archive-loose
                    // (#220 review) — agents that gate on result.success
                    // can detect refusals (lock-held, missing slug) without
                    // a parallel `if (result.error)` check.
                    return { success: false, error: message }
                }
            }

            default:
                return { success: false, error: `Unknown action: ${action}` }
        }
    },
})
