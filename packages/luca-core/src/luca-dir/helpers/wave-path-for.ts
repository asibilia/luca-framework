import { LUCA_DIR_ROOT } from '../constants.ts'
import { PhaseSlugSchema, WaveNumberSchema } from '../schemas.ts'

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * Build the path for a wave summary file under execute/waves/.
 *
 * @param slug   - Phase slug
 * @param waveN  - Wave number (0–99); zero-padded in the resulting filename
 */
export function wavePathFor(slug: string, waveN: number): string {
    PhaseSlugSchema.parse(slug)
    WaveNumberSchema.parse(waveN)
    return `${LUCA_DIR_ROOT}/phases/${slug}/execute/waves/${pad2(waveN)}.md`
}
