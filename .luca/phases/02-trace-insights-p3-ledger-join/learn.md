# Learnings — 02-trace-insights-p3-ledger-join

Phase: Stage A5 trace↔ledger join added to the trace-insights skill body + tests (2-file prompt-artifact pattern). MODERATE, verified PASS 23/23 after one review-fix loop. Only NEW learnings recorded — phase-1 memories (vacuous toContain probes, unscoped write-surface guarantees, grep-literal AC probes, skill-body-edit procedure, etc.) are not repeated.

## 1. Pitfall — a schema union entry is not a data source (HIGH)

- **Type**: pitfall · **Concept**: `pitfall:schema-entry-without-emitter`
- **Conjectured**: telemetry `mode.start`/`mode.end` records exist and can serve as the primary interval source, because the telemetry schema union defines them.
- **Refuted by**: plan-review iteration 1 G-ARCH-001 (plan-review.md:5) — zero such records in any real `.luca/telemetry/*.jsonl`, and no emitter exists anywhere in the codebase (the emitter died with luca-mastracode). The designed "fallback on telemetry absent" would ALWAYS fire; the feature would silently no-op.
- **Learned**: a schema/type definition proves only that a record COULD exist. Before designing a pipeline around a data source, verify (a) an emitter/writer exists in live code and (b) real records exist on disk. The design was inverted: ledger `mode-transition` deltas (354 real rows) became primary; the schema-only telemetry path became the preferred-when-nonempty branch.
- **Criterion now**: any plan naming a data source must cite an emitter call site AND a count of real records (`grep -c` on the actual file). A source with a schema entry but 0 emitters is treated as future/optional, never primary.

## 2. Pattern — ground-truth plan review against real repo data files (HIGH)

- **Type**: pattern · **Concept**: `pattern:plan-review-ground-truth-repo-data`
- **Conjectured**: plan review is a document-consistency check; data-shape questions are settled by reading schemas.
- **Refuted by**: both blocking iter-1 findings and the one gate-research redirect were only discoverable by opening the real data: 0 `mode.start` records vs 354 `mode-transition` rows inverted the interval design (plan-review.md:5,21); measured interval durations (triage 78ms, checks 3–25s vs multi-minute turns, 9 transitions in one ~21-min turn) overturned the plan's start_time-containment cost rule in favor of proportional overlap allocation (plan-review.md:27).
- **Learned**: for MODERATE+ plans that consume repo-local data, the reviewer/researcher grepping and counting the actual `.luca/ledger.jsonl` / telemetry files is the cheapest high-yield check available — it caught an inverted design and a wrong allocation premise before any code existed, each for the cost of a few greps.
- **Criterion now**: plan review of any data-consuming design includes an empirical probe section: record counts per claimed source, plus one sanity measurement of the quantity the design depends on (here: interval duration distribution).

## 3. Pitfall — allocation rule without denominator/conservation invariant (HIGH)

- **Type**: pitfall · **Concept**: `pitfall:allocation-rule-missing-denominator`
- **Conjectured**: "allocate total_cost proportionally across all overlapped intervals by wall-clock overlap fraction" is a complete, deterministic rule.
- **Refuted by**: code-simplifier MF-1 (audits/code-simplifier.md:4) — "fraction" admits two readings: overlap ÷ total window (conservation holds) vs normalized over sum-of-overlaps (full cost split among intervals). Under the second reading the very next sentence adds tail cost ON TOP → attributed + tail > total_cost, and the ms-scale-interval reality makes the double-count catastrophic, not marginal.
- **Learned**: any proportional split rule is underspecified until it states its denominator AND its conservation invariant ("parts + remainder sum to exactly the whole"). The fix was one clause (index.ts:147) plus a pinned invariant test.
- **Criterion now**: every allocation/split/percentage rule in a spec must name the denominator explicitly and state the sum-to-total invariant; a probe test pins the invariant sentence.

## 4. Pitfall — "safe identifier" cap/scan exemptions without shape validation are a bypass channel (HIGH)

- **Type**: pitfall · **Concept**: `pitfall:safe-identifier-exemption-bypass`
- **Conjectured**: pipelineStep/slug/runId are structural identifiers, so exempting them from the 300-char cap + secret scan is harmless.
- **Refuted by**: security-auditor MF-1 (audits/security-auditor.md:4) — the values come from unvalidated local JSONL fields (`data.to`, nearest slug-bearing telemetry record) written by OTHER agent sessions; nothing enforces they match their contract shapes at read time. A crafted value rides the exemption uncapped and unscanned into every write surface (subagent prompts, report tables, GitHub issues, default-vault memories). Related MF-3: even a WELL-FORMED slug (e.g. `04-fraud-scoring-model`) is repo-identifying proprietary detail on cross-repo/public surfaces.
- **Learned**: an exemption from a safety control is only sound if the exempted class is machine-checkable at the point of use. Fix: identifiers are "safe to name" ONLY after shape validation (13-token step allowlist, canonical slug regex, `^[A-Za-z0-9_-]+$` runId); failures drop to null or demote to capped/scanned free-form strings; slug naming is additionally scoped per surface (verify.json MF-A).
- **Criterion now**: any "X is exempt from cap/scan/escaping" sentence must pair with a binding shape-validation rule and a per-surface scope, each pinned by a test.

## 5. Pitfall — asserting a field is absent without checking schema + writer (MEDIUM)

- **Type**: pitfall · **Concept**: `pitfall:asserted-absence-without-schema-check`
- **Conjectured**: ledger `mode-transition` rows "carry no runId/slug/wave", so the joined tuple must start from `runId: null` and slugs need a nearest-in-time heuristic.
- **Refuted by**: code-simplifier MF-3 (audits/code-simplifier.md:12) — `LedgerEntrySchema` REQUIRES `runId` (luca-core ledger/schemas.ts:17-18) and the writer stamps it from `state.sessionId` (luca-cli luca-state-advance.ts:262-272). The false premise then motivated unnecessary indirection: a proximity heuristic where a direct deterministic key join (runId → `.luca/telemetry/<runId>.jsonl` → slug) exists.
- **Learned**: claims of ABSENCE are as load-bearing as claims of presence — verify them against the schema and the writer call site, not memory. False absence claims are worse than benign: they breed heuristics that displace exact joins. Fixed to a 3-step slug resolution with the direct runId lookup first (verify.json MF-D).
- **Criterion now**: before writing "X carries no Y" in a spec, grep the schema definition and the writer; if a key field exists, the exact join precedes any heuristic in the resolution order.

## 6. Decision — trace↔ledger join key and degradation design (repo-scoped, MEDIUM)

- **Type**: decision · **Concept**: `decision:trace-ledger-join-key-design`
- **Conjectured**: the join could bind on telemetry-native identifiers (runId/slug/wave carried in interval records).
- **Refuted by**: the real interval source (ledger `mode-transition`) carries only `data: {from, to}` + runId; traces carry only cwd + timestamps (G-ARCH-002, plan-review.md:6).
- **Learned**: final design — join key = trace cwd (repo) + wall-clock overlap against per-step intervals; intervals from ledger consecutive-timestamp deltas (N rows → N−1 intervals, post-final-row time to the tail), telemetry preferred only when it yields ≥1 interval per repo; degraded tuple `(runId: row's runId | null-when-empty, pipelineStep, slug|null, wave: null)`; cost split proportionally by overlap fraction over total window duration with conservation invariant; 5-value canonical skip/tail reason enum (checkout-not-local, luca-dir-missing, no-interval-overlap, joined-partial-window, pending-no-end-time) defined once in A5, referenced (never restated) by both Stage D surfaces.
- **Criterion now**: future trace-insights phases extend this enum rather than adding parallel reason lists, and any new interval source must satisfy the ≥1-real-interval-per-repo preference test before promotion.

## Signal Synthesis

Derived solely from the orchestrator-injected signal digest.

- **Recurring failure theme — declared contracts vs empirical data (3 occurrences, spanning plan-review, gate-research, review iter 1)**: the phase's dominant failure mode was designing/writing against what schemas or plan text DECLARED rather than what real data SHOWED — nonexistent telemetry emitter (plan-review blocking), containment allocation overturned by ms-scale intervals (gate-research redirect), and the false "no runId" premise (review MF). Same root cause each time; learnings 1, 2, 3, and 5 all target it.
- **Failure clustering by step**: negatives concentrated entirely in the two judgment gates — plan-review iter 1 (NEEDS_REVISION, 2 blocking) and review iter 1 (REQUEST_CHANGES, 4 must-fix clusters across security/simplification/test-quality). Both converged in exactly one fix loop (iter 2 APPROVED / CONVERGED), matching phase 1's shape: one review loop per phase appears to be the steady state for this skill-body artifact.
- **Satisfaction valence trends**: mechanical gates uniformly positive (checks positive ×2, verify positive ×2 at 23/23 both passes) — the harness never regressed under fixes. Review valence flipped negative → positive across the single loop; net trajectory positive.
- **Confidence journal**: the one high-confidence entry (requirement-ambiguous interval-source reversal) was validated by the empirical evidence; the two medium entries (gate-resolution application, unreadable-files enum fold) resolved without rework. Confidence calibration this phase was accurate — no overconfident entry was later refuted.
- **Cross-cutting takeaway**: the gate-research accept-vs-redirect mechanism earned its cost — the single research item REDIRECTED the plan (proportional allocation) and verify.json confirms the fix loop STRENGTHENED rather than diluted that resolution (explicit denominator + conservation invariant).
