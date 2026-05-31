import { parseBunTestOutput } from './parse-bun-test.ts'
import { parseEslintOutput } from './parse-eslint.ts'
import { parseGenericOutput } from './parse-generic.ts'
import { parseTscOutput } from './parse-tsc.ts'

import type { OutputParser } from '../schemas.ts'

/**
 * Maps a check name to a factory for its output parser.
 *
 * Ported from luca-mastracode `tools/parsers/parser-registry.ts`.
 */
export const parserRegistry: Record<string, () => OutputParser> = {
    tsc: () => parseTscOutput,
    'bun-test': () => parseBunTestOutput,
    eslint: () => parseEslintOutput,
    generic: () => parseGenericOutput,
}
