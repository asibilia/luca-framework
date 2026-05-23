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

export { pipelineGuardHook } from './pipeline-guard/index.ts'

/** Stable-ordered list of every hook in this package. */
export const HOOKS: readonly HookDefinition[] = [pipelineGuardHook]
