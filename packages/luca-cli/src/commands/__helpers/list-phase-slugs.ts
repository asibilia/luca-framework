import { existsSync, readdirSync } from 'node:fs'

import { join } from 'pathe'

import { PHASE_SLUG_RE } from '@alecsibilia/luca-core'

/** List the valid phase slugs present under `.luca/phases/`. */
export function listPhaseSlugs(cwd: string): string[] {
    const phasesDir = join(cwd, '.luca', 'phases')
    if (!existsSync(phasesDir)) return []
    try {
        return readdirSync(phasesDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && PHASE_SLUG_RE.test(e.name))
            .map((e) => e.name)
    } catch {
        return []
    }
}
