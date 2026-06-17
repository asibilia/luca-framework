# Phase 4 — outcome-kpi-persistence (REQ-14 capstone) — Learnings

Milestone v13.1.0 (Telemetry Impact & Attribution). Complexity MODERATE. Verification PASS
(re-verified after a review-fix loop; 16 live ac + 3 anti met; D1–D8 shipped).

What shipped: pure fn `computeOutcomeKpis` (`packages/luca-core/src/telemetry/outcome-kpi.ts`)
reads per-phase `confidence.jsonl` + `verify.json` + run `signal.satisfaction` telemetry, buckets
by complexity (slug `<NN>-<name>` → `RoadmapPhase.name`), computes 4 KPIs + an `unattributed`
tally; exposed read-only via `luca telemetry kpi --json` (`packages/luca-cli/src/commands/telemetry.ts`);
persisted at milestone close by the finalize.ts body directive (`metric:outcome-kpi-<version>-<complexity>`
per bucket → config-resolved repo vault). Producer-side: stamped `--slug`/`--complexity` onto the 3
`signal.satisfaction` emit directives in `lu/index.ts` so future telemetry is bucketable.

---

## pattern: deterministic-cli-compute-then-llm-mcp-persist
- **Type:** pattern · **Confidence:** HIGH
- **Conjectured:** A cross-run aggregation that must end up in MuninnDB could be done by the LLM
  reading artifacts directly, or by the core module writing memories itself.
- **Refuted by:** Neither is clean. The split that shipped (`outcome-kpi.ts` does NO writes; the
  CLI verb is read-only and "appends NO telemetry"; finalize.ts BODY runs the verb then calls
  `muninn_remember_batch`) is what passed verify + review. The compute is a *pure tested fn*
  (`outcome-kpi.test.ts`), the persist is the LLM's MCP job. confidence:kpi-compute-home = high
  precisely because it is a read-only verb over a pure fn, not a write-surface mutation handler.
- **Learned:** Deterministic aggregation → pure core fn behind a read-only CLI leaf
  (`--json` machine shape + bare-path human summary). MuninnDB persistence → LLM body directive
  that calls the verb then `muninn_remember_batch`. The core module performs zero writes.
- **Criterion now:** A core aggregation module imports no MCP/write API and its CLI verb emits no
  telemetry; persistence lives only in the materialized body directive. If the core fn writes
  memories, the split is wrong.

## pattern: generic-shipped-body-must-config-resolve-not-hardcode-dev-repo-values
- **Type:** pattern · **Confidence:** HIGH
- **Conjectured:** finalize.ts could persist KPIs to the vault literal `luca-monorepo` (this repo's
  vault) — 4 reviewers returned APPROVE / 0-must-fix on round 1.
- **Refuted by:** The orchestrator ESCALATED a code-architect MEDIUM to MUST-FIX on framework-shipping
  grounds: finalize.ts is the generic finalize mode materialized into *every* luca user's `~/.claude/`,
  so a hardcoded vault mis-routes every other repo's KPIs. Fix: resolve vault from
  `.luca/config.json` → `muninn.vault`, fallback `"default"` (verified at finalize.ts:77,138,154).
- **Learned:** Any value baked into an instruction body that ships to all consumers must be resolved
  from the consumer's own config at runtime — never a literal from the dev repo. The two are
  indistinguishable in this repo (where the literal *is* correct), which is exactly why it slips past
  per-repo reviewers.
- **Criterion now:** Grep a body destined for `~/.claude/` for repo-specific literals (vault names,
  paths, org names). Any such literal must instead read from `.luca/config.json` / the run context.

## pattern: orchestrator-escalates-reviewer-advisory-to-must-fix-on-framework-shipping-correctness
- **Type:** pattern · **Confidence:** MEDIUM
- **Conjectured:** When all parallel reviewers return APPROVE with 0 must-fix, the round converges
  and the fix loop is unnecessary.
- **Refuted by:** Round 1 was 4× APPROVE/0-must-fix, yet the orchestrator promoted one code-architect
  MEDIUM (the hardcoded vault) to MUST-FIX because the artifact ships framework-wide. The forced fix
  loop then also picked up JSDoc drift (3 reviewers) and the kpi non-json summary (2 reviewers); all
  re-checks/verify/review converged.
- **Learned:** Reviewer severity is advisory; the orchestrator can escalate a MEDIUM to a gate-blocking
  MUST-FIX when the blast radius (a body materialized into every consumer) outweighs the local
  severity. "All APPROVE" is not an automatic stop for framework-shipping artifacts.
- **Criterion now:** For artifacts under `packages/luca-tools/src/artifacts/` that materialize to
  `~/.claude/`, weigh reviewer findings by blast radius, not just stated severity, before declaring
  convergence.

## pitfall: doc-vs-impl-drift-per-wave-framing-for-single-record-store
- **Type:** pitfall · **Confidence:** HIGH
- **Conjectured:** Generic learner/finalize phrasing ("aggregates wave-level learnings",
  per-wave loops) transfers cleanly to the single-per-phase `verify.json` / single milestone record.
- **Refuted by:** 3 reviewers flagged JSDoc/body drift where per-wave or multi-record framing
  described a single-record store. `firstPassVerifyRate` reads "the single per-phase
  `VerificationResult`" — copied multi-record framing would have mis-described it.
- **Learned:** When a single-record store (one `verify.json`, one milestone metric per bucket) is
  documented with inherited multi-record/per-wave language, the doc lies about cardinality even when
  the code is correct. Drift here is caught late and by multiple reviewers (expensive signal).
- **Criterion now:** When writing/copying JSDoc or body prose for a store, state the cardinality
  explicitly ("single per-phase record", "one entry per bucket") and check it against the read path
  (`readVerificationResult` returns one record, not a list).

## decision: four-outcome-kpis-and-their-sources
- **Type:** decision · **Confidence:** HIGH · **Vault:** luca-monorepo
- **Conjectured:** kpi-scope-mvp-vs-full was LOW confidence; the architect recommended MVP-defer-2.
- **Refuted by:** The plan-review gate-ask consulted the user, who redirected to FULL (instrument all
  4 KPIs). Handled via append-only PLAN AMENDMENT (ac-11..ac-16 added, ac-08.1/.2 tombstoned).
- **Learned:** The 4 KPIs + sources (verified in `outcome-kpi.ts`): **lowConfidenceRatio** = low
  decisions / total from per-phase `confidence.jsonl`; **firstPassVerifyRate** = phases whose single
  `verify.json` status is PASS / phases in bucket; **meanReworkIterations** = mean over bucket phases
  of negative `signal.satisfaction` source:outcome records at step ∈ {checks,verify};
  **reEntryRate** = phases with ≥1 negative source:outcome record / phases. Output shape:
  `{ buckets: { <COMPLEXITY>: { ...4 KPIs, sampleSize } }, unattributed: { phases, records } }`.
- **Criterion now:** If a KPI's source or formula changes, update both `outcome-kpi.ts` JSDoc and the
  finalize.ts persist directive's content template — they must agree.

## decision: producer-stamp-slug-complexity-on-signal-satisfaction-emits
- **Type:** decision · **Confidence:** HIGH · **Vault:** luca-monorepo
- **Conjectured:** Run telemetry could be bucketed by complexity after the fact.
- **Refuted by:** confidence:kpi-data-source = high *for per-phase artifacts* but run telemetry was
  `slug`/`complexity`-null — there was nothing to bucket on. Fixed forward-only by stamping
  `--slug <currentPhaseSlug> --complexity <level>` onto all 3 `signal.satisfaction` emit directives
  in `lu/index.ts` (verified lines 117, 183, 239: source outcome / gate-ask / oversight-pause).
- **Learned:** Telemetry attribution is forward-only — you cannot retro-bucket records written before
  the producer carried the key. Stamp the bucketing key at emit time; pre-stamp records stay `null`
  and land in `unattributed`.
- **Criterion now:** Any new `signal.*` emit that KPIs will bucket must carry `--slug`/`--complexity`
  at emit time. Records lacking them are unattributed, never silently dropped.

## decision: milestone-stamped-metric-concept-and-unattributed-tally
- **Type:** decision · **Confidence:** MEDIUM · **Vault:** luca-monorepo
- **Conjectured:** A single rolling `metric:outcome-kpi` record could hold current KPIs.
- **Refuted by:** kpi-persist-shape (medium) chose a milestone-stamped concept so cross-milestone
  trend history survives: `metric:outcome-kpi-<version>-<complexity>` (lowercase complexity, e.g.
  `metric:outcome-kpi-v13.1.0-moderate`), one per bucket, skip buckets with `sampleSize === 0`
  (finalize.ts:138,145,154).
- **Learned:** Stamp the milestone version + complexity into the metric concept so each milestone's
  KPIs are a distinct queryable record (trend history), not an overwrite. The `unattributed` tally is
  informational (forward-only attribution gap) — note it in the session archive, do NOT persist it as
  a metric. Phases/records with no roadmap match or `slug: null` increment `unattributed`, never
  silently dropped.
- **Criterion now:** New per-milestone metrics carry `<version>` in the concept; never overwrite a
  prior milestone's record. Attribution gaps surface in a tally, not a drop.

---

## Signal Synthesis

Source: orchestrator-injected `<signal-digest>` (present).

- **Satisfaction valence trend:** aggregate 5 positive / 1 negative across checks(2), verify(2),
  review(2). The single negative was review round 1 (4× APPROVE/0-must-fix) where the *orchestrator*,
  not a reviewer, escalated the hardcoded-vault MEDIUM to MUST-FIX on framework-shipping grounds. The
  fix loop (vault config-resolve + JSDoc drift from 3 reviewers + kpi non-json summary from 2
  reviewers) then converged on re-checks/verify/review. Friction hotspot: the review step for
  framework-shipping bodies, where per-repo reviewers under-weight blast radius.
- **Gate-ask trend:** one NEGATIVE plan-review gate-ask (kpi-scope) — user redirected the architect's
  MVP-defer-2 to FULL; scope expansion handled via append-only PLAN AMENDMENT (ac-11..ac-16,
  ac-08.1/.2 tombstoned), not a bare executor directive.
- **Confidence cluster:** the two HIGH entries (kpi-compute-home, kpi-data-source-per-phase) held;
  the MEDIUM (kpi-persist-shape) and the LOW→ask→RESOLVED-FULL (kpi-scope) both resolved positively.
  No confidence dip survived to verification.
- **Cross-cutting pattern (→ promoted):** the hardcoded-vault escalation is a systemic signal for any
  artifact materialized into every consumer's `~/.claude/` — promoted to
  `pattern:generic-shipped-body-must-config-resolve-not-hardcode-dev-repo-values` and the orchestrator-
  escalation pattern.
