import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { lucaStateSchemaTolerant, type LucaState } from '../schemas.ts'

export interface LoadCurrentStateOptions {
    cwd: string
}

/**
 * Read .luca/state.json and return the validated workflow state.
 *
 * Returns the schema defaults (pipelineStep idle, everything else default)
 * when the file is missing OR malformed — this preserves the "permissive
 * when not initialized" contract from
 * decision:luca-stage-tool-matrix-2026-05-19.
 *
 * Uses the tolerant schema so legacy mastracode fields (profile,
 * workflowVersion, skipBranch) and legacy pipelineStep values (classify,
 * configure, cleanup, etc.) parse cleanly during the migration window.
 */
export async function loadCurrentState(
    opts: LoadCurrentStateOptions
): Promise<LucaState> {
    const statePath = join(opts.cwd, '.luca', 'state.json')
    if (!existsSync(statePath)) {
        return lucaStateSchemaTolerant.parse({})
    }
    try {
        const raw = JSON.parse(await readFile(statePath, 'utf-8'))
        const result = lucaStateSchemaTolerant.safeParse(raw)
        if (!result.success) {
            return lucaStateSchemaTolerant.parse({})
        }
        return result.data
    } catch {
        return lucaStateSchemaTolerant.parse({})
    }
}
