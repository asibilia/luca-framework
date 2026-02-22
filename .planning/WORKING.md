# Working Memory

## Session Info

- **Started**: 2026-02-21
- **Workflow**: /phase-execute
- **Phase**: 50 — Bun Convention Alignment (COMPLETE)

Auto-persisted at 2026-02-22T00:38:54Z (zone: stop)

## Memory Recall

- **Patterns**: CLI entry point with import.meta.main instead of CJS require.main (Phase 12); Bun.$ for shell commands per CLAUDE.md
- **Decisions**: Bun-first runtime, execa→Bun.$, npm/npx→bun/bunx in user-facing messages
- **Pitfalls**: CJS require('fs') in ESM module may work at runtime but violates conventions
- **Procedures**: None active

## Execution Findings

- Phase 50 executed in 1 wave, 7 tasks (+ 1 bonus task T4b)
- Bun.$ tagged template syntax requires `.quiet()` to suppress stdout; `.text()` to extract output
- Test mock infrastructure redesigned: `mock-shell.ts` replaces `mock-execa.ts`, overrides `Bun.$` on the global
- Bonus discovery: config-validation.ts had 7 additional npx references not identified in audit
- readFileSync from "node:fs" via ESM import is the correct pattern for synchronous file reads in Bun (Bun.file is async-only)

## Candidate Learnings

- **Pattern**: Bun.$ mock strategy — override `Bun.$` on the global, record raw command strings, return configurable responses
- **Pitfall**: When migrating execa→Bun.$, check ALL source files for npm/npx references (not just the ones identified in audit)
- **Decision**: For synchronous file operations in ESM modules, use `readFileSync` from `"node:fs"` via ESM import, not `Bun.file()`

---

_Session Status_

- [x] Active
- [ ] Learnings extracted
- [ ] Ready to clear
