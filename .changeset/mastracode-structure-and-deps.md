---
"@alecsibilia/luca-mastracode": minor
---

Restructure package internals and upgrade mastracode to v0.17.0.

**Refactoring:**
- Reorganize `src/` root (28 files → 6 layered subdirectories: `state/`, `orchestration/`, `analysis/`, `integration/`, `util/`, `constants/`)
- Rename `pr-review/` → `review-analysis/`, `rules/` → `rule-engine/`; add barrel exports
- Consolidate `build-mode-tools.ts` + `mode-permissions.ts` → `tool-manifest.ts` (single source of truth for all 15 tools and per-mode permissions)
- Extract upstream patches and read-only enforcement from `launch.ts` into dedicated modules (`launch.ts` reduced from 1185 → 700 lines)

**Dependencies:**
- Upgrade `mastracode` 0.16.2 → 0.17.0, `@mastra/core` 1.30.0 → 1.31.0, `@mastra/libsql` 1.9.0 → 1.9.1
- Migrate `authStorage` API: removed from `LaunchOptions`, now retrieved via `harness.getAuthStorage()`

**Documentation:**
- Add package `README.md` (dual-layer pattern guide, directory map, add-tool/add-mode checklists)
- Add `ARCHITECTURE.md` (layer dependency graph, subdirectory inventory, design decisions)
