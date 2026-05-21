import {
    STAGE_TOOL_MATRIX,
    type ToolCategory,
} from '../configs/stage-tool-matrix.ts'
import type { CoarsePhase } from '../schemas.ts'

export type { ToolCategory } from '../configs/stage-tool-matrix.ts'

/**
 * Look up the stage-gate matrix to determine whether a given tool category
 * is permitted in the given coarse phase.
 *
 * Pure, deterministic. Used by the stage-gate hook to make allow/deny
 * decisions after the hook layer has classified the raw tool call.
 */
export function isToolAllowed({
    phase,
    category,
}: {
    phase: CoarsePhase
    category: ToolCategory
}): boolean {
    return STAGE_TOOL_MATRIX[phase][category]
}
