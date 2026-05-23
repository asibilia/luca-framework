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

import { pipelineGuardHook } from './pipeline-guard/index.ts'
import {
    READ_ONLY_ENFORCEMENT_HOOKS,
    readOnlyEnforcementEditHook,
    readOnlyEnforcementNotebookEditHook,
    readOnlyEnforcementWriteHook,
} from './read-only-enforcement/index.ts'

export { pipelineGuardHook } from './pipeline-guard/index.ts'
export {
    READ_ONLY_ENFORCEMENT_HOOKS,
    readOnlyEnforcementEditHook,
    readOnlyEnforcementNotebookEditHook,
    readOnlyEnforcementWriteHook,
} from './read-only-enforcement/index.ts'

/**
 * Stable-ordered list of every hook in this package.
 *
 * Order:
 *   1. pipeline-guard (E-1) — Bash matcher, guards `luca state advance`.
 *   2. read-only-enforcement (E-2, three sibling slices) — Write/Edit/
 *      NotebookEdit matchers, gates write tools in read-only steps.
 *
 * Per-event order in the compiled settings.json is determined by the
 * compile pipeline (HOOK_EVENT_ORDER); intra-event order tracks this
 * list.
 */
export const HOOKS: readonly HookDefinition[] = [
    pipelineGuardHook,
    ...READ_ONLY_ENFORCEMENT_HOOKS,
]
