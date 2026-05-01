/**
 * Parser registry for the verification checks.
 *
 * Maps parser names (used in CheckConfig.parser) to their implementation
 * functions. Follows the registry pattern used by agents/skills/rules/hooks.
 */

import { parseBunTestOutput } from './bun-test.js'
import { parseEslintOutput } from './eslint.js'
import { parseGenericOutput } from './generic.js'
import { parseTscOutput } from './tsc.js'

import type { OutputParser } from '../checks-schemas.js'

export const parserRegistry: Record<string, () => OutputParser> = {
    tsc: () => parseTscOutput,
    'bun-test': () => parseBunTestOutput,
    eslint: () => parseEslintOutput,
    generic: () => parseGenericOutput,
}
