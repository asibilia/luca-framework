// ---------------------------------------------------------------------------
// Path-shape regex constants
// ---------------------------------------------------------------------------

// Phase slug: zero-padded NN followed by kebab-case description.
// Single-letter descriptions allowed (e.g. "05-x"); trailing dash rejected.
// Examples: "01-auth-rewrite", "12-ws-reconnect", "05-x"
export const PHASE_SLUG_RE = /^[0-9]{2}-[a-z](?:[a-z0-9-]*[a-z0-9])?$/

// Wave file: zero-padded NN.md
// Examples: "01.md", "12.md"
export const WAVE_FILE_RE = /^[0-9]{2}\.md$/

// SemVer with optional prerelease/build (e.g. "v12.0.0", "v12.0.0-alpha.0")
export const SEMVER_TAG_RE =
    /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

// Reviewer name: kebab-case identifier
// Examples: "code-review", "security", "ux", "architect"
export const REVIEWER_NAME_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/

// runId: opaque identifier, typically ULID-shaped, but we accept any
// kebab/alphanumeric token.
export const RUN_ID_RE = /^[A-Za-z0-9_-]+$/

// ---------------------------------------------------------------------------
// Directory + file path constants
// ---------------------------------------------------------------------------

export const LUCA_DIR_ROOT = '.luca'

export const lucaRootPaths = {
    state: `${LUCA_DIR_ROOT}/state.json`,
    config: `${LUCA_DIR_ROOT}/config.json`,
    lock: `${LUCA_DIR_ROOT}/lock.json`,
    roadmap: `${LUCA_DIR_ROOT}/roadmap.md`,
    ledger: `${LUCA_DIR_ROOT}/ledger.jsonl`,
} as const

// File basenames for phase artifacts addressable via PhaseFile.
export const PHASE_FILE_PATHS = {
    research: 'research.md',
    context: 'context.md',
    plan: 'plan.md',
    'plan-review': 'plan-review.md',
    verify: 'verify.json',
    learn: 'learn.md',
    confidence: 'confidence.jsonl',
    'execute/summary': 'execute/summary.md',
    'execute/progress': 'execute/progress.jsonl',
} as const

export type PhaseFile = keyof typeof PHASE_FILE_PATHS
