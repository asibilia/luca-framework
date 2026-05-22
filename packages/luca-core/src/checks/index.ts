// Barrel exports for the checks domain.
// Pure parsers that turn check-tool output into structured errors.

export { ParsedErrorSchema } from './schemas.ts'
export type { ParsedError, OutputParser } from './schemas.ts'

export { parseTscOutput } from './helpers/parse-tsc.ts'
export { parseGenericOutput } from './helpers/parse-generic.ts'
export { parseEslintOutput } from './helpers/parse-eslint.ts'
export { parseBunTestOutput } from './helpers/parse-bun-test.ts'
export { parserRegistry } from './helpers/parser-registry.ts'
export { parseAndFingerprint } from './helpers/parse-and-fingerprint.ts'
export type { FingerprintedError } from './helpers/parse-and-fingerprint.ts'
