/**
 * Public API barrel for the Luca framework package.
 *
 * Re-exports only — no logic, no registries, no constants.
 */

// CLI entry points
export { runMain, runInit } from './cli'

// Re-export types for consumers
export type { ProjectContext } from './types'

// Re-export version for consumers
export { LUCA_VERSION } from './utils/manifest'
