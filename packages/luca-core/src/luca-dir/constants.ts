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

// Raw-capture file: <stage>-<NN>.md where <stage> is a kebab-case
// stage identifier (e.g. "research", "review", "review-code-review"),
// and NN is zero-padded. The stage may itself contain hyphens because
// review-mode files key on `<stage>-<reviewer>` (e.g.
// "review-security-01.md"); we anchor on the trailing -NN.md.
// Examples: "research-01.md", "review-architect-00.md"
export const RAW_FILE_RE = /^[a-z][a-z0-9-]*-[0-9]{2}\.md$/

// SemVer with optional prerelease/build (e.g. "v12.0.0", "v12.0.0-alpha.0")
export const SEMVER_TAG_RE =
    /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

// Reviewer name: kebab-case identifier
// Examples: "code-review", "security", "ux", "architect"
export const REVIEWER_NAME_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/

// runId: opaque identifier, typically ULID-shaped, but we accept any
// kebab/alphanumeric token.
export const RUN_ID_RE = /^[A-Za-z0-9_-]+$/

// tmp/ handoff file: a kebab-case basename with a .json extension.
// These are ephemeral, repo-scoped payload files that bridge an LLM
// orchestrator and the deterministic `luca` CLI (`--file <path>`); they
// are NOT pipeline artifacts. Examples: "roadmap.json", "pr-findings.json"
export const TMP_FILE_RE = /^[a-z][a-z0-9-]*\.json$/

// tmp/previews/ scratch file: a kebab-case basename with any single
// extension. These are ephemeral, repo-scoped, gitignored browser previews
// (e.g. a decision-visualizer page) — NOT pipeline artifacts and NOT
// CLI-handoff payloads. Allowed in ANY pipelineStep because they touch
// neither the repo nor pipeline state. Examples: "auth-decision.html",
// "ws-reconnect-tradeoffs.html".
export const TMP_PREVIEW_FILE_RE =
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z0-9]+$/i

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
