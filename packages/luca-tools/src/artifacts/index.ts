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
 *   3. Skills / commands / hooks — none yet. Skills come in a later
 *      Phase D-step or Phase E; hooks land in Phase E.
 *
 * No rules in the manifest yet either: rules live at
 * `.luca/rules/<id>.ts` and are loaded by luca-core/rule-engine at
 * runtime. The compiler accepts `RuleArtifact` for pass-through
 * bookkeeping; we don't ship any in this manifest.
 *
 * D-4 will point `--out` at the host repo's tracked artifact dirs to
 * supersede the hand-written copies under packages/luca-framework/.
 * D-3 ships only the TS source + verified compile output.
 */
import type { Artifact } from '../define/index.ts'

import { MODES } from './modes/index.ts'
import { SUBAGENTS } from './subagents/index.ts'

export { SUBAGENTS } from './subagents/index.ts'
export { MODES } from './modes/index.ts'

/**
 * Ordered list of every Artifact shipped with luca-tools today.
 * Subagents first, then modes. Stable order = deterministic compile
 * output across machines.
 */
export const ARTIFACTS: readonly Artifact[] = [...SUBAGENTS, ...MODES]

/**
 * The compile CLI's `--manifest` flag treats the default export as
 * the artifact list. Both `ARTIFACTS` and `default` resolve to the
 * same frozen array.
 */
export default ARTIFACTS
