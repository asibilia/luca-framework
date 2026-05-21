import { z } from 'zod'

import {
    PHASE_SLUG_RE,
    REVIEWER_NAME_RE,
    RUN_ID_RE,
    SEMVER_TAG_RE,
} from './constants.ts'

// ---------------------------------------------------------------------------
// Artifact kinds
//
// Each kind corresponds to a single canonical location in .luca/. The
// classification is what the stage-gate hook + MCP write tools consult to
// decide phase-appropriateness.
// ---------------------------------------------------------------------------

export const LucaArtifactKind = z.enum([
    // Root-level
    'root.state',
    'root.config',
    'root.lock',
    'root.roadmap',
    'root.ledger',
    // Phase artifacts
    'phase.research',
    'phase.context',
    'phase.plan',
    'phase.plan-review',
    'phase.execute.summary',
    'phase.execute.progress',
    'phase.execute.wave',
    'phase.audit',
    'phase.verify',
    'phase.learn',
    'phase.confidence',
    // Milestones
    'milestone.roadmap',
    'milestone.backlog-snapshot-json',
    'milestone.backlog-snapshot-md',
    'milestone.audit',
    // Telemetry
    'telemetry.run',
    // Archive
    'archive.phase',
])
export type LucaArtifactKind = z.infer<typeof LucaArtifactKind>

// ---------------------------------------------------------------------------
// Input schemas for path-builder helpers
// ---------------------------------------------------------------------------

export const PhaseSlugSchema = z.string().regex(PHASE_SLUG_RE, {
    message:
        'Phase slug must be <NN-kebab-case>, e.g. "01-auth-rewrite" (NN zero-padded).',
})

export const ReviewerNameSchema = z.string().regex(REVIEWER_NAME_RE, {
    message: 'Reviewer name must be kebab-case, e.g. "code-review".',
})

export const SemverTagSchema = z.string().regex(SEMVER_TAG_RE, {
    message: 'Version tag must be SemVer-prefixed with "v", e.g. "v12.0.0".',
})

export const WaveNumberSchema = z
    .number()
    .int()
    .min(0)
    .max(99, { message: 'Wave number must fit in two digits (0–99).' })

export const RunIdSchema = z.string().regex(RUN_ID_RE, {
    message: 'runId must be alphanumeric/kebab.',
})
