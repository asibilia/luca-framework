// Canonical pipelineStep values (14), trimmed from the original 22.
// Folded steps are mapped to canonical values via LEGACY_PIPELINE_STEP_MAP
// for backwards-compat reading of pre-migration state.json files.
export const PipelineStepValues = [
    'idle',
    'triage',
    'research',
    'discuss',
    'architect',
    'plan',
    'plan-review',
    'execute',
    'checks',
    'verify',
    'review',
    'learn',
    'milestone',
    'complete',
] as const

// Mapping from legacy pipelineStep values to their canonical replacements.
// Applied by the Zod preprocess on PipelineStep so old state.json files parse.
export const LEGACY_PIPELINE_STEP_MAP: Record<string, string> = {
    // Old setup-related steps fold into triage (start of per-phase work).
    classify: 'triage',
    configure: 'triage',
    'git-setup': 'triage',
    roadmap: 'triage',
    'phase-order': 'triage',
    // Old audit sub-steps fold into review.
    'review-audit': 'review',
    'gap-audit': 'review',
    // Old cleanup folds into milestone.
    cleanup: 'milestone',
}
