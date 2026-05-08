# Code Review — Wave 1

**Date**: 2026-05-08
**Complexity**: COMPLEX
**Review Iteration**: 1 / 2
**Branch**: feat/memory-audit-skill (3 commits: a4ae1daf8, de045b8e0, bc28a87f2)

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| AC-01 SKILL.md present | MET | skills/memory-audit/SKILL.md (10755 b) |
| AC-02 slash-command shim | MET | commands/memory-audit.md (308 b) |
| AC-03 ROOT_WHITELIST_DIRS includes 'audits' | MET | repo-cleanup.ts:96-97 + test |
| AC-04 New tests pass | MET | 21/21, 28 expect() |
| AC-05 tsc + bun-test green | MET | runChecks resolved |
| AC-06 memory-tier-callsite passes | MET | full suite green |
| AC-07 no-luca-leak passes | MET | full suite green |
| AC-08 manual smoke (skill prose readable) | **PARTIAL** | Multiple ambiguities found below |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.2s |
| bun-test | pass | 0.4s |
| eslint | pre-existing failures unrelated to this branch | n/a |

## Code Review Findings

### MUST-FIX (5)

- **MF-1 [arch+dx+security]** Vault drift detection only fires on explicit `--vault` override.
  - File: `skills/memory-audit/SKILL.md:85,89`
  - Root cause: SKILL.md:85 says abort on vault mismatch when `--vault` differs from persisted; SKILL.md:89 says warn-only when `--vault` is passed; neither path fires on a plain `--resume` after `.planning/config.json` drift between runs.
  - Fix: in Step 1 after resolving vault, always compare `resolvedVault !== state.vault` regardless of how vault was resolved; abort with the cross-vault error message. Add an explicit Step 0/Step 1 pre-flight `--apply` confirmation gate when irreversibility warning is appropriate (folds in SEC-2).
  - Add test asserting both `"vault"` schema field and `/abort.*vault|vault.*abort/i` prose are present.

- **MF-2 [dx+simp]** `state.lastRunAt` is never assigned — 24-hour idempotency guard non-functional.
  - File: `skills/memory-audit/SKILL.md:78,91,156`
  - Root cause: schema templates `lastRunAt: "<ISO-timestamp>"` (placeholder text), Step 5 doesn't say to update it. Step 1.3 reads it for the 24-h guard.
  - Fix: in Step 1 seeding, set `lastRunAt: ""` for fresh state. In Step 5, add explicit instruction: "Set `state.lastRunAt` to the current ISO timestamp immediately before writing state.json." Update Step 1.3 to skip the guard when `lastRunAt === ""`.

- **MF-3 [dx+simp+security]** `full-auto` oversight branch is undefined and undetectable.
  - File: `skills/memory-audit/SKILL.md:126-138`
  - Root cause: skill branches on "non-`full-auto` oversight" but provides no detection mechanism (no flag, no setting check, no env). No cross-reference to where this is established.
  - Fix: collapse to argument-driven control. Replace the `full-auto` check with: in `--apply` mode without `--auto`, always prompt via `ask_user` for verified promotions; with `--auto` set, skip the prompt. This makes the gate explicit and testable.

- **MF-4 [security]** Forbidden-tool list omits structurally-mutating MCP tools.
  - File: `skills/memory-audit/SKILL.md:23-35`, `src/__tests__/memory-audit.test.ts:65-99`
  - Root cause: the fenced prohibition block lists 5 tools (remember, remember_batch, forget, consolidate, evolve) but skips: `muninn_link`, `muninn_state`, `muninn_decide`, `muninn_add_child`, `muninn_remember_tree`, `muninn_restore` — all of which mutate engram structure.
  - Fix: add the 6 missing tools to the prohibition block AND extend the test's `FORBIDDEN_TOOLS` array to assert each is absent outside fences.

- **MF-5 [arch+dx]** Bare-remember test regex too narrow vs sibling tests.
  - File: `src/__tests__/memory-audit.test.ts:101-107`
  - Root cause: test uses call-form regex `/mcp__muninn__muninn_remember\s*\(/`. Sibling tests use identifier-only `not.toContain(...)`. A prose mention like "do not call `mcp__muninn__muninn_remember`" outside fences would slip past.
  - Fix: switch to identifier-only assertion via word-boundary form. Since `mcp__muninn__muninn_remember_batch` is a substring of `mcp__muninn__muninn_remember`, use a regex with negative lookahead OR test `_batch` first and confirm fence-block contains both: `expect(outside).not.toMatch(/mcp__muninn__muninn_remember(?!_batch)/)`.

### SHOULD-FIX (consolidated, 8)

- **SF-1** Argument validation block — add pre-flight checks (`--dry-run + --apply` resolution, `--limit` clamp, `--vault` non-empty) before Step 1 begins.
- **SF-2** `state.totalsByTier` accounting ambiguity — distinguish `judgedByTier` (all) vs `appliedByTier` (mutations only). Increment only after `muninn_trust` returns. Drop unused `external`/`untrusted` keys.
- **SF-3** state.json schema not validated on read — Step 1.2 should validate parsed object shape before use; corrupt → seed fresh + warn.
- **SF-4** `--vault` argument format unvalidated — add `^[a-zA-Z0-9_-]{1,64}$` check.
- **SF-5** Citation-presence check has no concrete regex anchors — spell out at least one regex per pattern.
- **SF-6** Failure-modes table rows 2/3/5 duplicate body prose — cut to rows 1+4 (vault contamination + writePlanningFile truncation).
- **SF-7** Drop `runId` from state schema; use `lastRunAt` for filename + heading (single field, single concept).
- **SF-8** Test file: hoist `readFileSync` calls to module scope `const SKILL = readFileSync(...)` — reduces 13 disk reads to 1.

### NOTE (informational)

- N-1 Slash-command description jargon-heavy ("LLM-judged retro-pass") — discoverability could improve.
- N-2 Test describe blocks reference `G-DX-001`/`G-DX-003` codes with no glossary.
- N-3 Batch-size guidance (10-15) has no enforcement when `--limit 200` is set.
- N-4 ROOT_WHITELIST_DIRS 'audits' is a broad whitelist — acceptable, revisit if other skills write there.
- N-5 SKILL.md ~1650 words sits at skim threshold; SHOULD-FIX cluster trims ~250 words.
- N-6 24-hour `complete:true` guard masks vault growth between runs — note this in Step 1 + Step 6.

## Verdict

**ISSUES_FOUND** — 5 MUST-FIX. Iterate to Execute.

### Iteration plan (Wave 1 of iteration 2)

1. **MF-1** SKILL.md Step 1: always compare resolvedVault to state.vault on every resume; add pre-flight `--apply` gate. Add tests for both invariants.
2. **MF-2** SKILL.md Step 1 (seed) + Step 5 (update): explicit lastRunAt assignment. Update Step 1.3 guard.
3. **MF-3** SKILL.md Steps 3+4: replace `full-auto` branch with `--auto` flag mechanic. Document in Arguments section.
4. **MF-4** SKILL.md prohibition block: add 6 mutation tools. Extend test FORBIDDEN_TOOLS array.
5. **MF-5** memory-audit.test.ts:101-107: switch bare-remember regex to identifier-form / negative-lookahead.
6. SHOULD-FIX cluster: SF-1, SF-2, SF-7, SF-8 (architectural cleanups). SF-3/4/5/6 stretch goals.
