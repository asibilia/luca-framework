# Working Memory

> Session-specific memory for the current workflow.

## Session Info

- **Started**: 2026-02-12
- **Workflow**: /lu-plan-phase 23
- **Phase**: 23 (Integration Testing)
- **Complexity**: COMPLEX
- **Branch**: 7--claude-code-plugin-distribution
- **Issue**: #7

---

## Memory Recall

- **Patterns**: Source-of-Truth Build Pipeline (Phase 17), Shared build module for single source of truth (Phase 22), Checksum-based before/after verification (Phase 22), Plugin compiler via format delegation (Phase 19), Layered verification (hooks + harness) (Phase 12)
- **Decisions**: Third compiler target (not replacing .claude/), GitHub marketplace over npm, Marketplace manifest follows Anthropic reference (Phase 22), Inline plugin generation over separate build-plugin.ts (Phase 22)
- **Pitfalls**: Marketplace manifest duplication between build and drift check (Phase 22), Editing .claude/ or .cursor/ directly causes drift, Wrong assertion counts from stale analysis (Phase 13)

## Planning Notes

- Phase 23 has 3 plans across 2 waves (from ROADMAP)
- CONTEXT.md decisions: spec-first no duplication, static validation only, structural + schema depth
- Existing drift tests already cover file existence, content parity, orphan detection
- Phase 23 adds spec-conformance validation layer on top

## Execution Notes

- Phase 23 executed: 3 plans, 2 waves, 41 new tests
- Wave 1 (23-01 + 23-02) ran in parallel without conflicts
- Wave 2 (23-03) depended on Wave 1 outputs (verified they existed)
- Pre-hotfix: removed legacy commands/ directory causing API 400 errors
- All 928 tests pass (887 existing + 41 new), 0 failures

## Candidate Learnings

- **Pattern: Spec-conformance layer separate from drift detection**: Two complementary test layers — drift tests verify compiler output matches source (parity), spec tests verify plugin format matches what Claude Code expects (conformance). Neither duplicates the other. Enables catching two distinct failure modes: "output drifted from source" vs "output doesn't match external spec"
- **Pattern: Comprehensive E2E summary test as final gate**: A single "load readiness" test that aggregates ALL validation checks (manifest, structure, frontmatter, hooks, marketplace) into one pass/fail with structured issue reporting provides a definitive "would this plugin load?" answer. Individual tests catch specific issues; the summary test catches the integration
- **Pitfall: hooks.json wrapper key**: hooks.json has a `{"hooks": {...}}` wrapper — the actual event types are under `.hooks`, not at the root. Forgetting this level causes tests to validate the wrong structure (just a single "hooks" key). Always access `hooksFile.hooks` before iterating event types

---

_Session Status_

- [x] Active
- [x] Learnings extracted
- [ ] Ready to clear
