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
 *   1. Subagents — Task-tool-spawnable workers (8 of them: discussion,
 *      executor, learner, plan-reviewer, researcher, reviewer,
 *      shadow-scanner, verifier; v12-era planner + fix were dropped
 *      per plan §5.6).
 *   2. Modes — top-level pipeline stages + stock utility modes (10).
 *   3. Hooks — Claude Code lifecycle hooks. Phase E lands them in
 *      sequence:
 *        - E-1: `pipeline-guard` (PreToolUse[Bash], vets
 *          `luca state advance` transitions).
 *        - E-2: (removed) `read-only-enforcement` — superseded by the
 *          target-aware stage-gate hook in luca-cli, which is the
 *          authoritative gate and correctly allows the legal `.luca/`
 *          artifact write for each read-only step.
 *        - E-3: `continuation-messages` (PostToolUse[Bash], surfaces a
 *          mode-entry kick-off prompt via additionalContext when the
 *          pipeline successfully advances).
 *        - E-4: `context-refresher` (PostToolUse[*], surfaces a per-step
 *          luca-reminder every Nth tool call or on step change).
 *   4. Skills — user-facing slash-command workflows (41 of them after
 *      E-5 + the M3 bug-diagnose port: the user-listed core/peripheral/
 *      utility set plus the Luca-pipeline-essential extras like
 *      seed-memory, session-*, autopilot, etc.). Each skill compiles to
 *      `skills/<name>/SKILL.md`.
 *   5. Commands — `/<name>` filesystem surface for the slash-command
 *      picker (17 of them after E-6). Most user-facing artifacts have
 *      BOTH a SKILL.md and a commands/<name>.md — the command bodies
 *      are tighter "do this right now" prompts, distinct from the
 *      SKILL.md procedural guides. Each command compiles to
 *      `.claude/commands/<name>.md`.
 *
 * D-4 will point `--out` at the host repo's tracked artifact dirs to
 * supersede the hand-written copies under packages/luca-framework/.
 * D-3 ships only the TS source + verified compile output.
 */
import type { Artifact } from '../define/index.ts'

import { HOOKS } from '../hooks/index.ts'

import { COMMANDS } from './commands/index.ts'
import { MODES } from './modes/index.ts'
import { SKILLS } from './skills/index.ts'
import { SUBAGENTS } from './subagents/index.ts'

export { SUBAGENTS } from './subagents/index.ts'
export { MODES } from './modes/index.ts'
export { HOOKS } from '../hooks/index.ts'
export { SKILLS } from './skills/index.ts'
export { COMMANDS } from './commands/index.ts'

/**
 * Ordered list of every Artifact shipped with luca-tools today.
 * Subagents first, then modes, then hooks, then skills, then commands.
 * Stable order = deterministic compile output across machines.
 */
export const ARTIFACTS: readonly Artifact[] = [
    ...SUBAGENTS,
    ...MODES,
    ...HOOKS,
    ...SKILLS,
    ...COMMANDS,
]

/**
 * The compile CLI's `--manifest` flag treats the default export as
 * the artifact list. Both `ARTIFACTS` and `default` resolve to the
 * same frozen array.
 */
export default ARTIFACTS
