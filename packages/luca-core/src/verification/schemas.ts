/**
 * Structured verification output — `.luca/phases/<slug>/verify.json`.
 *
 * Replaces prose-based verification with deterministic JSON the orchestrator
 * can read without parsing free text. The verifier writes the result; the
 * review step reads it for audit aggregation; finalize reads it for milestone
 * validation; the todo→done gate reads it for criterion lookup.
 *
 * Ported from luca-mastracode `state/verification-result.ts`.
 */
import { z } from 'zod'

/** A single acceptance-criterion verdict. */
export const VerificationCriterionSchema = z
    .object({
        /** Stable identifier (e.g. "ac-01", "test-pass"). */
        criterionId: z.string(),
        /** Human-readable description. */
        description: z.string(),
        /** Whether the criterion is satisfied. */
        met: z.boolean(),
        /** File / line / test evidence supporting the verdict. */
        evidence: z.string(),
        /** If not met, what is missing. */
        gap: z.string().optional(),
        /** Whether this criterion blocks proceeding. */
        blocking: z.boolean(),
        /**
         * Whether verification of this criterion is deferred to a later probe
         * (e.g. post-deploy smoke check). When set, `deferredFollowUp` (the todo
         * id of the tracked follow-up) is REQUIRED, and the criterion MUST have
         * `met: false` until the deferred probe runs.
         */
        deferred: z.boolean().optional(),
        /** Todo id of the tracked follow-up for a deferred criterion. */
        deferredFollowUp: z.string().optional(),
        /** Kind of probe used (or planned) to verify this criterion. */
        probeType: z
            .enum([
                'file-read',
                'grep-symbol',
                'command',
                'http',
                'deploy',
                'ui-screenshot',
                'db-select',
                'config-read',
            ])
            .optional(),
    })
    .superRefine((criterion, ctx) => {
        // Cross-field invariants on the deferred-verify fields ONLY. These fire
        // exclusively on the `deferred: true` branch, so a payload WITHOUT
        // `deferred` (or with `deferred: false`) parses exactly as before — no
        // pre-existing field's type or optionality changes (anti-02 holds).
        if (criterion.deferred !== true) return
        if (
            criterion.deferredFollowUp === undefined ||
            criterion.deferredFollowUp.length === 0
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['deferredFollowUp'],
                message:
                    'deferredFollowUp is required (non-empty) when deferred is true — record the tracked follow-up source (e.g. "deferred-verify:<slug>:<ac-id>")',
            })
        }
        if (criterion.met !== false) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['met'],
                message:
                    'met must be false when deferred is true — a deferred criterion cannot flip to met until the deferred probe runs',
            })
        }
    })
export type VerificationCriterion = z.infer<typeof VerificationCriterionSchema>

/** Per-deliverable compliance verdict against the plan's deliverable manifest. */
export const DeliverableComplianceSchema = z.object({
    /** Stable deliverable identifier (e.g. "D1"). */
    id: z.string(),
    /** Human-readable description of the deliverable. */
    description: z.string(),
    /** Criterion ids that verify this deliverable. */
    criterionIds: z.array(z.string()),
    /** Whether the deliverable shipped, was missed, or partially shipped. */
    compliance: z.enum(['shipped', 'missed', 'partial']),
})
export type DeliverableCompliance = z.infer<typeof DeliverableComplianceSchema>

/** An automated check result (test / typecheck / lint / build). */
export const CheckResultSchema = z.object({
    name: z.string(),
    status: z.enum(['pass', 'fail', 'skip', 'timeout']),
    errorCount: z.number(),
    warningCount: z.number(),
    /** Duration in milliseconds. */
    durationMs: z.number().optional(),
})
export type CheckResult = z.infer<typeof CheckResultSchema>

/** The full verification result for one wave of one phase. */
export const VerificationResultSchema = z.object({
    /** ISO 8601 timestamp (stored verbatim; not parsed for arithmetic). */
    timestamp: z.string(),
    /**
     * Run that produced this result. Stamped on write, validated on read: a
     * stale result from a prior run (mismatched runId) is treated as absent so
     * it cannot satisfy the new run's wave/phase guards. Optional for
     * back-compat with results written before runId stamping.
     */
    runId: z.string().optional(),
    /** Pipeline phase (e.g. "Phase 1: Setup"). */
    phase: z.string().optional(),
    /** Wave / iteration number. */
    wave: z.number(),
    /** Verification depth. */
    mode: z.enum(['quick', 'full']),
    /** Overall verdict. */
    status: z.enum(['PASS', 'FAIL', 'STALLED']),
    /** Per-criterion results. */
    criteria: z.array(VerificationCriterionSchema),
    /** Automated check results. */
    checks: z.array(CheckResultSchema),
    /** Convergence assessment. */
    convergence: z.enum(['converging', 'stalled', 'resolved']),
    /** Error fingerprints for tracking across iterations. */
    errorFingerprints: z.array(z.string()),
    /** Recommendation to the orchestrator. */
    recommendation: z.enum(['proceed', 'fix', 'escalate']),
    /** Free-form notes from the verifier. */
    notes: z.string().optional(),
    /** Per-deliverable compliance against the plan's deliverable manifest. */
    deliverables: z.array(DeliverableComplianceSchema).optional(),
})
export type VerificationResult = z.infer<typeof VerificationResultSchema>
