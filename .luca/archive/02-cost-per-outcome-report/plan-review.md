# Plan Review — Phase 2: cost-per-outcome-report

**Verdict: APPROVED · Convergence: CONVERGED (BLOCKING = 0)**

MODERATE phase. Plan structurally sound: every probe is honest about proving directive *presence* (the skill is an LLM-executed instruction body, not runnable code — token-presence acceptance is the correct contract), all ac-IDs currently fail RED and only flip GREEN when the directive lands (no vacuous pre-pass), compound `&&` probes are split into atomic ac-NN.M sub-probes, and anti-01's line-anchored probe correctly excludes the doc-comment `v: 2` false-positive (verified against the real file: only `v: 2` is the `*`-prefixed line 13; real literal `v: z.literal(1)` at line 74).

## Findings (all ADVISORY — executor-time hardening; no blocking)

| id | issue | resolution |
|---|---|---|
| G-CRIT-001 | ac-07.2's bare `structure` alternative matches the word anywhere in prose; ask-3's attribution section could be dropped while ac-06/07.1/07.2 still pass on incidental mentions. | **Carried to executor:** the directive MUST add a literal `### Structure vs Executor Attribution` section heading (already in Task 1.1.3 / Decisions). ac-10 (named `describe('structure-vs-executor'`) + ac-11 (bun test) provide the loud second gate. Executor + verifier confirm the heading is present. |
| G-DX-002 | first-pass-success derivation under-specified — no distinct verify-kind exists in the telemetry contract; must be derived from the `review.iteration` series alone. | **Carried to executor:** express first-pass-success purely as a phase whose `review.iteration` series has exactly one entry with verdict APPROVED and no subsequent iteration (count==1 && verdict==APPROVED). Removes the only deterministic-implementation ambiguity. |
| G-DX-001 | ac-08/09/10 assert `describe`-block *names* exist; ac-11 runs them, but a vacuous `expect(true).toBe(true)` block could co-pass. | Mitigated by the strong `record-recall.test.ts` precedent the plan follows (`toContain` per block). Reviewer confirms blocks carry real `toContain` assertions referencing the load-bearing literals. |
| G-CRIT-002 | ac-02.1/02.2 prove `inputTokens`/`outputTokens` literals exist but not that they're wired to the rate multiply. | Accepted: presence-only is the agreed contract for a prose body. Reviewer confirms co-location of rate table + token multiply. |
| G-SCOPE-001 | anti-03 `git diff --name-only` is staging-dependent. | Low risk (executor isn't directed near luca-mastracode). Optionally pin base `HEAD`. |

## Splitting / Independence / Vacuous-test — clean
- Splitting Test: all compound probes split (ac-02→.1/.2, ac-05→.1/.2, ac-07→.1/.2); parent lines are `[SPLIT →]` pointers, not gates. No ac fails the test.
- Independence: only ac-07.1/07.2 has a theoretical A-passes-while-B-fails weakness (G-CRIT-001), mitigated by ac-10 + ac-11.
- G-DX-003 vacuous-test guard: CLEAN — no `bun test -t <pattern>`; ac-11 runs the whole file, ac-08/09/10 are source-presence grep on named blocks.

## Traceability / Anti-criteria — complete
Deliverables map all 3 REQ-13 asks → ≥1 live ac (D1→ac-01/02/03/08, D2→ac-04/05/09, D3→ac-06/07/10, D4→ac-08–12). Three anti-criteria present; anti-01 verified honest.

## Confidence Gate Resolutions

Gate counts: auto=3, research=0, ask=1.

- **[gate-ask]** `1.1.2-first-pass-success-def` (low confidence, requirement-ambiguous) — *Define first-pass-success.* **User answer:** "One review, APPROVED, no rework" — a phase whose `review.iteration` series has exactly one entry with verdict APPROVED and no fix/re-execute re-entry (count==1 && verdict==APPROVED). Confirms the plan's leading definition + plan-reviewer G-DX-002. Executor implements exactly this; no looser variant.
- **[auto]** `1.1.1-model-rate-table` (medium) — hardcoded operator-editable rate table, substring-match opus/sonnet/haiku + fallback. Proceed.
- **[auto]** `1.1.3-role-bucketing` (medium) — executor = `meta.role==='executor'`; structure = every other role. Proceed.
- **[auto]** `1.2.1-test-strategy` (high) — `index.test.ts` readFileSync(BODY)+toContain in per-ask named describe blocks; no `-t`-only probes. Proceed.

## ac-ID inventory (stable)
ac-01, ac-02 (.1/.2), ac-03, ac-04, ac-05 (.1/.2), ac-06, ac-07 (.1/.2), ac-08, ac-09, ac-10, ac-11, ac-12; anti-01, anti-02, anti-03. No renumbering downstream.
