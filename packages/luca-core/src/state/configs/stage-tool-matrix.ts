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
    | 'bash-mutate'
    | 'bash-commit'
    // v13 write-surface: a Bash `luca <noun> <write-verb>` invocation. The
    // `luca` CLI self-enforces each verb's per-step phase precondition
    // (see WRITE_COMMAND_PHASES), so the matrix only needs to NOT block it
    // in non-IDLE phases — it is allowed everywhere except, trivially,
    // IDLE (which is permissive anyway).
    | 'luca-write'

/**
 * Coarse-phase → tool-category allow matrix.
 *
 * Source of truth: decision:luca-stage-tool-matrix-2026-05-19. IDLE is
 * permissive (no enforcement). Every other phase has explicit allow/deny
 * for each category.
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
        'bash-mutate': true,
        'bash-commit': true,
        'luca-write': true,
    },
    PLANNING: {
        'code-write': false,
        'planning-write-general': true,
        'planning-write-audit': true,
        'bash-readonly': true,
        'bash-mutate': false,
        'bash-commit': false,
        'luca-write': true,
    },
    EXECUTING: {
        'code-write': true,
        'planning-write-general': true,
        'planning-write-audit': true,
        'bash-readonly': true,
        'bash-mutate': true,
        'bash-commit': false,
        'luca-write': true,
    },
    REVIEWING: {
        'code-write': false,
        // General .luca/ writes blocked — reviewers must write via the
        // audit MCP tool, which lands at .luca/phases/<slug>/audits/<reviewer>.md
        'planning-write-general': false,
        'planning-write-audit': true,
        'bash-readonly': true,
        'bash-mutate': false,
        'bash-commit': false,
        'luca-write': true,
    },
    FINALIZING: {
        'code-write': false,
        'planning-write-general': true,
        'planning-write-audit': true,
        'bash-readonly': true,
        'bash-mutate': false,
        'bash-commit': true,
        'luca-write': true,
    },
}
