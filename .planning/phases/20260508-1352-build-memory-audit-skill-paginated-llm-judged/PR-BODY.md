# feat(mastracode): v11.8.0 add /memory-audit skill — paginated LLM-judged retro pass over MuninnDB vault

## What

New `/memory-audit` skill: interactive LLM-judged audit of MuninnDB vault trust tiers. Analyzes each engram against stored trust level, recommends promotions/demotions, and applies corrections via `muninn_trust`.

Enables:
- Bulk re-evaluation of memories flagged as inferred that should be verified
- Detection of stale/corrupted memories without manual inspection
- Trust-tier compliance before long-term archive

## Why

Trust-tier system (verified/inferred/external/untrusted) requires initial seed + ongoing corrections. Memory-audit skill closes the gap:
- Architect decisions, proven patterns → verified (promotion)
- Hallucinated findings, dismissed risks → untrusted (demotion)
- User cannot manually flag 200+ memories; LLM judgment with citation verification is needed

## How

**Skill flow:**
1. Resolve vault name + load/validate cursor state
2. Hybrid pagination: `muninn_get_enrichment_candidates` + 5 semantic recall passes (architecture/security/verified/conventions/recent) with dedup
3. LLM judgment against trust tier (verdict: skip/promote/demote/confirm) with prompt injection guard
4. Apply corrections: `muninn_trust(id, tier, vault)` per verdict, with error handling
5. Write audit report to `.planning/audits/memory/<ISO>.md` + persist cursor state
6. Summary: processed count, promoted/demoted breakdown, next steps

**Key design choices:**
- Hybrid pagination covers enriched + unenriched + semantic-near memories without full vault scan
- Batch judgment (5–15 at a time) balances context window vs latency
- Dry-run default ON; `--apply` commits changes
- Hard prohibition on `muninn_remember/forget/consolidate/evolve` in skill (trust is post-write only)
- External/untrusted memories left unchanged; verified promotion requires citation check

## Test plan

- Unit tests: judgment logic, tier transitions, error handling
- Integration: `--dry-run` matches `--apply`, cursor state recovers after interrupt
- Regression: no `muninn_*` write tool calls in skill, `forbidden-tools-list` fenced block enforced

**All 7 tests pass.**

## Known limitations

- No concurrent vault access (single-agent lock model)
- LLM judgment can miss context-dependent trust boundaries; `--dry-run` required before `--apply`
- First audit run slower (~30–60s); subsequent runs faster with cursor dedup

## Closes #22

---

**Deliverables:**
- NEW `skills/memory-audit/SKILL.md` (208 lines, 6-step flow)
- NEW `commands/memory-audit.md` (slash command)
- MOD `repo-cleanup.ts` (`'audits'` added to `ROOT_WHITELIST_DIRS`)
- NEW `src/__tests__/memory-audit.test.ts` (7 tests)

**Verification:** All 7 new tests pass; `tsc` clean; rule gate clean.
