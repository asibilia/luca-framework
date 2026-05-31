/**
 * Hooks manifest — the canonical list of `HookDefinition`s shipped
 * with luca-tools.
 *
 * Each hook lives in its own subdirectory alongside its handler
 * source (e.g. `hooks/pipeline-guard/index.ts` for the definition
 * and `hooks/pipeline-guard/handler.ts` for the bun-script handler
 * the harness invokes).
 *
 * Order is fixed so the compile output is byte-stable across runs.
 */
import type { HookDefinition } from '../define/index.ts'

import { continuationMessagesHook } from './continuation-messages/index.ts'
import { contextRefresherHook } from './context-refresher/index.ts'
import { pipelineGuardHook } from './pipeline-guard/index.ts'

export { contextRefresherHook } from './context-refresher/index.ts'
export { continuationMessagesHook } from './continuation-messages/index.ts'
export { pipelineGuardHook } from './pipeline-guard/index.ts'

/**
 * Stable-ordered list of every hook in this package.
 *
 * Order:
 *   1. pipeline-guard (E-1) — PreToolUse[Bash], guards `luca state advance`.
 *   2. continuation-messages (E-3) — PostToolUse[Bash], surfaces a
 *      mode-entry kick-off prompt after a successful pipeline advance.
 *   3. context-refresher (E-4) — PostToolUse[*], surfaces a per-step
 *      <luca-reminder> after every Nth tool call (default 30) or on a
 *      step change since the last fire.
 *
 * NOTE: the former read-only-enforcement hook (E-2) was removed — the
 * stage-gate hook in luca-cli is the authoritative gate and is
 * target-aware (`artifactPathGate`), correctly allowing the legal
 * `.luca/` artifact write for each read-only step. The standalone
 * enforcement hint blocked every Write/Edit/NotebookEdit in PLANNING /
 * REVIEWING regardless of path, defeating the freeform-artifact design,
 * so it was dropped rather than patched.
 *
 * Per-event order in the compiled settings.json is determined by the
 * compile pipeline (HOOK_EVENT_ORDER); intra-event order tracks this
 * list. context-refresher follows continuation-messages within the
 * PostToolUse array — continuation runs first (per-event order matches
 * registration order) so that on a step-advance Bash invocation the
 * agent receives the kick-off message before the refresher reminder.
 */
export const HOOKS: readonly HookDefinition[] = [
    pipelineGuardHook,
    continuationMessagesHook,
    contextRefresherHook,
]
