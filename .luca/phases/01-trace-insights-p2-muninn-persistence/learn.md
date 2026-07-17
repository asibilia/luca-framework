# Learn — trace-insights-p2-muninn-persistence

Phase: MODERATE, 2 files, 1 wave + 1 review-fix wave. Verified 25/25 twice; review iter 1 = REQUEST_CHANGES (5 must-fix clusters), iter 2 = CONVERGED.

## 1. Pitfall — new write surface added without re-binding existing guarantees

- **Type**: pitfall · **Concept**: `pitfall:new-write-surface-unscoped-guarantees` · **Confidence**: HIGH
- **Conjectured**: Appending Stage F (MuninnDB persistence) with its own scope-guard entry was sufficient; the skill's existing privacy/secret directives would implicitly cover it.
- **Refuted by**: security-auditor MUST-FIX x2 (`audits/security-auditor.md`): the Privacy directive bound evidence caps + secret-scanning to "the report and in GitHub issues" ONLY (index.ts:41 pre-fix), so verbatim trace evidence could flow into shared default-vault engrams; and P1's implicit human-review gate (GitHub issues) vanished, making injected trace text a durable cross-repo injection vector with zero review.
- **Learned**: A new write surface is not additive — it re-opens every existing invariant. Privacy caps, secret scanning, and untrusted-data rules must be explicitly re-bound to EACH surface ("in the report, in GitHub issues, AND in MuninnDB memory content"), and you must ask what human gates the new surface bypasses.
- **Criterion now**: When a phase adds a write surface, enumerate the artifact's existing guarantees and require a test assertion proving each one names the new surface (fix wave added the 4-test privacy block, index.test.ts:64-89).

## 2. Pitfall — presence-only `toContain` assertions are vacuous for prompt bodies

- **Type**: pitfall · **Concept**: `pitfall:presence-only-tocontain-vacuous` · **Confidence**: HIGH
- **Conjectured**: Asserting that key tokens (`pitfall:trace-`, `muninn_evolve`, `7d`) appear in the body pins the contract.
- **Refuted by**: test-quality audit 4 must-fix: vault assignments could be swapped/deleted without a failure (token appears regardless); every recall-then-evolve token also appeared outside Stage F1; the 7d-fallback literal was satisfied by the args section, not the corruption path; write-ordering had no assertion at all.
- **Learned**: Body-regression tests must pin section-unique anchors: full table rows including the value cell (`` `pitfall:trace-<fingerprint>` | `default` ``), literals unique to the directive section they guard, negative anchors (`not.toContain`), and each behavioral invariant (ordering, never-evolve-cursor) as its own assertion.
- **Criterion now**: For each `toContain` literal, verify `grep -c` in the body equals the expected count and the match sits inside the section under test; presence-anywhere is a review reject.

## 3. Pitfall — semantic recall used as concept lookup (limit-1 identity trust)

- **Type**: pitfall · **Concept**: `pitfall:muninn-recall-limit1-as-concept-lookup` · **Confidence**: HIGH
- **Conjectured**: `muninn_recall(mode: "recent", limit: 1)` on the cursor concept reliably returns the cursor engram (memory-audit precedent copied verbatim).
- **Refuted by**: security-auditor SHOULD-FIX promoted to MF-2: recall has no concept lookup; a semantic neighbor (`metric:trace-report-<date>` shares the prefix) or any cursor-shaped memory can win limit-1 — a shape-valid impostor with future `lastAnalyzedUntil` silently analyzes nothing.
- **Learned**: MuninnDB recall is similarity search, not keyed lookup. Any recall-as-lookup must over-fetch (limit 5) and filter for exact `concept` equality as part of validation, treating mismatch as missing (fresh state + fallback + warn).
- **Criterion now**: Every recall that feeds control flow includes a concept-equality filter; identity is validated, never inferred from rank.

## 4. Pitfall — documented fields/flags with no consuming stage

- **Type**: pitfall · **Concept**: `pitfall:prompt-artifact-dead-field-unwired-flag` · **Confidence**: HIGH
- **Conjectured**: Defining `seenTraceIds` in the cursor schema and `--project` in the args table was enough; consumption was implied.
- **Refuted by**: MF-2 (no stage applied the seenTraceIds exclusion — dead field) and MF-3 (`--project` never referenced by Stage A1's fetch, which read only the env var — unwired flag).
- **Learned**: Prompt artifacts have dataflow bugs just like code: every schema field and CLI flag must name its consumer stage explicitly (fix: Stage A3 "Cursor exclusion" bullet; `PROJECT` resolved once in Preconditions and referenced by A1).
- **Criterion now**: For each field/flag a phase introduces, grep the body for the stage that consumes it; no consumer = cut it or wire it before review.

## 5. Pattern — locked verbatim-string contract + grep-able mandated literals

- **Type**: pattern · **Concept**: `pattern:grep-literal-ac-probes-for-prompt-artifacts` · **Confidence**: HIGH
- **Conjectured**: Binary verification of a docs-as-code change is hard; semantic judgment probes would be needed.
- **Refuted by**: (positive refutation of the doubt) first verify 25/25 and re-verify 25/25 with zero probe ambiguity: context.md listed 5 test-contract strings that must survive verbatim, and every plan task named the exact literals it must emit, so all 18 content ACs were single `grep -q` commands (plan.md ac-01..ac-18).
- **Learned**: For prompt-artifact phases, mandate the grep-able literals in the task text itself and make each AC one binary grep. BUT greps prove presence, not adequacy — the same phase that passed 25/25 drew 5 must-fix clusters from cold multi-perspective review. The pair (mechanical greps + cold review) is the working unit; neither alone suffices.
- **Criterion now**: Plan ACs for body edits are literal greps named in the task; semantic coverage (scope gaps, dead fields, vacuous tests) is delegated to the review step, never assumed from a green verify.

## 6. Decision — Stage F append + remember-latest-wins bounded cursor

- **Type**: decision · **Concept**: `decision:trace-insights-stage-f-cursor-shape` · **Confidence**: HIGH
- **Conjectured**: The spec's own wording ("Stage E memory persistence") implied renumbering the issue feed.
- **Refuted by**: research flagged stage-letter ripple as HIGH risk; user locked (context.md decisions 1-3): append as Stage F after untouched Stage E; cursor = remember-latest-wins fresh `metric:trace-insights-cursor` each run (never `muninn_evolve` — evolve reserved for insight recurrence), memory-audit precedent; cursor JSON bounded to exactly `{schemaVersion, lastAnalyzedUntil, seenTraceIds (1h trailing overlap window only), updatedAt}` — no unbounded seen-set.
- **Learned**: Minimal-churn append beat renumbering (anti-03 guarded it; all Stage E test anchors survived); latest-wins cursor keeps evolve semantics clean; bounding seenTraceIds to the overlap window prevents unbounded growth. Fix wave added the constant-defined-once rule (1h overlap lives only in F3; --since auto references it by pointer).
- **Criterion now**: anti-03 (`Stage E — GitHub issue feed` heading intact) plus the never-evolve-cursor and 4-field-schema test assertions.

## 7. Procedure — skill-body edit recipe (luca-tools instruction artifacts)

- **Type**: procedure · **Concept**: `procedure:luca-tools-skill-body-edit` · **Confidence**: HIGH
- **Trigger**: Any phase that edits a luca-tools skill/mode instruction body (markdown-in-TS template literal) plus its body-regression test.
- **Steps**: 1) Lock decisions AND the verbatim test-contract strings in context.md before planning. 2) Plan mandates the exact grep-able literals per task; every content AC is one binary grep; anti-criteria guard untouched sections. 3) Edit the body keeping template-literal escaping valid (`` \` ``/`\\`) — `bunx --bun tsc --noEmit` catches breakage. 4) Pin tests with section-unique anchors, full table rows, and negative anchors (see pitfall 2). 5) Gates: tsc → targeted test file → full package `bun test packages/luca-tools`. 6) Run cold multi-perspective review for what greps cannot see (guarantee scope, dataflow, injection surface).
- **Verified by**: both verify passes 25/25; fix wave confined to the same two files; suite grew 54→64 tests with zero regressions.

## Signal Synthesis

Derived from the orchestrator-injected signal digest.

- **Recurring failure theme (one cluster)**: all 5 review must-fix clusters share one root cause — the new MuninnDB write surface was mechanically complete but not semantically integrated (privacy/injection not re-scoped, cursor identity unvalidated, dead `seenTraceIds`, unwired `--project`, vacuous assertions). No failure signal came from mechanical gates: typecheck/tests/verify were green on both iterations.
- **Valence by step**: checks positive x2 and verify positive x2 (frictionless execution + verification); review negative→positive in one iteration (REQUEST_CHANGES mustFix=5 → CONVERGED mustFix=0). Friction concentrated entirely in the review step — which is the step working as designed, since it caught what greps structurally cannot.
- **Confidence correlation**: the medium-confidence journal entries (grep-literal strategy, cursor-schema exactness, 1h overlap/seenTraceIds wiring) map directly onto where must-fixes landed (MF-2, MF-5). Medium-confidence design choices in prompt-artifact phases are a predictor of review findings and deserve pre-review self-audit.
- **Process friction (deviations)**: executor `Write` of execute/summary.md + progress.jsonl hook-blocked by the subagent allowlist (orchestrator persisted instead); git commits stage-gate-blocked at execute/learn steps for the fix wave, deferred to finalize. Both handled without data loss; the first-wave commit path worked fine — the friction is specific to post-review fix waves.
