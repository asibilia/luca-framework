// Barrel exports for the verification domain.
// Structured verification output at `.luca/phases/<slug>/verify.json`.

export {
    CheckResultSchema,
    DeliverableComplianceSchema,
    VerificationCriterionSchema,
    VerificationResultSchema,
} from './schemas.ts'
export type {
    CheckResult,
    DeliverableCompliance,
    VerificationCriterion,
    VerificationResult,
} from './schemas.ts'

export {
    aggregateVerificationResults,
    findCriterion,
    readVerificationResult,
    writeVerificationResult,
} from './verification-result.ts'
