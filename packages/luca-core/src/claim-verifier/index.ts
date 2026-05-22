// Barrel exports for the claim-verifier domain.
// Deterministic check that text artifacts cite symbols / paths / counts that
// actually exist in the working tree.

export {
    extractClaims,
    verifyClaims,
    verifyFile,
    verifyTextArtifact,
} from './claim-verifier.ts'
export type {
    ClaimFailure,
    ClaimType,
    ClaimVerificationReport,
    ExtractedClaim,
    FailureReason,
    VerifyOpts,
} from './claim-verifier.ts'
