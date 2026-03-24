# Pre-Mortem Risk Brief — Phase 9

**Phase:** 9 — v2 Research Infrastructure + Review Loop + MuninnDB Graduation
**Complexity:** COMPLEX
**Scenarios:** 3

## Risk 1: Schema Rejection of New Agent Frontmatter at Build Time

Eight new agents are authored across three sub-phases. The `AgentConfigSchema` validates via `createAgent()` which throws on invalid fields. Researchers need `purpose: "researcher"` and reviewers need appropriate `purpose` and `isolation: "cold"` values — if the executor uses values not in the existing enums (`PurposeCategorySchema`, `CognitionTierSchema`, `contextConfigSchema.isolation`), validation throws at build time (invisible during implementation).

**Mitigation:** Before authoring any new agent file, read `src/agents/__schemas/agent.schemas.ts` to confirm all enum values are valid. Treat the enum list as an implementation-time gate.

**Plan constraint:** Gate all `createAgent()` calls behind an enum verification step.

## Risk 2: Convergence Loop Exits on Iteration 1 Due to Missing Gap-ID Wiring

The convergence model requires reviewer agents to return structured gap objects with prefixed IDs (G-COMP-001, G-ACC-001, G-ACT-001). If `phase-research-review` parses reviewer output as free-form markdown instead of extracting structured gap objects, it cannot reliably count CRITICAL gaps — halting prematurely or never halting.

**Mitigation:** Define the reviewer output contract as a narrow, parseable format in reviewer agent prompts before writing loop logic. Build gap-count extraction function first, then build loop around it.

**Plan constraint:** Output-contract-first design for convergence loop.

## Risk 3: research:\* Vault Routing Silently Writes to Wrong Vault

`vault-guard.md` at `~/.claude/rules/` currently has no row for `research:*`. If `.claude/rules/vault-routing.md` is updated but `~/.claude/rules/vault-guard.md` is not, graduator's `muninn_remember` calls fall through to the ambiguity heuristic, potentially routing project-scoped research to DEFAULT vault.

**Mitigation:** Make updating `~/.claude/rules/vault-guard.md` an explicit checklist item. Verify by grepping for `research:` in the global rule.

**Plan constraint:** v2-phase-3 must include explicit vault-guard.md update step.
