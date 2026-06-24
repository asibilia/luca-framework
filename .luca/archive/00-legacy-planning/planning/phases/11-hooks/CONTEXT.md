# Phase 11: Hook Script Consolidation & Security — Context

## Gray Area Decisions

### 1. Shared Shell Library Structure

**Decision:** Single `_lib/common.sh` file containing all three shared functions (`run_bridge()`, `read_runtime()`, `read_session_id()`), sourced by all hook scripts via `BASH_SOURCE[0]` path resolution (e.g., `source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib/common.sh"`). This is more portable than env var approaches — no dependency on `LUCA_HOOKS_DIR` or similar env vars.

**Build pipeline:** `scripts/build-shared.ts` already copies hook scripts verbatim from `src/hooks/scripts/` to `.claude/hooks/`, `.cursor/hooks/`, `.pi/hook-scripts/`. Extend this to also copy the `_lib/` directory alongside the scripts.

**Rationale:**

- 3 functions totaling ~40 lines — too small to split across multiple files
- 6 scripts duplicate `run_bridge()`, 3 duplicate `read_runtime()`, 5 occurrences of session ID extraction across 4 scripts — all byte-identical
- Single file keeps `source` calls simple and reduces build complexity

[researched]

### 2. MODEL_ROUTING_TABLE Consolidation

**Decision:** Address both issues:

- **Issue A (DRY):** Consolidate the 343-line table using named presets (e.g., `CLASSIFIER`, `ORCHESTRATOR`, `DEEP_ANALYSIS`, `REVIEWER`) that map to per-complexity tiers. 17 agents share identical row patterns — collapse them into ~5 presets referenced by agent name.
- **Issue B (Dual-source):** Resolve the dual-source problem where agent frontmatter `model_routing` can override the centralized table at runtime. Establish one authoritative source — the table — and remove or deprecate the frontmatter override path.

**Target:** Reduce from ~260 lines to ~120 lines while eliminating the ambiguity of two sources of truth.

[user-input]

### 3. Shell Injection Fix Scope

**Decision:** Include the Pi `hook-handlers.ts:86` filePath injection fix in Phase 11 scope. The pattern uses `$PROJECT_DIR` interpolated into `bun -e` JS strings instead of the safer `process.env.PROJECT_DIR` pattern.

**Rationale:** Same class of vulnerability as the hook script fixes — logical to consolidate all injection pattern fixes in one phase.

[user-input]

### 4. harnessFixIterations Divergence

**Decision:** Fixed immediately (pre-planning). Changed `packages/luca-framework/src/state/defaults.ts` COMPLEX level from `harnessFixIterations: 3` to `harnessFixIterations: 2` to match the canonical source in `src/complexity/__helpers/defaults.ts`.

**Status:** RESOLVED — not included in Phase 11 plans.

[user-input]
