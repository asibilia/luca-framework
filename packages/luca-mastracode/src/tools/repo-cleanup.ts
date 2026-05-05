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
export const ROOT_WHITELIST: ReadonlySet<string> = new Set([
    'luca-state.json',
    '.luca-lock.json',
    'config.json',
    'ROADMAP.md',
    'session-ledger.jsonl',
    'routing-history.jsonl',
    'verification-history.jsonl',
    'confidence-journal.jsonl',
])

// Directories allowed at `.planning/` root.
export const ROOT_WHITELIST_DIRS: ReadonlySet<string> = new Set([
    'phases',
    'todos',
    // Legacy fallback for archives written before currentPhaseSlug existed.
    'runs',
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
export const PHASE_WHITELIST_LENIENT_EXTRA: ReadonlySet<string> = new Set([
    'CONFIDENCE-JOURNAL.md',
    'verification-result.json',
    'checks-convergence.json',
])

// Glob-style patterns matched at `.planning/` root that are always considered
// stragglers (intermediate capture / review artifacts from earlier modes).
function isCaptureOrReviewArtifact(filename: string): boolean {
    return (
        (/-capture-/.test(filename) && filename.endsWith('.md')) ||
        (filename.startsWith('REVIEW-') && filename.endsWith('.md'))
    )
}

interface LockInfo {
    sessionId?: string
    pid?: number
    [key: string]: unknown
}

/**
 * Detect cross-phase stragglers under `.planning/`.
 *
 * Walks `.planning/` and reports files at root that are not in
 * `ROOT_WHITELIST` and not capture/review artifacts already handled by
 * `cleanup-artifacts`. When `currentPhaseSlug` is set in luca-state.json,
 * runs in strict mode (per-phase artifacts at root are stragglers). When no
 * slug is set, runs in lenient mode (per-phase artifacts at root are
 * tolerated as legacy pre-#220 layout).
 *
 * `orphanedPhaseDirs` lists `phases/<x>/` directories not associated with
 * the active slug — currently always empty (any `phases/<x>` is acceptable;
 * left as a future-use return for the finalize gate).
 */
export function detectStragglers(): {
    rootStragglers: string[]
    orphanedPhaseDirs: string[]
} {
    const root = planningRoot()
    if (!existsSync(root)) {
        return { rootStragglers: [], orphanedPhaseDirs: [] }
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
    let entries: import('node:fs').Dirent[] = []
    try {
        entries = readdirSync(root, { withFileTypes: true })
    } catch {
        return { rootStragglers: [], orphanedPhaseDirs: [] }
    }

    for (const entry of entries) {
        if (entry.isDirectory()) {
            // Directories at root are checked against ROOT_WHITELIST_DIRS,
            // but unknown dirs are not currently flagged — finalize gate
            // can opt in later. Keep rootStragglers file-only for now.
            continue
        }
        if (!entry.isFile()) continue
        const name = entry.name
        if (ROOT_WHITELIST.has(name)) continue
        if (isCaptureOrReviewArtifact(name)) continue
        if (!strict && PHASE_WHITELIST_LENIENT_EXTRA.has(name)) continue
        rootStragglers.push(name)
    }

    return { rootStragglers, orphanedPhaseDirs: [] }
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
    const targetDir = phaseDir(slug)
    // phaseDir() does not mkdir; ensure target exists by piggybacking on
    // any straggler write. If there are no stragglers, nothing to do.
    if (rootStragglers.length === 0) {
        return { archived: [], skipped: [] }
    }

    // Lazy mkdir: phaseDir is created when the first move happens, but we
    // create it up-front so an empty-slug-dir is consistent.
    const archived: string[] = []
    const skipped: string[] = []
    const root = planningRoot()
    // Ensure phase dir exists before moves.
    mkdirSync(targetDir, { recursive: true })

    for (const name of rootStragglers) {
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
                    return {
                        status:
                            result.archived.length > 0
                                ? 'archived'
                                : 'nothing-to-archive',
                        archived: result.archived,
                        skipped: result.skipped,
                        message:
                            result.archived.length > 0
                                ? `Archived ${result.archived.length} loose file(s) into the active phase dir; ${result.skipped.length} skipped.`
                                : 'No loose files at .planning/ root to archive.',
                    }
                } catch (err) {
                    const message =
                        err instanceof Error ? err.message : String(err)
                    return { error: message }
                }
            }

            default:
                return { error: `Unknown action: ${action}` }
        }
    },
})
