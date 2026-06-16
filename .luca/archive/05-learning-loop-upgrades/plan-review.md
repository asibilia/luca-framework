# Plan Review: 05-learning-loop-upgrades

**Status:** NEEDS_REVISION (round 1) · **Convergence:** CONVERGING (B(1)=2) · **Blocking:** 2 · **Advisory:** 3

Design (Q1 optional+audit, Q2 content-carry, Q3 20-site scope) is sound and well-evidenced. Both blocking issues are mechanical criterion-grammar defects, not strategic flaws.

## Pre-state spot-checks (confirmed discriminating)
- `gotchas` in render-body.ts = 0; in define/agent.ts + define/subagent.ts = 0 (ac-01/ac-02 discriminate).
- `## Gotchas` in packages/luca-tools/src/compile = 0 (ac-08.2).
- `conjectur|refuted|criterion_now` (case-insensitive) in learner.ts = 0 (ac-09 discriminates).
- learner.ts has exactly one `### TO_PERSIST` (anti-07 baseline); render-body.ts:33 already documents "No timestamps, no random ids" (anti-10 precedent).

## Findings

- **G-DX-001 [BLOCKING]** (ac-06, ac-07, plan.md:75-76): the `grep -L "gotchas" .../modes/*.ts` glob includes the pure re-export barrel `modes/index.ts` (and `subagents/index.ts`) which has no `defineAgent` call and can never carry `gotchas` → criterion fails even when all 10 real agents are authored. FIX: scope to files containing `defineAgent(`/`defineSubagent(` (e.g. `grep -rL "gotchas" $(grep -rl "defineAgent(" packages/luca-tools/src/artifacts/modes/)`), matching the A.4a/A.4b file lists (plan.md:39,44) — not the raw glob.
- **G-DX-002 [BLOCKING]** (ac-08.2, plan.md:79): the compile-smoke fixture compiles its OWN inline defineAgent/defineSubagent (compile-smoke.ts:51-78) which pass no `gotchas`; with gotchas optional+default `[]`, renderGotchasPrelude emits empty → no `## Gotchas` in the smoke body → ac-08.2 has no path to green. FIX: add a sub-task (A.2/A.3 or new A.5) to set `gotchas: [...]` on the smoke fixture's inline agent/subagent AND add a `check('... gotchas', agentText, '## Gotchas')` golden assertion (mirror the existing `## Guidance` check at compile-smoke.ts:268).
- **G-CRIT-001 [ADVISORY]** (ac-04, plan.md:73): bare `grep -c "gotchas" render-body.ts` with no numeric threshold; overlaps ac-03. FIX: pin a count (≥3: BodyRenderInput field + renderBody wiring + renderGotchasPrelude param) or assert the exact interface line.
- **G-SCOPE-001 [ADVISORY]** (plan.md:16,60): path label `lu/index.ts:109` should be `packages/luca-tools/src/artifacts/skills/lu/index.ts:109` (the real orchestrator consumer; content matches the plan's claim). Fix the label so B.3's verify step lands right.
- **G-CRIT-002 [ADVISORY]** (ac-10/ac-11/anti-09/anti-11): these are LLM-judgment criteria (not binary exit-code probes) — acceptable for a prose phase, but the verifier must apply judgment; ac-09 (case-insensitive grep) is the strong binary anchor for REQ-06.

## Cross-axis
Completeness PASS (D1→C/R/L, D2→Gotchas, every D maps live ac; ac-08 correctly a `[SPLIT]` parent with both children mapped). Atomicity/parallel-safety PASS (Wave A / Wave B disjoint EXCEPT learner.ts: A.4b adds the top-level `gotchas:` field while B.1-B.3 edit the `instructions` string — non-conflicting regions, but sequence coherently — minor). A.4 split into A.4a/A.4b (not a mega-task). Dependency order PASS (A.1 schema→A.2 render→A.3 emitter→A.4 content; A.4 depends on A.1 only; B independent). Anti-criteria strong (anti-05..11). Goal alignment PASS ("mandatory" satisfied via parity audit on all 20 sites even with optional Zod field; flag-day avoided).

**Recommendation:** revise — fix ac-06/ac-07 globs + wire the smoke fixture for ac-08.2; expect B(2)=0 and convergence.

---

# Plan Review Round 2

**Status:** NEEDS_REVISION · **Convergence:** CONVERGING (B(1)=2 → B(2)=1) · **Blocking:** 1 · **Advisory:** 0

Both round-1 blockers fixed and discriminate (barrel-glob exclusion sound; smoke-fixture Task A.5 added with golden checks; ac-04 pinned ≥3; path label corrected; judgment notes present). No ac-IDs renumbered; A.5 new; lint clean. One NEW blocking discrimination defect inside the ac-06 fix:

- **G-DX-003 [BLOCKING]** (ac-06): the rescoped `grep -rL "gotchas" $(grep -rl "defineAgent(" modes/)` substring-matches `modes/research.ts:232` which ALREADY contains the prose word "gotchas" ("…implementation patterns, gotchas/edge cases"). At green an executor could skip authoring a real `gotchas:` field in research.ts and still get a zero-file pass. FIX: match the field token — `grep -rL "gotchas:" $(grep -rl "defineAgent(" packages/luca-tools/src/artifacts/modes/)` (colon disambiguates the object key from prose). Apply symmetrically to ac-07 (subagents/ has 0 `gotchas` today, unaffected, but keeps the pair future-proof).

**Recommendation:** revise — 2-token edit (`gotchas` → `gotchas:` in ac-06/ac-07 inner exclusion); expect B(3)=0. Not an escalation.

---

# Plan Review Round 3 (convergence — orchestrator-confirmed)

**Status:** APPROVED · **Convergence:** CONVERGED (B(2)=1 → B(3)=0)

G-DX-003 resolved: ac-06/ac-07 now match the field token `gotchas:` (colon). Orchestrator-verified the fix discriminates: `grep -rl "gotchas:" packages/luca-tools/src/artifacts/modes/` returns 0 files as-built (probe fails pre-authoring, passes only once real `gotchas:` fields are added), and the prose `gotchas` at modes/research.ts:232 no longer false-matches the field-token probe. No other criteria touched; no ID renumbering. Given the round-2 reviewer's explicit "2-token edit, not an escalation, expect B(3)=0" assessment plus independent orchestrator confirmation, this converges without a third reviewer spawn.

**Recommendation:** approve.

---

## Confidence Gate Resolutions

- **[gate-ask]** *Q1: how to enforce "mandatory" Gotchas* → **OPTIONAL Zod field (default []) + parity-audit task** enforcing every one of the 20 artifacts carries a `gotchas:` value. NOT a required `.min(1)` field — avoids the module-load flag-day (a required field throws at import, breaking the ARTIFACTS barrel + compile mid-wave). "Mandatory" holds in spirit via the audit. (User-selected, full-auto gate pause.)
- **[auto]** 2 entries routed auto (Q2 C/R/L content-carry; Q3 20-site scope).
