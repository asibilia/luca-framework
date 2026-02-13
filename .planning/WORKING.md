# Working Memory

## Session Info

- **Started**: 2026-02-12
- **Workflow**: /phase-plan 24
- **Phase**: 24 — Build Pipeline Consolidation

## Memory Recall

### Patterns

- **Source-of-Truth Build Pipeline** [Phase 17]: `src/` → `bun run build:all` → `.claude/` + `.cursor/`. Registries in `src/*/index.ts`. NEVER edit output files directly.
- **Shared build module for single source of truth** [Phase 22]: Extract to `build-shared.ts` that all consumers import from. Guarantees byte-identical output between build and drift checker.
- **Checksum-based before/after verification** [Phase 22]: SHA-256 checksums before/after refactoring, then diff. Zero diffs confirms behavior-preserving.
- **Platform-specific path generators from shared registry** [Phase 19]: Same registry data → different platform output formats via per-platform config generators.

### Decisions

- **Inline plugin generation over separate build-plugin.ts** [Phase 22]: Inline into build-all.ts, extract shared to build-shared.ts.
- **Marketplace manifest follows Anthropic reference** [Phase 22]: Flat root-level fields, `source: "."`, `category: "development"`.

### Pitfalls

- **Marketplace manifest duplication** [Phase 22]: Manifest defined inline in both build-all.ts and check-drift.ts. Not extracted because it contains runtime `version`. This is exactly what DEDUP-02 addresses.
- **`|| true` swallows exit codes**: Use `set +e; cmd; EXIT=$?; set -e` instead.
- **Shell variable interpolation in bun -e strings**: Pass via env vars.

### Intuition Flags

- OPPORTUNITY: Phase 22 already created `build-shared.ts` — we're extending an established pattern, not creating one.
- CAUTION: Three consumers (build-all.ts, check-drift.ts, check-drift.test.ts) must stay byte-identical in output after refactoring. Use checksum verification.
- RISK: Hook config unification (DEDUP-04) crosses module boundary (build-shared.ts ↔ src/hooks/index.ts). Careful with import graph.

## Planning Notes

<!-- Log planning decisions as they're made -->

---

_Session Status_

- [x] Active
- [ ] Learnings extracted
- [ ] Ready to clear
