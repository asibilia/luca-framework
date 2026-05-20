import {
    LUCA_DIR_ROOT,
    PHASE_FILE_PATHS,
    type PhaseFile,
} from '../constants.ts'
import { PhaseSlugSchema } from '../schemas.ts'

/**
 * Build the path for a phase artifact.
 *
 * @param slug   - Phase slug, e.g. "01-auth-rewrite"
 * @param file   - Named phase artifact; omit for the phase directory itself
 * @returns Project-relative path under .luca/phases/<slug>/
 */
export function phasePathFor(slug: string, file?: PhaseFile): string {
    PhaseSlugSchema.parse(slug)
    const base = `${LUCA_DIR_ROOT}/phases/${slug}`
    if (!file) return base
    return `${base}/${PHASE_FILE_PATHS[file]}`
}
