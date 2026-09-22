import {
    LUCA_DIR_ROOT,
    PHASE_SLUG_RE,
    RAW_FILE_RE,
    REVIEWER_NAME_RE,
    RUN_ID_RE,
    SEMVER_TAG_RE,
    TMP_FILE_RE,
    TMP_PREVIEW_FILE_RE,
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
    // Transient exclusive lock serializing state.json read-modify-write.
    // Created + deleted per mutation; classified as a lock so the scanner
    // never flags it as stray debris.
    'state.json.lock': 'root.lock',
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
    'confidence.jsonl': 'phase.confidence',
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
    if (head === 'tmp') return validateTmpSubtree(remainder)

    return { valid: false, error: `unknown top-level directory "${head}"` }
}

/**
 * Validate `.luca/tmp/` — the sanctioned, repo-scoped scratch area. Two
 * shapes are legal, both gitignored and NOT pipeline artifacts:
 *
 *   - `tmp/<kebab-name>.{json,md}` — ephemeral CLI-handoff payloads (LLM
 *     orchestrator → `luca` CLI via `--file`). Flat, `.json`/`.md` only. They
 *     exist so a large payload (e.g. `roadmap create`'s phases array) never
 *     has to ride a shared global `/tmp` path that collides across repos.
 *   - `tmp/previews/<name>.<ext>` — ephemeral browser previews (e.g. a
 *     decision-visualizer page). Any extension; one level deep.
 */
function validateTmpSubtree(parts: string[]): ValidationResult {
    // tmp/previews/<name>.<ext>
    if (parts.length === 2 && parts[0] === 'previews') {
        if (TMP_PREVIEW_FILE_RE.test(parts[1]!)) {
            return { valid: true, kind: 'tmp.preview' }
        }
        return {
            valid: false,
            error: 'tmp/previews/ contains <kebab-name>.<ext> preview files only',
        }
    }
    // tmp/<kebab-name>.{json,md}
    if (parts.length !== 1 || !TMP_FILE_RE.test(parts[0]!)) {
        return {
            valid: false,
            error: 'tmp/ contains <kebab-name>.json or <kebab-name>.md handoff files, or previews/<name>.<ext>, only',
        }
    }
    return { valid: true, kind: 'tmp.handoff' }
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

    // raw/<stage>-<NN>.md — per-stage raw output capture (safety net).
    // Written during PLANNING (research mode) and REVIEWING (review
    // mode) BEFORE consolidating into the canonical research.md /
    // audits/<reviewer>.md. Subsequent consolidation reads these files
    // and produces the canonical artifact.
    if (rest[0] === 'raw') {
        if (rest.length === 2 && RAW_FILE_RE.test(rest[1]!)) {
            return { valid: true, kind: 'phase.raw' }
        }
        return {
            valid: false,
            error: `invalid raw path "${rest.join('/')}"; expected raw/<stage>-<NN>.md`,
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
