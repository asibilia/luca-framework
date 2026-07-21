import { generateRunId } from '../../telemetry/helpers/generate-run-id.ts'
import { ENVELOPE_ID_RE } from '../constants.ts'

/** Fallback stem when a repo name sanitizes down to nothing. */
const FALLBACK_STEM = 'repo'

/**
 * Reduce an arbitrary repo name to the `ENVELOPE_ID_RE` charset.
 *
 * Anything outside `[A-Za-z0-9_-]` becomes `-`; runs collapse and edges are
 * trimmed so the id stays human-greppable in a flat directory. A name made
 * entirely of illegal characters yields the fallback stem rather than an
 * empty segment.
 */
function sanitizeRepoName(repoName: string): string {
    const sanitized = repoName
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    return sanitized.length > 0 ? sanitized : FALLBACK_STEM
}

/**
 * Generate an envelope id of the form `<sanitized repoName>_<runId>`.
 *
 * Deliberately not a ULID: uniqueness within one machine-global mailbox is
 * all that is required, and the repo-name prefix self-documents provenance
 * when the flat directory is listed by eye. Reuses the same-package
 * `generateRunId`, whose `run_<ts36>_<rand36>` output shares this charset.
 *
 * The result always satisfies `ENVELOPE_ID_RE` — the id becomes a filename,
 * so a value outside that charset would be a path-traversal vector.
 */
export function generateEnvelopeId(repoName: string): string {
    const id = `${sanitizeRepoName(repoName)}_${generateRunId()}`
    /* c8 ignore next 3 -- defense in depth: unreachable given sanitizeRepoName */
    if (!ENVELOPE_ID_RE.test(id)) {
        return `${FALLBACK_STEM}_${generateRunId()}`
    }
    return id
}
