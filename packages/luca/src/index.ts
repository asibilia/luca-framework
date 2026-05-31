/**
 * @alecsibilia/luca — the public umbrella package.
 *
 * This is the single distributable npm package for the Luca toolchain.
 * It bundles the three private sibling packages:
 *
 *   - @alecsibilia/luca-cli   — the `luca` command surface
 *   - @alecsibilia/luca-core  — deterministic logic (state, contracts,
 *                                 telemetry, complexity, etc.)
 *   - @alecsibilia/luca-tools — artifact definitions + compiler
 *
 * At build time, `unbuild` inlines the three private sibling packages
 * into a single `dist/index.mjs` (via `inlineDependencies: true`), so
 * end users `npm install @alecsibilia/luca` and get a self-contained
 * tarball — they never see the workspace-internal `luca-cli` /
 * `luca-core` / `luca-tools` names.
 *
 * Most consumers use the `luca` CLI binary (declared in `bin`) directly
 * rather than importing from this module. The library surface below is
 * intentionally minimal — it re-exports just enough of `luca-cli` for
 * advanced embedders that want to drive the CLI programmatically.
 *
 * See docs/repo-restructure-plan.md §4 + §6 (Phase F) for the rationale.
 */

// CLI entry points — re-exported so embedders can call `runMain()` from
// JS without spawning the bin.
export { runMain, runInit, LUCA_VERSION } from '@alecsibilia/luca-cli'

// Re-export the shared project-context type. Other types stay private
// to the sub-packages until a clear cross-package need surfaces.
export type { ProjectContext } from '@alecsibilia/luca-cli'
