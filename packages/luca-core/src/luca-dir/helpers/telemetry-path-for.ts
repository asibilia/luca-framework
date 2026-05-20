import { LUCA_DIR_ROOT } from '../constants.ts'
import { RunIdSchema } from '../schemas.ts'

/**
 * Build the path for a per-run telemetry log.
 */
export function telemetryPathFor(runId: string): string {
    RunIdSchema.parse(runId)
    return `${LUCA_DIR_ROOT}/telemetry/${runId}.jsonl`
}
