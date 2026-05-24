/**
 * Shadow-scan public surface.
 *
 * **Intentionally dropped during the Phase B port** (no `console.warn`
 * port-header until now — this comment closes that gap, audit ref CF4):
 *
 *   - `ShadowDebtConfigSchema`     — user-configurable scan-mode/category
 *   - `loadShadowDebtConfig`       — config file reader
 *   - `determineScanMode`          — chose `quick | standard | full`
 *   - `SCAN_MODE_CATEGORIES`       — `.planning/`-vs-`.luca/` allowlists
 *
 * Rationale: the shadow-scanner now operates with sensible defaults; the
 * config layer was over-built for the single in-tree consumer. If
 * user-configurable scan modes are needed, the dropped surface can be
 * re-ported from git history at
 * `fd0b169be^:packages/luca-mastracode/src/state/shadow-scanner.ts`.
 *
 * If you're reading this because a downstream user requested
 * customization, prefer porting a minimal surface (just
 * `ShadowDebtConfigSchema` + `loadShadowDebtConfig`) over restoring the
 * full layer — `SCAN_MODE_CATEGORIES`' `.planning/` allowlist is itself
 * legacy and would need rework against `LUCA_DIR_CONTRACT`.
 */
export {
    ShadowScanFindingSchema,
    ShadowScanReportSchema,
    ShadowScanSummarySchema,
    ShadowScanSeverity,
    ShadowScanAction,
    ShadowScanMode,
} from './schemas.ts'

export type {
    ShadowScanFinding,
    ShadowScanReport,
    ShadowScanSummary,
} from './schemas.ts'
