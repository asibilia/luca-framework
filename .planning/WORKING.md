# Working Memory

## Session Info

- **Started**: 2026-02-13
- **Workflow**: /phase-plan 27
- **Phase**: 27 — Security Hardening

## Memory Recall

### Patterns

- **Defense-in-depth validation** [Phase 6]: Apply validation at both config ingestion AND usage site. Prevents regressions from future refactoring.
- **Credential sanitization pattern** [Phase 6]: Use regex chain to strip Basic, Bearer, Base64, token= patterns from error messages.
- **Zod safeParse at API boundaries** [Phase 6]: Replace `as TypeName` casts with `zodSchema.safeParse()` for runtime validation.
- **Dual-format stdin/stdout for cross-platform hooks** [Phase 11]: Shell scripts handle both Claude Code and Cursor stdin JSON with nullish coalescing fallbacks.
- **Plan-checker bug prevention** [Phase 11]: Caught `|| true` swallowing exit codes and wrong APIs in hooks.

### Decisions

- **Bun preference**: Use Bun APIs over node:fs per CLAUDE.md and bun-preference rule.
- **Shell scripts for hooks**: `.claude/hooks/` and `.cursor/hooks/` use bash scripts with JSON stdin/stdout.

### Pitfalls

- **Pre-existing test failures mask new ones** [testing]: 6 pre-existing skips in executeDoctor/configValidationCheck.
- **Hook scripts parse JSON from stdin**: Scripts use `jq` or `bun -e` to parse stdin. Input validation must handle malformed JSON gracefully.

### Intuition Flags

- CAUTION: Hook scripts are security-sensitive — they execute with the user's permissions and receive file paths from the IDE/CLI. Path traversal and injection are real risks.
- CAUTION: `cleanDirectory()` in `build-utils.ts` performs recursive deletion — a root path guard prevents accidental deletion outside expected output dirs.
- OPPORTUNITY: All 5 SEC requirements are LOW severity — surgical fixes with clear scope.

## Planning Notes

<!-- Log planning decisions as they're made -->

---

_Session Status_

- [x] Active
- [ ] Learnings extracted
- [ ] Ready to clear
