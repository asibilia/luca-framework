# Research Capture — Risk Assessment

**Subagent**: researcher
**Perspective**: risk
**Timestamp**: 2026-05-08T17:53Z

## Findings (severity-ordered)

### R1 — LLM Judgment Unreliability — CRITICAL — HIGH confidence
- LLM classifies cold archived memories. False `verified` promotions corrupt vault epistemology (downstream prefers verified per memory-tier-discipline.ts:24).
- **Mitigations required:**
  1. `--dry-run` mode mandatory.
  2. `verified` requires per-memory human confirm (NEVER batch-promote to verified in non-dry-run).
  3. Hard rule: skill emits ONLY `verified` or `inferred`. Prohibit `untrusted` (violates discipline line 20).
  4. Citation-presence check before allowing `verified`: require file path / PR id / URL / quoted source.

### R2 — Scope Creep to Mutating Tools — HIGH — HIGH confidence
- Agent's learned defaults include `muninn_remember`, `muninn_forget`, `muninn_consolidate`. SKILL.md must hard-prohibit.
- **Mitigation:** Hard-prohibition block in SKILL.md + CI test (regex scan `skills/memory-audit/SKILL.md` for forbidden tool names absent).

### R3 — Cursor Corruption / Split-Brain — HIGH — HIGH confidence
- Safe ordering: `muninn_trust(...)` × batch THEN advance cursor. NEVER reverse.
- Use `atomicWriteSync` (POSIX rename atomic) for state. NOT `writeFileSync`.
- writePlanningFileTool uses non-atomic write — accept this since trust calls are idempotent (re-trust same tier = no-op).

### R4 — Path Whitelist Gap — HIGH — HIGH confidence
- `.planning/audits/` NOT in ROOT_WHITELIST_DIRS → repo-cleanup `--fix` would delete reports.
- **Required:** add `'audits'` to ROOT_WHITELIST_DIRS in repo-cleanup.ts:90-95.

### R5 — Vault Mismatch / Cross-Vault — MEDIUM — HIGH confidence
- Resolve vault ONCE at run-start, persist in state file, validate on resume.

### R6 — Idempotency / Completion Detection — MEDIUM — MEDIUM confidence
- Cursor-at-end + `lastRunAt` recent → emit no-op report without API calls.

### R7 — Trust Drift Across Runs — MEDIUM — MEDIUM confidence
- Each report records `{id, concept, previous_trust, proposed_trust, rationale}` — only durable history (muninn_trust last-write-wins).
- `muninn_provenance(id)` recovers prior trust if memory ID logged.

### R8 — Context Exhaustion on Large Vaults — MEDIUM — HIGH confidence
- Cursor resume handles. Batch size 10-15 max. Persist + exit between batches.

### R9 — Bulk-Trust Rate Limits / Reversibility — LOW-MEDIUM
- Sequential per-id calls. Local MuninnDB = no rate limit. Last-write-wins.

### R10 — Test Coverage — LOW — HIGH confidence
- Inherit `memory-tier-verified-followup.test.ts` scanner.
- Add no-leak regex test for forbidden tools in SKILL.md.

## Open Q
- Allow demotion to `untrusted`? Discipline says "never assigned by agent" — recommend prohibit.
- Allow re-classification of `external` tier? Recommend leave untouched.
- Concurrent runs: state file is per-repo, not per-vault. Multi-vault repos need namespacing.
- Report retention: prune old `.planning/audits/memory/*.md` after N? Out of scope per task.
