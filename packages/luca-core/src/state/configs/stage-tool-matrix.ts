import type { CoarsePhase } from '../schemas.ts'

/**
 * Tool categories the stage-gate matrix knows about.
 *
 * Categorization is determined by:
 *   - Edit/Write/NotebookEdit + target path → code-write | planning-write-general | planning-write-audit
 *   - Bash + command + redirect targets → bash-readonly | bash-mutate | bash-commit
 *
 * The hook layer maps a raw tool call to a category, then consults this
 * matrix to decide allow/deny.
 */
export type ToolCategory =
    | 'code-write'
    | 'planning-write-general'
    | 'planning-write-audit'
    | 'bash-readonly'
    // A `git add` staging invocation (see the 'bash-stage' BashCategory).
    // PERMITS: staging a path into the index, and nothing else — it does not
    // commit. WHY: staging is not committing, and the finalize step must stage
    // the changeset it authored; EXECUTING already permits bare `git add`
    // today, so this column preserves that while extending it to FINALIZING.
    // Denied in PLANNING/REVIEWING, where nothing should be staged.
    | 'bash-stage'
    | 'bash-mutate'
    | 'bash-commit'
    // v13 write-surface: a Bash `luca <noun> <write-verb>` invocation. The
    // `luca` CLI self-enforces each verb's per-step phase precondition
    // (see WRITE_COMMAND_PHASES), so the matrix only needs to NOT block it
    // in non-IDLE phases — it is allowed everywhere except, trivially,
    // IDLE (which is permissive anyway).
    | 'luca-write'
    // A `.changeset/<name>.md` release note (see the 'release-artifact'
    // write-path class). PERMITS: creating/editing a changeset markdown
    // file, and nothing else — `.changeset/README.md` and
    // `.changeset/config.json` classify as 'code' and are unaffected.
    // WHY: the finalize step is instructed to author a changeset, but
    // FINALIZING denies 'code-write'; without this column the instructed
    // action is unreachable. This is the MINIMUM grant that fixes it —
    // widening 'code-write' in FINALIZING would open the whole repo tree.
    // Granted in EXECUTING too, because EXECUTING['code-write'] is already
    // true: a FINALIZING-only grant would newly BLOCK a changeset write
    // that is legal there today.
    | 'release-artifact'

/**
 * Coarse-phase → tool-category allow matrix.
 *
 * Source of truth: decision:luca-stage-tool-matrix-2026-05-19. IDLE is
 * permissive (no enforcement). Every other phase has explicit allow/deny
 * for each category.
 *
 * DEMOTED (DAD-P1t): this is data referenced BY the machine state (keyed by
 * coarse phase), not control flow. It does not encode the pipeline's structure.
 */
export const STAGE_TOOL_MATRIX: Record<
    CoarsePhase,
    Record<ToolCategory, boolean>
> = {
    IDLE: {
        'code-write': true,
        'planning-write-general': true,
        'planning-write-audit': true,
        'bash-readonly': true,
        'bash-stage': true,
        'bash-mutate': true,
        'bash-commit': true,
        'luca-write': true,
        'release-artifact': true,
    },
    PLANNING: {
        'code-write': false,
        'planning-write-general': true,
        'planning-write-audit': true,
        'bash-readonly': true,
        // Nothing has been built yet — no changeset to stage.
        'bash-stage': false,
        'bash-mutate': false,
        'bash-commit': false,
        'luca-write': true,
        // No release notes during planning — nothing has been built yet.
        'release-artifact': false,
    },
    EXECUTING: {
        'code-write': true,
        'planning-write-general': true,
        'planning-write-audit': true,
        'bash-readonly': true,
        // Preserves today's behavior: bare `git add` is legal in EXECUTING.
        'bash-stage': true,
        'bash-mutate': true,
        'bash-commit': false,
        'luca-write': true,
        // Preserves today's behavior: EXECUTING['code-write'] is true, so a
        // changeset write is already legal here. Denying it would be a
        // regression, not a tightening of a new surface.
        'release-artifact': true,
    },
    REVIEWING: {
        'code-write': false,
        // General .luca/ writes blocked — reviewers must write via the
        // audit MCP tool, which lands at .luca/phases/<slug>/audits/<reviewer>.md
        'planning-write-general': false,
        'planning-write-audit': true,
        'bash-readonly': true,
        // Reviewers inspect; they do not stage a changeset.
        'bash-stage': false,
        'bash-mutate': false,
        'bash-commit': false,
        'luca-write': true,
        // Reviewers audit; they do not author release notes.
        'release-artifact': false,
    },
    FINALIZING: {
        'code-write': false,
        'planning-write-general': true,
        'planning-write-audit': true,
        'bash-readonly': true,
        // The grant this column exists for — finalize stages the changeset it
        // authored before committing.
        'bash-stage': true,
        'bash-mutate': false,
        'bash-commit': true,
        'luca-write': true,
        // The grant this column exists for — finalize authors the changeset.
        'release-artifact': true,
    },
}
