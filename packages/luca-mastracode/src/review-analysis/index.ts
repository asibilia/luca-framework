// Convergence detection
export {
    detectConvergence,
    type ConvergenceGroup,
    type ConvergencePromotion,
    type ConvergenceReport,
    type DetectOptions,
    type ReviewFinding,
} from './convergence.js'

// Regression detection
export {
    checkRegression,
    diffPaths,
    findingIdentity,
    type RegressionFinding,
    type RegressionInputs,
    type RegressionOptions,
    type RegressionReport,
} from './regression.js'

// Stale-comment filtering
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
