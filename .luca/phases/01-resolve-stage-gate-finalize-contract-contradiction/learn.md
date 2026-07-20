# Learnings — Phase 01: resolve stage-gate/finalize contract contradiction

Complexity: COMPLEX · Verification: PASS (after one review-driven fix loop) · Repo: luca-framework

Each learning is framed as a corrected error: the assumption going in, the evidence that
broke it, the corrected understanding, and the check that catches a recurrence.

---

## pattern:severity-map-insert-is-order-preserving-embedding
**Type:** pattern · **Confidence:** HIGH

- **Conjectured:** Adding a new category (`bash-stage`) to an ordered severity map is a
  local insert — pick a number below the neighbor you care about and you are done.
- **Refuted by:** plan-review G-SEC-001b + the `maxCategory` merge (`classify-bash-command.ts:385`,
  `SEVERITY[a] >= SEVERITY[b] ? a : b`, ties keep FIRST-seen). A tier-1 TIE with `bash-mutate`
  lets `git add . && rm -rf build` merge to `bash-stage` and ride into FINALIZING where
  `bash-mutate` is denied. Bumping only `bash-mutate` would have flipped
  `luca checks run && rm -f x` from `luca-write` to `bash-mutate`, tightening a legal path.
- **Learned:** Inserting into an order-consumed map is a FULL order-preserving embedding.
  Rewrite the map wholesale (`bash-readonly:0, bash-stage:1, luca-write:2, bash-mutate:2,
  bash-commit:3, denied:4`) preserving EVERY existing pairwise relation — including the
  deliberate `luca-write === bash-mutate` shared tier — not just the one you are adding.
- **Criterion now:** Pin each relation with its own probe (ac-21.1–21.5) plus a preservation
  guard for any deliberate tie (anti-09). Ordering is only safe as a complete substitution,
  never an incremental bump.

## pattern:new-classifier-branch-replicates-all-sibling-escalations
**Type:** pattern · **Confidence:** HIGH

- **Conjectured:** A new classifier branch only needs to implement its happy path (bare
  `git add` → `bash-stage`).
- **Refuted by:** Code review (security HIGH). The new branch omitted the shell-redirect
  escalation every sibling branch applies, so `git add . > src/x.ts` truncated an arbitrary
  file in FINALIZING while classified as harmless `bash-stage`. Verify had passed it.
- **Learned:** A branch that DEMOTES a command to a weaker severity tier must replicate ALL
  sibling escalations of the tier it left, especially output-redirect → mutate. Fix at
  `classify-bash-command.ts:516`: `category: sub.redirect ? 'bash-mutate' : 'bash-stage'`.
  Model on the mutate branch (keeps `lastNonFlag(rest)` target extraction, anti-08), NOT the
  commit branch (returns `targetPaths: []` and drops the target the hook's always-denied
  path check consumes).
- **Criterion now:** For every new/demoted bash branch, add a regression test that the
  redirect form (`cmd ... > file`) still classifies as `bash-mutate` and carries its target.

## pitfall:demoting-severity-silently-drops-redirect-guard
**Type:** pitfall · **Confidence:** HIGH

- **Conjectured:** Reclassifying `git add` from `bash-mutate` to a gentler `bash-stage` is
  purely a loosening with no downside.
- **Refuted by:** the redirect path — `bash-mutate` implicitly guarded `> file` truncation;
  the new gentler tier inherited none of that guard until the fix loop.
- **Learned:** Demoting a command to a weaker tier silently DROPS every guard the old tier
  provided as a side effect (redirect-truncation being the sharp one). Enumerate what the old
  tier was protecting before you move a command out of it.
- **Criterion now:** Before demoting, grep the old branch for `redirect`/`targetsFromRedirect`
  and carry each guard forward with an explicit test.

## pitfall:gated-verifier-cannot-run-tests-passes-runtime-only-bugs
**Type:** pitfall · **Confidence:** HIGH

- **Conjectured:** The verifier's PASS on `verify.json` means every acceptance/anti criterion
  was empirically exercised.
- **Refuted by:** the verifier was itself stage-gate-blocked from running `bun test`/`bun -e`
  in REVIEWING (its subagent inherits the owner session_id — the phase's own finding), and
  fell back to source-reading. Source-reading did not model the shell `>` redirect, so the
  `git add` truncation bug passed verify and was caught only by code review.
- **Learned:** A verifier that cannot execute code can miss defects that only a runtime test
  reveals (shell redirects, actual regex behavior, merge semantics). The dual-evidence
  fallback (source-read + orchestrator-run harness) is weaker than execution for anything
  where the behavior emerges from an unmodeled runtime interaction.
- **Criterion now:** When verify runs under the stage gate with `bun` blocked, treat behavioral
  criteria as provisional; ensure the orchestrator-run harness actually covers the redirect/
  edge forms, and keep a downstream reviewer that CAN reason about runtime side effects.

## pitfall:empty-write-command-phases-is-skip-not-deny
**Type:** pitfall · **Confidence:** HIGH

- **Conjectured:** A registered write verb missing from `WRITE_COMMAND_PHASES` is denied by
  default (fail-closed).
- **Refuted by:** `run-handler.ts:53-67` — a missing key yields `undefined` and SKIPS the
  self-check entirely; `[]` means "allowed in every step". Both are indistinguishable at
  runtime from an absent key. `snapshot`/`budget` shipped as classifier-registered write
  nouns with no phase entry — a silent soundness hole, not a denial.
- **Learned:** Registering a write verb is granting a phase-wide permission (the matrix allows
  `luca-write` in every non-IDLE phase); it is only sound if the verb ships a
  `WRITE_COMMAND_PHASES` entry. Absence = silent skip, never deny. A wrong non-empty value is
  pipeline-fatal (`runWriteHandler` hard-exits, and the hook calls `state claim-owner` in ANY
  phase, so its entry must be `[]`).
- **Criterion now:** A completeness invariant test (classify-bash-command-registry.test.ts
  invariant-5): every `LUCA_NOUN_VERBS` pair whose verb is absent from `LUCA_READ_VERBS` MUST
  have a `WRITE_COMMAND_PHASES` key, with no dead exemption list.

## decision:bash-stage-category-over-git-add-in-commit-set
**Type:** decision · **Confidence:** HIGH

- **Conjectured:** context.md's D1 said move `git add` into `GIT_COMMIT_SUBCOMMANDS`, resting
  on the premise that "executor commits depend on the bystander exemption."
- **Refuted by:** a live probe — a Bash call from the planning subagent was BLOCKED
  (`stage-gate BLOCK ... category=bash-mutate`) on the owner session_id, independently
  reproduced by the reviewer subagent. Subagents are NOT bystander-exempt; they inherit the
  parent session_id. So moving `git add` to the commit set would newly BLOCK bare `git add`
  in EXECUTING (`bash-commit: false`), regressing executors.
- **Learned:** Introduce a DISTINCT `bash-stage` category: `true` in EXECUTING (preserves
  today) + FINALIZING (fixes the bug), `false` in PLANNING/REVIEWING. Staging is not
  committing; it should travel as its own tier.
- **Criterion now:** anti-03 (bare `git add` still allowed in EXECUTING), anti-04 (no
  `bash-commit` grant in EXECUTING). Empirically probe bystander-exemption assumptions before
  building on them.

## decision:d5-rules-suggest-retarget-classifier-was-right-prose-was-wrong
**Type:** decision · **Confidence:** HIGH

- **Conjectured:** context.md's D5 (user-decided) said `luca rules suggest` writes draft
  `.luca/rules/*.ts`, so its `LUCA_TOPLEVEL_READ` classification was a write-as-read hole to fix.
- **Refuted by:** `rules.ts:122-134` — `suggestCommand` only `process.stdout.write`s markdown;
  it performs NO filesystem write, and never routes through `runWriteHandler`. Moving the noun
  would have reclassified three unrelated verbs and added an inert `WRITE_COMMAND_PHASES` key.
- **Learned:** The classifier was CORRECT; the defect lived in the finalize instruction prose
  (`finalize.ts:22,286,288`) that falsely claimed a write. Retarget the fix to the prose, and
  FLAG the reinterpretation for the user rather than silently executing a user-decided item on
  a false premise.
- **Criterion now:** anti-06 (`rules` stays in `LUCA_TOPLEVEL_READ`); ac-12.1 greps the false
  write-claim prose out of finalize.ts. When a user-decided item rests on a factual premise,
  verify the premise against source before implementing.

## convention:allowlist-entry-is-a-permission-grant-needing-comment-and-widen-guard
**Type:** convention · **Confidence:** HIGH

- **Conjectured:** Adding a matrix column / classifier branch / registry entry is a mechanical
  config edit.
- **Refuted by:** repeated across this lineage — every such entry IS a permission grant
  (`release-artifact` column, `bash-stage`, `TMP_FILE_RE` widening to `.md`). The `.md`
  widening silently legalized `.luca/tmp/*.md` in ALL steps, not just FINALIZING, because
  `TMP_PATH_PATTERN`'s allow returns before the `STEP_ARTIFACTS` gate.
- **Learned:** In this repo an allowlist/matrix/classifier entry is a permission grant that
  needs (a) a code comment stating the justification and its bounded intent, and (b) a test
  that FAILS if the grant widens beyond that intent.
- **Criterion now:** Every new allow ships an anti-criterion (anti-01 no code-write in
  FINALIZING, anti-02 no `.changeset/*.ts` write, anti-05 no nested tmp path, anti-07 no
  laundered mutation). No grant lands without its widen-guard.

---

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>` block.

**Recurring failure themes:** One dominant failure theme — a single security defect surfaced
at the `review` step (security HIGH: the `git add` bash-stage branch missing redirect
escalation, opening arbitrary file truncation in FINALIZING). It was isolated to one step and
closed in one fix loop (MF1). No recurring/clustered failure signals across waves; the arc was
converge-clean elsewhere.

**Satisfaction valence trends by step/source:**
- `discuss` — POSITIVE (user took the recommended narrow path class + git add, selected all
  four adjacent defects).
- `checks` — POSITIVE twice (typecheck + five stage-gate suites green first pass; harness green
  again after the MF1 fix, 103 classify tests).
- `verify` — POSITIVE (all ac/anti hold, D4 guard non-vacuous, D5 retarget sound).
- `review` — one NEGATIVE (the security HIGH) then POSITIVE on re-review (all reviewers approve).
  Review is the friction hotspot: it was the only source of negative valence and the only place
  the runtime-only bug was caught.

**Cross-cutting pattern:** The classifier.override MODERATE→COMPLEX (heuristic-promotion,
"widens a security boundary") proved correct — the phase's single real defect WAS a security
boundary regression that the automated verify missed and only a reasoning reviewer caught. The
promotion-to-COMPLEX heuristic on security-boundary work is validated by this run: it bought the
extra review depth that caught the truncation hole.
