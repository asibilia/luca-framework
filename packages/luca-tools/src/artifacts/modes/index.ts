/**
 * Modes barrel — the 10 mode-agents authored as `defineAgent`
 * definitions in this package.
 *
 * Pipeline stages (in execution order): triage → research →
 * architect → execute → review → finalize. Stock utility modes
 * (not part of the pipeline): discuss, build, plan, fast.
 *
 * Each mode-agent's `instructions` field composes
 *   `${CORE_OPERATING_RULES}\n${stage body}\n${getAgentConstraints()}`
 * from the shared/ module, so the primacy + recency zones are
 * shared across every mode for prompt-cache reuse.
 *
 * The exported `MODES` array is the source the artifact manifest
 * pulls from; the order here is the order on disk.
 */

import { architectMode } from './architect.ts'
import { buildMode } from './build.ts'
import { discussMode } from './discuss.ts'
import { executeMode } from './execute.ts'
import { fastMode } from './fast.ts'
import { finalizeMode } from './finalize.ts'
import { planMode } from './plan.ts'
import { researchMode } from './research.ts'
import { reviewMode } from './review.ts'
import { triageMode } from './triage.ts'

import type { Artifact } from '../../define/index.ts'

export {
    architectMode,
    buildMode,
    discussMode,
    executeMode,
    fastMode,
    finalizeMode,
    planMode,
    researchMode,
    reviewMode,
    triageMode,
}

/**
 * Ordered list of every mode-agent shipped with luca-tools. Alphabetical
 * by id for diff-friendly output. The pipeline stage order is encoded in
 * the agent's `stage` field, not its position here.
 */
export const MODES: readonly Artifact[] = [
    architectMode,
    buildMode,
    discussMode,
    executeMode,
    fastMode,
    finalizeMode,
    planMode,
    researchMode,
    reviewMode,
    triageMode,
]
