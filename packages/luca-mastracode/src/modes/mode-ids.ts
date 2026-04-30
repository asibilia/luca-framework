/**
 * Mode IDs — single source of truth.
 *
 * Every place in `luca-mastracode` that needs to refer to a pipeline
 * mode should import from this module rather than hand-typing the
 * `'luca:<n>-<name>'` literal. A typo in a hand-typed mode string
 * routes silently to "unknown mode" with no compile error.
 *
 * Markdown instruction files (`instructions/*.md`) are intentionally
 * left as plain literals — they are LLM prompts, not TypeScript, and
 * cannot import from a module. The constants here are a `as const`
 * tuple-ish object so renames in TypeScript propagate via the
 * compiler, and the canonical names match the prompt strings.
 *
 * If you need the bare alias (`'execute'` instead of `'luca:4-execute'`)
 * for legacy-state migration, use `BARE_TO_MODE_ID` in `luca-store.ts`.
 */
export const MODES = {
    discuss: 'luca:discuss',
    triage: 'luca:1-triage',
    research: 'luca:2-research',
    architect: 'luca:3-architect',
    execute: 'luca:4-execute',
    review: 'luca:5-review',
    finalize: 'luca:6-finalize',
} as const

export type ModeKey = keyof typeof MODES
export type ModeId = (typeof MODES)[ModeKey]

/** All mode IDs as a frozen array. Order matches the canonical pipeline progression. */
export const ALL_MODE_IDS: readonly ModeId[] = [
    MODES.discuss,
    MODES.triage,
    MODES.research,
    MODES.architect,
    MODES.execute,
    MODES.review,
    MODES.finalize,
] as const

/** Modes that participate in the auto-pipeline (excludes one-off `discuss`). */
export const PIPELINE_MODE_IDS: readonly ModeId[] = [
    MODES.triage,
    MODES.research,
    MODES.architect,
    MODES.execute,
    MODES.review,
    MODES.finalize,
] as const

/**
 * Type guard — narrows an arbitrary string to ModeId.
 */
export function isModeId(value: unknown): value is ModeId {
    return (
        typeof value === 'string' &&
        (ALL_MODE_IDS as readonly string[]).includes(value)
    )
}
