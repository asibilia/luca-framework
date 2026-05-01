/**
 * Review analysis — pure data-layer primitives for PR review hardening.
 *
 * Tool wrapper: `tools/pr-review.ts`
 */
export {
    detectConvergence,
    type ConvergenceGroup,
    type ConvergencePromotion,
    type ConvergenceReport,
    type DetectOptions,
    type ReviewFinding,
} from './convergence.js'

export {
    checkRegression,
    diffPaths,
    findingIdentity,
    type RegressionFinding,
    type RegressionInputs,
    type RegressionOptions,
    type RegressionReport,
} from './regression.js'

export {
    extractHunkAnchorLines,
    filterStaleComments,
    findAnchorInFile,
    verdictFor,
    type FilterOptions,
    type FilterResult,
    type PrReviewComment,
    type StaleReason,
    type StaleVerdict,
    type VerdictOptions,
} from './stale-filter.js'
