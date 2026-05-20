import {
    LUCA_DIR_ROOT,
    PHASE_SLUG_RE,
    REVIEWER_NAME_RE,
    RUN_ID_RE,
    SEMVER_TAG_RE,
    WAVE_FILE_RE,
} from '../constants.ts'
import type { LucaArtifactKind } from '../schemas.ts'

export interface ValidationOk {
    valid: true
    kind: LucaArtifactKind
}
export interface ValidationFail {
    valid: false
    error: string
}
export type ValidationResult = ValidationOk | ValidationFail

// Internal lookup tables — co-located with the only caller. Not exported.

const ROOT_FILE_KINDS: Record<string, LucaArtifactKind> = {
    'state.json': 'root.state',
    'config.json': 'root.config',
    'lock.json': 'root.lock',
    'roadmap.md': 'root.roadmap',
    'ledger.jsonl': 'root.ledger',
}

const PHASE_FILE_KINDS: Record<string, LucaArtifactKind> = {
    'research.md': 'phase.research',
    'context.md': 'phase.context',
    'plan.md': 'phase.plan',
    'plan-review.md': 'phase.plan-review',
    'verify.json': 'phase.verify',
    'learn.md': 'phase.learn',
}

/**
 * Validate that a project-relative path matches the .luca/ contract.
 *
 * Returns the artifact kind on success or an error message on failure.
 * Does NOT touch the filesystem — pure path-shape validation.
 *
 * @param relPath - Path relative to project root, e.g. ".luca/phases/01-x/plan.md"
 */
export function isValidLucaPath(relPath: string): ValidationResult {
    if (!relPath.startsWith(`${LUCA_DIR_ROOT}/`)) {
        return {
            valid: false,
            error: `path must start with "${LUCA_DIR_ROOT}/"`,
        }
    }
    const rest = relPath.slice(LUCA_DIR_ROOT.length + 1)
    const parts = rest.split('/')

    // Root files
    if (parts.length === 1) {
        const kind = ROOT_FILE_KINDS[parts[0]!]
        if (kind) return { valid: true, kind }
        return { valid: false, error: `unknown root file "${parts[0]}"` }
    }

    const head = parts[0]
    const remainder = parts.slice(1)

    if (head === 'phases') return validatePhaseSubtree(remainder, 'phase')
    if (head === 'archive') return validatePhaseSubtree(remainder, 'archive')
    if (head === 'milestones') return validateMilestonesSubtree(remainder)
    if (head === 'telemetry') return validateTelemetrySubtree(remainder)

    return { valid: false, error: `unknown top-level directory "${head}"` }
}

function validatePhaseSubtree(
    parts: string[],
    mode: 'phase' | 'archive'
): ValidationResult {
    const [slug, ...rest] = parts
    if (!slug || !PHASE_SLUG_RE.test(slug)) {
        return {
            valid: false,
            error: `invalid phase slug "${slug ?? ''}"; expected <NN-kebab-case>`,
        }
    }

    if (mode === 'archive') {
        // Anything under archive/<slug>/ is permitted (frozen content).
        return { valid: true, kind: 'archive.phase' }
    }

    if (rest.length === 0) {
        return { valid: false, error: 'phase directory must contain a file' }
    }

    // execute/...
    if (rest[0] === 'execute') {
        if (rest.length === 2 && rest[1] === 'summary.md') {
            return { valid: true, kind: 'phase.execute.summary' }
        }
        if (rest.length === 2 && rest[1] === 'progress.jsonl') {
            return { valid: true, kind: 'phase.execute.progress' }
        }
        if (
            rest.length === 3 &&
            rest[1] === 'waves' &&
            WAVE_FILE_RE.test(rest[2]!)
        ) {
            return { valid: true, kind: 'phase.execute.wave' }
        }
        return {
            valid: false,
            error: `invalid phase execute path "${rest.join('/')}"`,
        }
    }

    // audits/<reviewer>.md
    if (rest[0] === 'audits') {
        if (rest.length === 2 && rest[1]!.endsWith('.md')) {
            const reviewer = rest[1]!.slice(0, -3)
            if (REVIEWER_NAME_RE.test(reviewer)) {
                return { valid: true, kind: 'phase.audit' }
            }
        }
        return { valid: false, error: `invalid audit path "${rest.join('/')}"` }
    }

    // Direct phase files
    if (rest.length === 1) {
        const kind = PHASE_FILE_KINDS[rest[0]!]
        if (kind) return { valid: true, kind }
    }

    return { valid: false, error: `unknown phase file "${rest.join('/')}"` }
}

function validateMilestonesSubtree(parts: string[]): ValidationResult {
    if (parts.length !== 1) {
        return {
            valid: false,
            error: 'milestones/ contains files only, no subdirectories',
        }
    }
    const filename = parts[0]!

    // <version>-roadmap.md
    const roadmapMatch = filename.match(/^(v[^-]+(?:-[^-]+)*?)-roadmap\.md$/)
    if (roadmapMatch && SEMVER_TAG_RE.test(roadmapMatch[1]!)) {
        return { valid: true, kind: 'milestone.roadmap' }
    }
    // <version>-audit.md
    const auditMatch = filename.match(/^(v[^-]+(?:-[^-]+)*?)-audit\.md$/)
    if (auditMatch && SEMVER_TAG_RE.test(auditMatch[1]!)) {
        return { valid: true, kind: 'milestone.audit' }
    }
    // <version>-backlog-snapshot.json|.md
    const snapMatch = filename.match(
        /^(v[^-]+(?:-[^-]+)*?)-backlog-snapshot\.(json|md)$/
    )
    if (snapMatch && SEMVER_TAG_RE.test(snapMatch[1]!)) {
        return {
            valid: true,
            kind:
                snapMatch[2] === 'json'
                    ? 'milestone.backlog-snapshot-json'
                    : 'milestone.backlog-snapshot-md',
        }
    }

    return { valid: false, error: `invalid milestones file "${filename}"` }
}

function validateTelemetrySubtree(parts: string[]): ValidationResult {
    if (parts.length !== 1 || !parts[0]!.endsWith('.jsonl')) {
        return {
            valid: false,
            error: 'telemetry/ must contain <runId>.jsonl files only',
        }
    }
    const runId = parts[0]!.slice(0, -'.jsonl'.length)
    if (!RUN_ID_RE.test(runId)) {
        return { valid: false, error: `invalid runId "${runId}"` }
    }
    return { valid: true, kind: 'telemetry.run' }
}
