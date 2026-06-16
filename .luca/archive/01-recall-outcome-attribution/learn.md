# Learnings — Phase 01-recall-outcome-attribution (COMPLEX, v13.1.0)

Outcome: PASS (clean). REQ-11 (record-recall parity at 5 v13 luca-tools `.ts` modes + `.ts`-surface test) + REQ-12 (new `recall.utilization` telemetry kind, recalledIds threaded into recall emits, outcome-time utilization emit, read-time correlation in telemetry-report). tsc PASS, surface test 10/10, 14/14 ac met, 3 anti hold, 3 reviewers approve 0 must-fix.

---

## pitfall:test-asserts-wrong-surface-of-record

**Type:** pitfall · **Confidence:** HIGH

- **Conjectured:** the existing green `recall-prose.test.ts` proved record-recall parity across "all modes", so the directive was covered everywhere.
- **Refuted by:** that test reads only the legacy luca-mastracode `.md` instructions; the v13 runtime surface is the luca-tools `.ts` modes (materialized to `~/.claude/`), which had NO test and the actual recall-without-emit gap (context.md:11-12). A green suite masked an untested surface.
- **Learned:** "test is green" is meaningless until you confirm WHICH artifact the test reads. When wiring a directive across "all modes", both runtimes were live (`.ts` Claude Code harness, `.md` Mastra harness) and only one was asserted.
- **Criterion now:** before trusting a parity test, grep the test's file-glob/imports to confirm it loads the production surface you changed; add a sibling test on the real surface if not (here: `modes/record-recall.test.ts`).

## pitfall:vacuous-bun-test-t-filter

**Type:** pitfall · **Confidence:** HIGH

- **Conjectured:** an acceptance probe `bun test -t recalledIds` exiting 0 confirms the recalledIds assertions ran and passed.
- **Refuted by:** `bun test -t <pattern>` EXITS 0 when ZERO tests match the name pattern — so a `-t`-gated check passes vacuously if no test BLOCK is named to contain the literal (plan-review.md:22, G-DX-003).
- **Learned:** name-filtered test runs are only meaningful when a test block name contains the filter literal; otherwise green is indistinguishable from "nothing ran".
- **Criterion now:** name the test block to contain the filter literal (here each test is `${mode} meta includes recalledIds`), AND prove non-vacuity by remove-one → expect fail → restore (ac-14 ran 5 tests, proven failing-then-restored).

## pitfall:token-presence-vs-runnable-command

**Type:** pitfall · **Confidence:** HIGH

- **Conjectured:** an acceptance probe matching the emit-kind token (e.g. `toContain('recall.hit')`) proves the directive is usable.
- **Refuted by:** the recurring phantom-capability pitfall — a bare token can match documentation prose, and a directive missing the REQUIRED `--run-id` flag or real meta keys is non-runnable yet token-present (context.md:29).
- **Learned:** an emit directive must be probed as a FULL runnable command — `--kind`, the required `--run-id`, and the real `recordRecallAction` meta keys (`query`/`resultCount`/`verifiedCount`/`vault`/`callerMode`/`durationMs`). ac-07 was named the authoritative per-mode independent gate, not ac-06's smoke check.
- **Criterion now:** acceptance asserts all required tokens on ONE line per mode, INDEPENDENTLY per mode (fails if any single mode lacks a key), never a bare kind token.

## pitfall:tocontain-matches-prose-not-json

**Type:** pitfall · **Confidence:** MEDIUM

- **Conjectured:** `toContain('query')` in the surface test verifies the `--meta` JSON carries the `query` key.
- **Refuted by:** test-quality reviewer should-fix — `toContain('query')` also matches the meta-key DOCUMENTATION prose surrounding the directive, not strictly the `--meta` JSON payload.
- **Learned:** substring assertions on instruction bodies that mix prose + command are weak; they can pass on the explanatory sentence.
- **Criterion now:** assert the quoted-JSON form (`'"query":'`) or the full emit substring. Carried as a known non-blocking follow-up (not yet hardened).

## pattern:additive-telemetry-kind-extension

**Type:** pattern · **Confidence:** HIGH

- **Conjectured:** adding a new telemetry event type might need a schema version bump and dedicated validation.
- **Refuted by:** the `TelemetryKind` union is open and the meta schema is `.passthrough()` — a new kind rides the union with an advisory passthrough meta schema and NO schema `v` bump (anti-01 held; v:1 untouched at schemas.ts:47).
- **Learned:** the low-risk extension path is: (1) add the kind string to the `TelemetryKind` union, (2) define an advisory `*MetaSchema` with `.passthrough()`, (3) re-export it from the `telemetry/index.ts` barrel. The barrel re-export is MANDATORY — tsc will NOT catch a missing one (consumers import from the barrel).
- **Criterion now:** when adding a telemetry kind, assert both the union member (ac-08) AND the barrel re-export (ac-09) explicitly; never assume tsc covers the export.

---

## Signal Synthesis

Source: orchestrator-injected `<signal-digest>`.

**Satisfaction valence — all positive, no friction hotspots.** Three `satisfaction:outcome` signals (checks/verify/review) trended positive: tsc noEmit pass after 3 waves, 14/14 ac met with 3 anti hold, 3 reviewers approve 0 must-fix. No negative-valence signals this run — a clean COMPLEX phase.

**Recurring confidence theme — medium-confidence design judgment calls (2).** Both confidence dips were design-ambiguity, not execution risk:

- *requirement-ambiguous* — Approach 1 attribution is run-level→per-memory statistical/post-hoc by `runId + step`, not causal (context.md:21). Accepted as MVP; risk lives in the interpretation of `recall.utilization` correlation, not the wiring.
- *convention-unclear* — chose a new `.ts`-surface sibling test over extending the `.md`-only `recall-prose.test.ts`, avoiding cross-package coupling between luca-tools and luca-mastracode.

**Cross-cutting:** both confidence dips resolved cleanly through plan-review (2 blocking → 0 across 2 rounds); the medium-confidence judgments were sound. No systemic issue surfaced — the friction was upfront design ambiguity, correctly front-loaded into discuss/plan-review rather than leaking into execution.
