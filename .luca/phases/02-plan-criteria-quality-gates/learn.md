# Learnings: 02-plan-criteria-quality-gates

**Status:** COMPLETE. Cycle 1: verify PASS 17/17 + 4/4 anti, review found 1 MUST-FIX → fix cycle.
Cycle 2: wave 4 executed all fixes (ac-14..ac-27 PASS), final verify 31/31 + 4/4 anti,
code-architect re-verdict APPROVE (0 must-fix, 0 should-fix; conditional on follow-up todo, below).

---

## 1. PITFALL — new `luca` noun-groups must also register in the stage-gate bash classifier

- **Type:** pitfall · **Confidence:** HIGH
- **Concept:** `pitfall:luca-cli-noun-group-needs-bash-classifier-registration`

Registering a new `luca` CLI noun-group via the 5-point command path (handler, write-surface
export, noun-group command file, barrel, cli.ts subCommands) is NOT sufficient. The stage-gate
hook classifies bash commands via a separate allowlist in
`packages/luca-cli/src/hook/helpers/classify-bash-command.ts` (`LUCA_NOUN_VERBS` :230-248,
`LUCA_READ_VERBS` :217-226, `LUCA_TOPLEVEL_READ/WRITE` :199/:206). An unregistered noun falls
through to conservative `bash-mutate` (:476-477) and is DENIED in steps where
`STAGE_TOOL_MATRIX[step]['bash-mutate'] = false` — here, `luca plan lint` was blocked in PLANNING,
the exact step where architect.ts:338-344 mandates it. The classifier's own comment (:195-198)
documents this as a known prior failure mode; this phase walked into it anyway.

**Generalization:** extends phase-01's "phantom capability" theme. The registration surface for a
new CLI verb is now THREE independent registries: (1) handler+export+command 5-point path,
(2) `WRITE_COMMAND_PHASES` in luca-core step-artifacts.ts (explicit `[]` for phase-agnostic, not
absence), (3) the bash classifier allowlists. Missing any one produces a verb that exists but is
unusable (or undocumented) in exactly the context it was built for. Read-only verbs should also
land in `LUCA_READ_VERBS` so they classify `bash-readonly`.

**Prevention:** plan tasks adding CLI verbs must enumerate all three registries as explicit files;
plan-reviewer should probe "where is this verb invoked, and what does the classifier return for it
in that pipelineStep?"

**Cycle-2 resolution:** fixed exactly as anticipated (`plan: new Set(['lint'])` + `'lint'` in
LUCA_READ_VERBS; before/after probe bash-mutate → bash-readonly). See learning 8 for the
classifier's verb-scoping property verified during the fix review.

## 2. PITFALL — pattern-based lint checks must strip code spans before testing prose

- **Type:** pitfall · **Confidence:** HIGH
- **Concept:** `pitfall:lint-prose-patterns-fire-inside-code-spans`

Lint checks whose patterns target natural-language structure (compound connectives ` and `/` with `,
absolute quantifiers all/every/complete) fire on prose-adjacent text inside criterion probe
descriptions: backticked command text and probe phrasing. Evidence: this phase's own plan
triggered COMPOUND_CONNECTIVE twice on genuinely atomic criteria (plan.md:69 "amended with
explicit", plan.md:78 a probe describing the fixture's ` and ` content); ABSOLUTE_QUANTIFIER fires
inside backticked commands (code-architect NOTE). Paired with an instruction to "address each
warning", false positives train agents to write boilerplate justifications or ignore the entire
warning class — alert fatigue defeats the linter (dx-advocate SHOULD-FIX).

**Fix/prevention:** strip backtick code spans from a line before running prose-pattern tests, and
scope the "address each warning" instruction to allow one-line dismissal of prose-only matches.
Applies to any advisory linter aimed at LLM-authored text.

**Cycle-2 resolution:** `maskInlineCodeSpans` (same-length space masking, applied to prose checks
only — the ID check still sees the raw line), `/i` on the connective regex, and
`sanitizeControlChars` on every echoed path/err.message (closes the path-injection channel too).

## 3. PATTERN — cold-isolated subagent bodies require inline rule duplication; only same-package copies are reducible

- **Type:** pattern · **Confidence:** HIGH
- **Concept:** `pattern:subagent-isolation-makes-inline-duplication-load-bearing`

When a rule (here: criteria grammar) must be enforced by multiple agents, copies in cold-isolated
subagent bodies (plan-reviewer.ts, verifier.ts) are LOAD-BEARING — a cross-reference to the
canonical body would dangle, since subagents receive only their own body. Single consumption-side
sentences in modes (review.ts, execute.ts) are minimal and correctly scoped, also not worth
abstracting. The REDUCIBLE duplication is exactly two shapes (code-simplifier audit):
(a) same-package template-literal copies (architect.ts:344 vs skills/phase-plan/index.ts:363 lint
brief — already drifted), fixable with a shared exported constant interpolated into both BODYs;
(b) hand-condensed paraphrases, which drift BY OMISSION — phase-plan.ts:34 restated rules 1-2 but
silently dropped Rule 3 (ID-stability) entirely.

**When to use:** keep full inline copies for isolated subagent contexts; extract shared constants
(`artifacts/shared/` seam, e.g. CORE_OPERATING_RULES precedent) for same-package mirrors; never
hand-condense a rule set — interpolate a condensed constant instead. Mark exactly one copy
canonical and point others at it (architect.ts:389 confidence-triggers mirror-note is the model).

## 4. PATTERN — criteria-quality rules validated by self-application (dogfooding)

- **Type:** pattern · **Confidence:** HIGH
- **Concept:** `pattern:plan-criteria-grammar-self-compliance`

The phase that introduced the criteria grammar used it on itself, and every layer caught real
defects: plan-review round 1 found 2 BLOCKING gaps via discrimination probes — ac-10 asserted only
exit-0 (a no-op handler passes; G-CRIT-001 forced a detection-path fixture criterion ac-10.1), and
the registration surface was understated (G-DX-001). Splits used ac-NN.M without renumbering
(ac-03.1, ac-07.1, ac-09.1, ac-10.1 — ID-stability respected in the very revision that introduced
it). The new linter ran against its own phase's plan and emitted real findings (waves/01.md
meta-finding). Reviewer probe that did the work: "does any grep criterion trivially pass
pre-edit?" and "can A pass while B fails?" — these discrimination probes are the transferable
technique, not the grammar itself.

## 5. PATTERN — verifier dual-evidence fallback when runtime probes are stage-gate-blocked

- **Type:** pattern · **Confidence:** MEDIUM
- **Concept:** `pattern:verifier-structural-plus-attestation-when-probe-blocked`

Runtime criteria (ac-10/ac-10.1: actually running `luca plan lint`) could not be re-probed by the
verifier in REVIEWING — the same classifier gap (learning 1) made the invocation bash-mutate and
blocked it. The verifier did not mark the criteria unverifiable; it combined (a) executor runtime
attestation recorded in execute/waves/01.md (warnings + exit codes) with (b) independent structural
verification (exit semantics via run-handler.ts isError contract, all 4 regexes present, 5-point
registration), and documented the substitution in verify.json `notes`. Useful template: when a
probe is unrunnable in the verifying context, demand BOTH a recorded executor attestation and a
structural re-derivation — never attestation alone. (Cycle 2 reused the same template for the
classifier before/after probe and the lint fixtures: waves/02.md attestation + structural re-check.)

## 6. PATTERN — baseline-relative anti-criteria need an explicit interpretation note

- **Type:** pattern · **Confidence:** MEDIUM
- **Concept:** `pattern:anti-criteria-baseline-interpretation-notes`

Anti-criteria entered verify.json as first-class entries (met=true ⇔ regression absent) and worked,
but baseline-relative probes need interpretation pinned at execution time. anti-02 ("staged
phase-01 index undisturbed — identical before/after") would read as FAIL on a naive diff: staging
grew 22 → 36 entries (38 after wave 4). waves/01.md recorded the interpretation ("phase-01's 22
entries remain staged with content intact; later waves legitimately add files on top"), which the
verifier then used verbatim in both cycles. Rule: when an anti-criterion compares against a mutable
baseline, the plan or wave record must state the baseline snapshot AND what "undisturbed" means, or
the verifier cannot judge independently.

## 7. CONVENTION — tombstone/ID-stability contract is coherent end-to-end (repo)

- **Type:** convention · **Confidence:** HIGH
- **Concept:** `convention:luca-criteria-id-tombstone-contract`

Project contract now in force: criterion IDs are plan-authored (`- **ac-NN**:` /
`- **anti-NN**: MUST NOT — …`, splits ac-NN.M parent-preserved, never renumber), canonical grammar
in architect.ts with lint regexes keyed to it. Tombstones `[DROPPED — see decisions <date>]` stay
in plan.md but are EXCLUDED from the verify.json criteria array; consequently
`validateVerificationRef` exact-match rejecting dropped ids with CRITERION_NOT_FOUND is CORRECT
behavior, documented at every consumption site (verifier.ts:87, review.ts:82, execute.ts:255).
~~Open ambiguity: split-parent fate~~ — RESOLVED in cycle 2, see learning 11 (split parents become
`[SPLIT → ac-NN.1, ac-NN.2]` pointers, excluded like tombstones).

---

## Cycle 2 (wave 4 review fixes — phase now COMPLETE)

Wave 4 executed all review fixes in one parallel wave; verify cycle 2 re-probed all 31 criteria +
4 anti (PASS); code-architect re-verdict APPROVE with 0 must/should-fix. Fixes: classifier
registration (learning 1 resolution), explicit `'plan lint': []` registry entry ([]-skip semantics
verified at run-handler.ts:56 — allowed anywhere, not nowhere), lint robustness (learning 2
resolution), split-parent fate settled across 4 surfaces, `## Decisions` template section,
mirror/brief drift restores (phase-plan.ts Rule 3 + lint invocation; skill "substitute for review"
sentence).

## 8. CONVENTION — classifier verb scoping: LUCA_READ_VERBS gates only after noun-set membership (repo)

- **Type:** convention · **Confidence:** HIGH
- **Concept:** `convention:luca-classifier-read-verbs-gated-by-noun-membership`

Verified property (code-architect cycle-2 over-grant trace, classify-bash-command.ts:276-296):
`LUCA_READ_VERBS` is consulted ONLY after the verb passes noun-set membership in
`LUCA_NOUN_VERBS[noun]`. Adding `'lint'` to the global read set grants nothing to nouns whose verb
sets lack `lint` — `luca state lint` hits the unknown-verb branch and classifies `luca-write`
(conservative). Redirect override preserved: `luca plan lint > file` still classifies bash-mutate.
LATENT caveat (pre-existing): the read set is global by NAME — a future noun adding a *mutating*
verb spelled `lint`/`read`/`list` would silently classify read-only. Check this when adding verbs.

## 9. PATTERN — fix-cycle criteria must fail against the as-built (pre-fix) code

- **Type:** pattern · **Confidence:** HIGH
- **Concept:** `pattern:fix-criteria-must-fail-pre-fix`

Discrimination probing applies with a twist in fix cycles: the baseline is the AS-BUILT code, not
the pre-phase tree. Plan-review cycle 2 (G-CRIT-004) caught that ac-22's original probe passed
against the unfixed linter — the planned "[SPLIT lint-exemption" task element was dead code (the
as-built linter already passed pointer lines). Resolution preserved ID-stability: the dead task
element was dropped and ac-22 was content-replaced under the SAME id with a round-trip fixture that
now guards the lint edits against split-convention regression. Reviewer check to institutionalize:
for every criterion attached to a fix, ask "does this fail before the fix is applied?" — and when a
criterion proves vacuous, replace its content, never renumber. Companion probe pattern: ac-14 and
ac-26 both encoded an explicit before/after pre-state (bash-mutate→bash-readonly; grep 0→1).

## 10. PATTERN — instruction text referencing a destination must verify it exists in the shipped template

- **Type:** pattern · **Confidence:** HIGH
- **Concept:** `pattern:instruction-references-need-existing-destinations`

G-SCOPE-002 (BLOCKING, plan-review cycle 2): tombstone text "see decisions <date>" and the
lint-justification instruction "justify in the plan's decisions/notes" both referenced a
decisions/notes location that did NOT exist in the plan.md template the same file ships — an agent
following the flow had nowhere defined to record what it was told to cite. Fix: minimal
`## Decisions` template section (ac-26, 0→1 pre-state probed), closing the dangling pointer.
General check for instruction-body authoring/review: every artifact, section, or path an
instruction tells an agent to write to or cite must exist in the template/contract shipped
alongside it — grep the referenced destination in the same delta.

## 11. DECISION — split-parent convention settled: [SPLIT → …] pointer, excluded like tombstones (repo)

- **Type:** decision · **Confidence:** HIGH
- **Concept:** `decision:luca-split-parent-pointer-convention`

Supersedes the OPEN flag in learning 7. When a criterion splits, the parent line becomes
`- **ac-NN**: [SPLIT → ac-NN.1, ac-NN.2]` — kept in plan.md (ID-stability), EXCLUDED from the
verify.json criteria array exactly like tombstones; only live ac-NN.M children get entries.
Consistent across four surfaces (code-architect cycle-2 item 5): architect rule :246 + template
:217, verifier enumeration :87, review.ts liveness clause :82 ("non-tombstoned, non-split-parent",
with CRITERION_NOT_FOUND re-point guidance), phase-plan mirror :34. `validateVerificationRef`
needed no change — array exclusion makes exact-match rejection automatic. Round-trip lint fixture:
pointer + .1/.2 children + anti-NN → 0 warnings.

---

## Deferred follow-ups (conditional acceptance — orchestrator filing todo)

Code-architect's APPROVE is conditional on a follow-up todo actually being filed at phase close:
- shared `CRITERIA_GRAMMAR` constant extraction into `artifacts/shared/` (collapse 7 prose mirrors → 1)
- shared lint-brief constant (architect.ts:344 ↔ skills/phase-plan/index.ts:363)
- `.M`-sibling heuristic simplification in luca-plan-lint.ts (basesWithSubs single pre-pass)
- plan.ts file-header trim (intra-package 4× lint-semantics duplication → terse pointer)
- plan-reviewer item 9: mention the `[SPLIT → …]` pointer form (predates it; consistent but stale)
- execute.ts:255: append split-parent pointers to the out-of-scope clause (cycle-2 residual NOTE)

## Skipped (low confidence or trivial)

- [pitfall] split-parent-fate ambiguity — resolved in cycle 2; recorded as decision (learning 11).
- [note] CLI nits (--file positional, void ctx) — captured in audits; not generalizable.
- [note] WRITE_COMMAND_PHASES absence-vs-`[]` — folded into learning 1's registry enumeration;
  the []-semantics verification ("allowed anywhere, not nowhere") noted in Cycle 2 summary.
- [update] learning 1 evidence extension — fix landed as anticipated; no new persist needed beyond
  learning 8's scoping property.
