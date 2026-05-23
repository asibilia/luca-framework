/**
 * Artifacts manifest — the single source of truth for every artifact
 * compiled by `bun run --filter @alecsibilia/luca-tools compile:artifacts`.
 *
 * The compiler's CLI (`src/compile/bin/compile.ts`) accepts a manifest
 * module via `--manifest <path>` and treats its default export as
 * `Artifact[]`. This file exports the canonical list as the default
 * AND as a named `ARTIFACTS` constant so consumers in this package can
 * import the list directly without going through the compiler CLI.
 *
 * Order on disk:
 *   1. Subagents — Task-tool-spawnable workers (7 of them after
 *      dropping planner + fix per plan §5.6).
 *   2. Modes — top-level pipeline stages + stock utility modes (10).
 *   3. Hooks — Claude Code lifecycle hooks. Phase E lands them in
 *      sequence:
 *        - E-1: `pipeline-guard` (PreToolUse[Bash], vets
 *          `luca state advance` transitions).
 *        - E-2: `read-only-enforcement` (three sibling slices,
 *          PreToolUse[Write|Edit|NotebookEdit], blocks write tools in
 *          read-only pipeline steps).
 *        - E-3: `continuation-messages` (PostToolUse[Bash], surfaces a
 *          mode-entry kick-off prompt via additionalContext when the
 *          pipeline successfully advances).
 *
 * No skills/commands/rules in the manifest yet. Skills come in a
 * later Phase D-step or Phase E follow-up.
 *
 * D-4 will point `--out` at the host repo's tracked artifact dirs to
 * supersede the hand-written copies under packages/luca-framework/.
 * D-3 ships only the TS source + verified compile output.
 */
import type { Artifact } from '../define/index.ts'

import { HOOKS } from '../hooks/index.ts'

import { MODES } from './modes/index.ts'
import { SUBAGENTS } from './subagents/index.ts'

export { SUBAGENTS } from './subagents/index.ts'
export { MODES } from './modes/index.ts'
export { HOOKS } from '../hooks/index.ts'

/**
 * Ordered list of every Artifact shipped with luca-tools today.
 * Subagents first, then modes, then hooks. Stable order =
 * deterministic compile output across machines.
 */
export const ARTIFACTS: readonly Artifact[] = [
    ...SUBAGENTS,
    ...MODES,
    ...HOOKS,
]

/**
 * The compile CLI's `--manifest` flag treats the default export as
 * the artifact list. Both `ARTIFACTS` and `default` resolve to the
 * same frozen array.
 */
export default ARTIFACTS
