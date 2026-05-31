// Barrel exports for the verification domain.
// Structured verification output at `.luca/phases/<slug>/verify.json`.

export {
    CheckResultSchema,
    VerificationCriterionSchema,
    VerificationResultSchema,
} from './schemas.ts'
export type {
    CheckResult,
    VerificationCriterion,
    VerificationResult,
} from './schemas.ts'

export {
    aggregateVerificationResults,
    findCriterion,
    readVerificationResult,
    writeVerificationResult,
} from './verification-result.ts'
