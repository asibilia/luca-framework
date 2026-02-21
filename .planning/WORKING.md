# Working Memory

## Session Info

- **Started**: 2026-02-16
- **Workflow**: autopilot (full-auto)
- **Phase**: v1.7.0 — Codebase Health & Build Stability

Auto-persisted at 2026-02-17T02:13:56Z (zone: stop)

Auto-persisted at 2026-02-17T02:51:00Z (zone: stop)

## Memory Recall

- **Patterns**: Build pipeline as correctness gate, drift detection, git mv for history
- **Decisions**: Bun-first, functional (no classes), centralized **tests**/
- **Pitfalls**: NEVER edit .claude/.cursor directly, plan-checker catches real gaps
- **Procedures**: —

## Planning Notes

- 10 pending todos scanned, all unplanned (not in roadmap)
- WSJF scoring complete: 7 items grouped into v1.7.0, 3 deferred to v1.8.0+
- GitHub issue #18 created, branch 18--v1.7.0-codebase-health-build-stability
- 5 phases planned: 44 (hygiene), 45 (tsc), 46 (pkg config), 47 (tests), 48 (bun migration)
- Phase 47 and 48 depend on Phase 45

## Findings

- Phase 44: coverage/ and .DS_Store already clean; renamed 2 snake_case rule files to kebab-case; removed empty .planning/ in luca-state
- Phase 45: 98 TypeScript errors fixed to 0 across 29 files (source, scripts, tests)
- Phase 46: Added main/module/types to 3 package.json files; created 2 missing tsconfig.json files
- Phase 47: 37 test files consolidated from scattered locations into **tests**/; fixed ROOT path in check-drift
- Phase 48: 7 files migrated from Node.js fs to Bun.file/Bun.write; existsSync kept for directory checks

## Candidate Learnings

- `Bun.file().exists()` returns false for directories — use `existsSync` from node:fs for directory checks
- `import type` is required for type-only imports when verbatimModuleSyntax is enabled
- Registry tests must match registry keys exactly (kebab-case, not snake_case)
- `path.resolve(import.meta.dir, "..")` must be updated when test files move deeper in directory structure

---

_Session Status_

- [ ] Active
- [x] Learnings extracted
- [ ] Ready to clear


---
*Session ended: 2026-02-21T22:35:14Z (reason: prompt_input_exit)*
