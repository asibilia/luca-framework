# Working Memory

## Session Info

- **Started**: 2026-02-13
- **Workflow**: /phase-plan 25
- **Phase**: 25 — Test & API Cleanup

## Memory Recall

### Patterns

- **Shared build module for single source of truth** [Phase 22/24]: `build-shared.ts` is the central hub. Phase 24 extended this with `generateAllOutputs()`. All build consumers import from here.
- **Map-based in-memory compilation pipeline** [Phase 24]: `generateAllOutputs()` returns `Map<string, string>`. Consumers iterate for their I/O purpose.
- **Plan file lists undercount affected consumers** [Phase 24]: Always run full test suite after refactoring to discover unlisted consumers.

### Decisions

- **Bun preference**: Use Bun APIs over node:fs per CLAUDE.md and bun-preference rule.
- **YAML frontmatter for compiled agents** [Phase 15]: Compiler emits config as YAML frontmatter.

### Pitfalls

- **Cross-package import failures** [Phase 6]: TypeScript resolves src/shared/ imports but module resolution fails at runtime. Use self-contained modules.
- **Pre-existing test failures mask new ones** [testing]: 6 pre-existing failures in executeDoctor/configValidationCheck from process.cwd() mocking. Track separately.

### Intuition Flags

- OPPORTUNITY: Phase 24 already consolidated build-shared.ts — test helpers extraction follows the same pattern (centralize, then update consumers).
- CAUTION: check-drift.test.ts was heavily refactored in Phase 24 (Plan 24-02). Need to read the current version, not assume the audit findings still match line numbers.
- CAUTION: BUN-01 (build-utils.ts migration) touches filesystem utilities used by build pipeline — changes here affect build:all and check:drift.

## Planning Notes

<!-- Log planning decisions as they're made -->

---

_Session Status_

- [x] Active
- [ ] Learnings extracted
- [ ] Ready to clear
