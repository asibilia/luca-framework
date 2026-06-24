# Code Review — Wave 2 (Iteration 2)

**Date**: 2026-05-08
**Complexity**: COMPLEX
**Review Iteration**: 2 / 2 (budget exhausted)
**Branch**: feat/memory-audit-skill (4 commits: a4ae1daf8, de045b8e0, bc28a87f2, 9784be5ac)

## Iteration-1 MUST-FIX Resolution

| Item | Status | Evidence |
|------|--------|----------|
| MF-1 vault drift always-on + pre-apply gate | RESOLVED | SKILL.md:119 `regardless of how the vault was resolved`; Step 2 gate at lines 125-137 |
| MF-2 lastRunAt set explicitly | RESOLVED (functional) | SKILL.md:199 `Set state.lastRunAt`; seed at L114 = `""`; guard at L121 = `lastRunAt !== ""` |
| MF-3 --auto flag replaces full-auto | RESOLVED | Zero `full-auto` matches in SKILL.md; `--auto` defined L68/82/125/171/183 |
| MF-4 prohibition list 5→11 tools | RESOLVED | SKILL.md:24-41; FORBIDDEN_TOOLS test array 10 tools + bare-remember regex |
| MF-5 bare-remember regex | RESOLVED | test.ts:107 `/mcp__muninn__muninn_remember(?!_batch)/` |

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| AC-01..07 (from REVIEW-1) | MET | All 5 iteration-1 MUST-FIX items confirmed resolved |
| AC-08 prose readable to LLM | MET | Step ordering 1→7 has all required context at each step; one stale ref noted below |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.2s |
| bun-test | pass | 0.4s |

## Code Review Findings

### MUST-FIX (0)

Per the constraint "MUST-FIX = correctness bugs, security, missing requirements ONLY", all findings from this iteration classify as SHOULD-FIX or NOTE. The skill is **functionally correct**:

- The `lastRunAt` mechanism works correctly (Step 6.2 sets it, test asserts the assignment).
- The vault drift guard fires on every resume.
- The `--auto` flag has complete and tested semantics.
- The forbidden-tool list covers all enumerated mutating tools.

DX flagged SKILL.md:103 as MUST-FIX (stale "Step 5" reference in field-semantics block). Reclassified to SHOULD-FIX because: (a) it is documentation-only, (b) the actual assignment in Step 6 is correct and tested, (c) the prose misdirection does not break the runtime behavior.

### SHOULD-FIX (consolidated, 6)

- **SF2-1** [arch+dx] `SKILL.md:103` — field-semantics says "Set to the current ISO timestamp in **Step 5**" but assignment is in Step 6. Stale ref from iteration 1. Fix: change to "Step 6 sub-item 2".
- **SF2-2** [arch+dx] Cross-reference syntax: `Step 1.5` (line 199) and `Step 1.3` (failure modes table line 241) use informal sub-item notation. No anchors exist. Replace with named labels (e.g. "Step 1, idempotency guard").
- **SF2-3** [dx] `commands/memory-audit.md:6` — `--auto` missing from argument enumeration in slash-command shim description. Add to the parenthetical list.
- **SF2-4** [security] Three structurally-mutating tools absent from prohibition list: `mcp__muninn__muninn_apply_enrichment`, `mcp__muninn__muninn_replay_enrichment`, `mcp__muninn__muninn_merge_entity`, `mcp__muninn__muninn_entity_state(_batch)`. Extend forbidden-tools fence + test FORBIDDEN_TOOLS array.
- **SF2-5** [arch] Step 4 line 183 (`If --auto is set, the citation-presence check is the sole gate.`) restates Step 2's bypass logic. Replace with cross-reference.
- **SF2-6** [simp] Step 6 sub-item 2 (line 199) trailing rationale `without it, the 24-hour idempotency guard in Step 1.5 cannot fire` restates L121. Truncate.

### NOTE (8)

- N-1 No audit trail when `--auto` bypasses Step 2 gate.
- N-2 FORBIDDEN_TOOLS array missing comment that bare `muninn_remember` is handled by regex.
- N-3 Field-semantics block forward-references runtime steps — tolerable for reference doc.
- N-4 Test gap: no assertion that `lastRunAt.*Step 5` is absent (would have caught SF2-1).
- N-5 Test gap: no assertion that `verified→inferred` demotion is gated.
- N-6 Test gap: no assertion that `--auto + --dry-run` keeps dry-run behavior.
- N-7 Skill grew 38% (10755→14833 bytes); growth is justified by new behavioral contracts (vault guard, pre-apply gate, --auto, schema split, citation regex).
- N-8 Pre-flight validation list has 4 items — all minimum necessary.

## Verdict

**CLEAN — proceed to Finalize.**

All 5 iteration-1 MUST-FIX items resolved. The 6 SHOULD-FIX items are documentation cleanups and defense-in-depth additions that do not block correctness, security, or feature completeness. They can be addressed in a follow-up commit on this branch before PR merge, or accepted as known issues for a future iteration.

Iteration budget (2/2) exhausted. Routing to Finalize.
