// Barrel exports for the checks domain.
// Pure parsers that turn check-tool output into structured errors.
// Parser registry + fingerprinting land in a following increment.

export { ParsedErrorSchema } from './schemas.ts'
export type { ParsedError, OutputParser } from './schemas.ts'

export { parseTscOutput } from './helpers/parse-tsc.ts'
export { parseGenericOutput } from './helpers/parse-generic.ts'
