# Learnings — Phase 02 cost-per-outcome-report (REQ-13, MODERATE)

Milestone v13.1.0 · Verification PASS (17/17 criteria) · 3/3 reviewers APPROVE, 0 must-fix.
Source of truth: `packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts` (BODY) + `index.test.ts`.

---

## pattern:instruction-body-prose-directive

- **Type:** pattern · **Confidence:** HIGH
- **Conjectured:** A new analytics feature ("token×rate cost", "cost-per-outcome", "executor vs structure split") is implemented as TS logic with a runtime import surface and unit tests over functions.
- **Refuted by:** The `luca-telemetry-report` skill is `defineSkill({ body: BODY })` (`index.ts:11,199`) — BODY is a markdown template-literal the harness inlines VERBATIM for an LLM to execute. There is no runtime import surface; nothing in BODY is "called". The three asks were therefore added as **prose directives inside BODY** (cost compute `index.ts:89`, Cost per Outcome `:130-136`, Structure vs Executor `:138-144`), not TS functions.
- **Learned:** For LLM-executed instruction bodies, a feature = prose the agent reads at runtime. The deliverable is the *directive text* (rate table, math, bucketing rules), and acceptance is **token-presence** on the rendered body — proving the directive is PRESENT, not that the LLM computes it correctly. Two-track write surface: freeform body via Write, the directive's correctness is unverifiable at build time.
- **Criterion now:** When the target artifact is a `define{Skill,Mode,Command}` BODY, scope acceptance to "directive present in rendered body", and state explicitly that correctness of LLM compute is out of band.

## pattern:rendered-body-tocontain-test

- **Type:** pattern · **Confidence:** HIGH
- **Conjectured:** A weak grep-for-a-symbol probe (or a `bun test -t <name>` that can pass vacuously) is enough to guard a prose directive.
- **Refuted by:** Phase-1's verify probe was a weak grep; vacuous `-t` filters exit 0 with zero matched tests. The hardened pattern (`index.test.ts`): import the rendered `lucaTelemetryReportSkill.body` and assert `expect(body).toContain('<load-bearing literal>')` inside **separately-named `describe` blocks** (`cost-compute`, `cost-per-outcome`, `structure-vs-executor`) so a partial drop of any one directive fails THAT block independently — not an aggregate "≥1 directive present".
- **Learned:** Test the rendered export (`.body`), not the source file string, so the assertions run against exactly what the harness inlines. One named describe per directive isolates regressions. (`record-recall.test.ts` does the same idea via `readFileSync` of the file; importing `.body` is the cleaner evolution.)
- **Criterion now:** One named describe block per directive; assert `toContain` on the exported rendered body; no bare `-t` vacuous probes.

## pattern:substring-model-rate-match

- **Type:** pattern · **Confidence:** MEDIUM
- **Conjectured:** Cost compute can look up a per-model rate by exact equality on `meta.model`.
- **Refuted by:** Emitted `meta.model` carries drifting version/date suffixes (`-4-5`/`-4-6`/`-4-7`), so exact-match misses on every release bump.
- **Learned:** Match the rate table by **case-insensitive substring** for `opus`/`sonnet`/`haiku` (`index.ts:89,105-112`). Any string matching none uses an explicit **fallback/unknown** row AND increments an `unknownModel` tally so unpriced traffic is visible, never silently mispriced. Fallback rate mirrors mid-tier (sonnet) so unknown is neither free nor wildly over-counted.
- **Criterion now:** Rate lookups over drift-prone identifiers use substring match + an explicit fallback row + an unknown-count tally surfaced in output.

## decision:rate-table-home-inline-prose

- **Type:** decision · **Confidence:** MEDIUM · **Vault:** luca-monorepo
- **Conjectured:** The model→rate pricing table lives in a shared TS constant the skill imports.
- **Refuted by:** No pricing table existed anywhere in `packages/`, and an instruction BODY has **no import path** — it is inert prose. A constant would be unreachable from the body.
- **Learned:** The only viable home is an **operator-editable markdown rate table inline in BODY** (`index.ts:101-112`), labelled non-authoritative ("verify against current pricing"). Rates are dollars-per-single-token (per-million ÷ 1e6).
- **Criterion now:** Config that an LLM-executed body must read lives as inline prose in that body — never as an importable constant the body cannot reach.

## decision:role-bucketing-executor-vs-rest

- **Type:** decision · **Confidence:** MEDIUM · **Vault:** luca-monorepo
- **Conjectured:** `subagent.complete` telemetry carries a typed structure/executor discriminator (e.g. `agentType`).
- **Refuted by:** `subagent.complete.meta` is open `z.record(string, unknown)`; the only role discriminator is the free-string `meta.role`, no `agentType`.
- **Learned:** Bucket = **executor** iff `meta.role === "executor"`; **everything else → structure** (reviewer/verifier/learner/fix/research/plan/plan-review/architect/triage/…), and any unknown/missing/future role defaults to structure (`index.ts:90,138-144`). Conservative by design so executor cost is never overstated. Documented inline as a heuristic.
- **Criterion now:** When bucketing on a free-string field, define one explicit positive bucket and route all-else + unknowns to the conservative default, and document it inline.

## decision:first-pass-success-definition

- **Type:** decision · **Confidence:** MEDIUM · **Vault:** luca-monorepo
- **Conjectured:** "First-pass success" needs a dedicated verify telemetry kind to query.
- **Refuted by:** No such kind exists; the confidence gate flagged the definition as the lone ambiguity → 1 ask item, resolved at gate-ask (user accepted the leading recommendation, no redirect).
- **Learned:** A phase is first-pass iff its per-phase `review.iteration` series has **exactly ONE** entry with verdict `APPROVED` and no subsequent fix/re-execute re-entry (`count == 1 && verdict == APPROVED`), derived PURELY from the `review.iteration` series collected in Step 3 (`index.ts:130-136`). Divide-by-zero → `n/a`, never `Infinity`/`NaN`.
- **Criterion now:** Derive outcome KPIs from existing telemetry series, not a new kind; surface the definition as a gate-ask when ambiguous; guard ratio denominators with `n/a`.

## pitfall:d-line-colon-grammar

- **Type:** pitfall · **Confidence:** HIGH
- **Conjectured:** Plan decision lines are free-form, e.g. `- **D1** (token×rate) → ac-01`.
- **Refuted by:** The D-line linter requires the colon AFTER the bold marker; the `**D1** (..)` form fails it.
- **Learned:** Grammar is exactly `- **D<N>**: <text> → <ac-IDs>` (`plan.md:44-47`). The `: ` after `**D<N>**` is load-bearing.
- **Criterion now:** Author plan decision lines as `- **D<N>**: <text> → <ac-IDs>`; the colon and the `→ ac-…` trailer are required.

## pitfall:planning-vocab-in-llm-body

- **Type:** pitfall · **Confidence:** HIGH
- **Conjectured:** Plan-internal task IDs are harmless scaffolding that can stay in the artifact text.
- **Refuted by:** "Task 1.1.3" leaked into LLM-facing skill prose (`index.ts:89,90`) — a runtime instruction referencing a planning artifact the executing LLM never sees. Caught as LOW review advisory #1.
- **Learned:** An instruction BODY is read at RUNTIME by an agent with no access to the plan. Planning vocab (Task N.N.N, wave numbers, ac-IDs) is dangling context there — strip it or rephrase to self-contained directive language.
- **Criterion now:** Before shipping a BODY edit, grep it for planning vocab (`Task \d`, `Wave \d`, `ac-\d`, `D\d`) and remove/rephrase any hit.

## pitfall:token-presence-not-correctness

- **Type:** pitfall · **Confidence:** HIGH
- **Conjectured:** A passing `toContain` suite means the cost analytics are correct.
- **Refuted by:** Tests assert string literals exist in BODY (`index.test.ts`). They cannot catch a wrong rate value, a transposed input/output column, or a buggy first-pass condition — only that the directive text is present.
- **Learned:** Token-presence guards regression of *directive presence*, not *LLM compute correctness*. Correctness of an instruction-body feature is validated by running the skill against real telemetry and eyeballing output, not by the unit suite.
- **Criterion now:** Pair every instruction-body directive with both a presence test AND a manual/eval run note; never claim correctness from `toContain` alone.

## convention:luca-tools-body-edit-process

- **Type:** convention · **Confidence:** MEDIUM · **Vault:** luca-monorepo
- **Learned:** Editing a luca-tools skill/mode/command artifact: (1) edit the `BODY` template-literal in `src/artifacts/**/index.ts`; (2) guard with a rendered-`.body` `toContain` suite, one named describe per directive; (3) gate is `bunx --bun tsc --noEmit` + the targeted test file (here 7 pass/0 fail) — pipeline does NOT auto-run `bun test`; (4) `--skip-verify` on `luca phase-plan` avoids a double plan-review since the /lu loop owns the plan-review step.
- **Criterion now:** Follow the four-step BODY-edit checklist; run `tsc --noEmit` + the specific test deliberately; use `--skip-verify` on phase-plan inside the /lu loop.

---

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>`.

**Recurring failure themes:** None. Zero failure-dump / low-confidence-failure signals this run. `checks` (tsc 0 + 7/0 tests), `verify` (all criteria), and `review` (3 APPROVE) all positive — a clean single-pass phase.

**Satisfaction valence trends by step/source:** Uniformly POSITIVE across all four signalled steps — `gate-ask` (plan-review: user accepted the leading first-pass-success recommendation, no redirect), `checks`, `verify`, `review`. No negative-valence step. `review` carried 5 LOW advisories but 0 must-fix (advisory friction, not a satisfaction dip).

**Confidence journal trend:** Three `design-choice` entries (rate table home, role bucketing, test structure) — two MEDIUM, one HIGH — plus one LOW `requirement-ambiguous` (first-pass def) that was the lone full-auto pause and resolved cleanly at gate-ask. Pattern: the only confidence dip was a definitional ambiguity, correctly escalated rather than guessed.

**Cross-cutting pattern:** The MEDIUM design-choice cluster all stems from one systemic constraint — **an instruction BODY is inert prose with no import/runtime surface** — which forced inline-prose decisions (rate table, bucketing, KPI def). That root constraint is the reusable win promoted into `pattern:instruction-body-prose-directive`.

---

## Carried follow-up (single low-priority cleanup candidate for next phase)

Fold into the next telemetry-skill touch (none are must-fix):
1. Strip "Task 1.1.3" planning vocab from `index.ts:89,90` (LOW #1).
2. Reconcile `byRole` vs `costByRole` key-expression drift (LOW #2, `index.ts:89,128`).
3. State per-phase `review.iteration` retention explicitly in Step 3 for the first-pass derivation (LOW #3).
4. Fallback rate row value-copies sonnet — add a note or distinct value to avoid silent sync drift (LOW #4, `index.ts:110`).
5. Anchor a rate-table-only literal + the `meta.inputTokens` path in the test (LOW #5).
6. Phase-1 carryover: harden `record-recall.test.ts` to assert quoted-JSON meta-key forms, not bare substrings.
