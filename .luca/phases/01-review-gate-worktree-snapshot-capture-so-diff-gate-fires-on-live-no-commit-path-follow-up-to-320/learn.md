# Learnings — Phase 01: review-gate worktree-snapshot capture (follow-up to #320)

Outcome: PASSED — 25/25 criteria across three verify passes; review converged round 3 with all
perspectives APPROVE; 45 handler + 86 classifier tests green. Complexity COMPLEX.

---

## 1. [pitfall] pitfall:llm-text-string-gate-input-namespace — HIGH

- **Conjectured**: parsing `File: {path:line}` cites from reviewer audits and string-intersecting
  them with `git diff --name-only` output would be a sound overlap proof once the obvious
  parse-failure fail-safe (`ambiguous`) was in place.
- **Refuted by**: THREE review rounds of the same silent-cite-drop bug class. Round 1: absolute
  paths, `./`/`..` prefixes, backslashes, Windows drives, uncited actionable findings, rename
  detection erasing old paths, `core.quotepath` C-quoting non-ASCII paths (independence-auditor.md
  MF1–MF4; code-architect.md MUST-FIX). Round 2 residual: embedded-separator forms `path:12:5` and
  multi-path prose still passed the new shape guard (independence-auditor.md:78). Round 3: only
  idiosyncratic punctuation-wrapping remained (SHOULD-FIX). Each escaped form fails OPEN — the
  garbage cite lands in the set, never intersects, and yields a false `zero-overlap` skip.
- **Learned**: when a gate string-matches LLM-produced text against tool output, the two strings
  live in different namespaces (LLM prose habits vs git's repo-relative, rename-collapsed,
  quote-escaped, NFC/NFD-ambiguous path emission). Whitelist the exact accepted grammar
  (`/^([^:\s]+):(\d+)$/` + shape guard) and force-normalize the tool side
  (`--no-renames`, `-c core.quotepath=false`); anything outside the grammar must fail CLOSED.
- **Criterion now**: before shipping any text∩tool-output gate, enumerate the input-format failure
  space up front (namespace prefix, separators, renames, quoting, Unicode normalization, empty/
  uncited entries) and write a negative test per form; the parser rejects-by-default. Stronger
  alternative when available: resolve each cite against ground truth (`git cat-file -e
  <tree>:<path>`) instead of string shape.

## 2. [pattern] pattern:cli-owned-verdicts-over-prose-judgment — HIGH

- **Conjectured** (at #320): gate logic could live in agent prose — instruct the LLM to run git
  commands and judge overlap itself.
- **Refuted by**: #320 shipped two prose-bug classes (vacuous zero-overlap on empty cite set;
  cite-set/severity mismatch) plus a command that was hook-blocked at the step it runs. This phase's
  D2 (context.md) moved the diff, cite parsing, fail-safes, and the 4-way verdict
  (`empty|zero-overlap|overlap|ambiguous`) into tested CLI code; gate prose collapsed to
  run-command-act-on-verdict. All three review rounds then found bugs ONLY in the CLI code — where
  they were fixable with unit tests — never in re-drifting prose (luca-tools staged stat
  byte-identical across both fix iterations, verify.json notes).
- **Learned**: any check whose failure mode is "the LLM judged wrong" should be a deterministic CLI
  verb returning a machine verdict; prose keeps only the trigger and the verdict routing. Coded
  fail-safes (empty-cite + non-empty diff → `ambiguous`; any parse failure → `ambiguous`) make the
  prose bug classes structurally impossible rather than merely discouraged.
- **Criterion now**: when a gate body contains comparison/judgment logic (not just a command
  invocation), treat it as a design smell — extract to a CLI verb with an enumerated verdict
  vocabulary and tests for every verdict + fail-safe path.

## 3. [pitfall] pitfall:hook-legality-is-a-design-input — HIGH

- **Conjectured**: carried-over lifecycle prose ("delete the payload now") and shipped commands
  (`git ls-files --others`) would work wherever the gate body runs.
- **Refuted by**: second occurrence of the "command blocked at the step it must run" class after
  #320. `rm` ∈ MUTATE_COMMANDS and REVIEWING sets `bash-mutate:false`, so the consume-once delete
  had no hook-legal mechanism (plan-review G-ARCH-002); #320's `git ls-files` union command was
  latent-blocked for the same reason (D3). Fix: consumption moved INTO `luca snapshot diff`
  (deletes on every path), and `ls-files` added to GIT_READONLY_SUBCOMMANDS.
- **Learned**: stage-gate legality (classifier verdict × stage-tool-matrix for the pipelineStep
  where the instruction executes) is a first-class design constraint on instruction bodies, not an
  afterthought. When an operation is illegal at its step, relocate it into an allowed CLI verb
  (`luca-write` is matrix-allowed in REVIEWING) rather than instructing the agent to do it.
- **Criterion now**: for every command or file operation an instruction body prescribes, verify
  classify-bash-command + stage-tool-matrix legality at the step where it runs — at PLAN time.
  Bodies must never contain rm/mutate instructions for steps where bash-mutate is false.

## 4. [pattern] pattern:consume-before-validate-payload-lifecycle — HIGH

- **Conjectured**: the diff handler could validate the payload first and delete it on the exit
  paths.
- **Refuted by**: any validate-then-delete ordering strands the payload on crash/mismatch paths,
  and a stranded baseline with a matching phase key is a stale-baseline false-skip vector
  (plan-review G-ARCH-002; Risks). Implemented instead: delete immediately after read, BEFORE any
  validation (luca-snapshot-diff.ts:196-202 per verify.json), plus a post-consumption try/catch
  mapping unexpected throws to a controlled `ambiguous` envelope (round-3 fix, :287-303).
- **Learned**: for consume-once trigger files, consumption must be the first side effect after
  read on EVERY branch; later failures degrade to the fail-safe verdict instead of leaving a
  re-armable stale trigger.
- **Criterion now**: tests assert the payload is gone after every handler path (valid, mismatch,
  unparsable, bad-tree) — this phase's suite covers all four — and any post-consumption code is
  exception-guarded to the fail-safe verdict.

## 5. [pattern] pattern:verification-probes-must-be-falsifiable — HIGH

- **Conjectured** (plan iteration 0): `bun packages/luca-cli/src/cli.ts snapshot create` was a
  valid e2e smoke for CLI wiring (ac-15).
- **Refuted by**: plan-review G-CRIT-001 — cli.ts:106 only exports `runMain`; the probe loads a
  module, executes nothing, and exits 0 on ANY state of the code. The plan's fix (add an
  `import.meta.main` guard) was then itself superseded at the confidence gate: a pre-existing
  self-invoking entry `packages/luca-cli/src/run.ts:9` (`void runMain()`) already provided a
  non-vacuous probe with ZERO production-code change (plan-review.md:75,85).
- **Learned**: two stacked lessons — (a) a verification criterion is only evidence if there exists
  a code state in which it fails; (b) before adding code to make a probe real, search for an
  existing entry point (functional-api-reuse) — the cheap research step beat the planned guard.
- **Criterion now**: for each planned probe ask "what failure makes this exit non-zero?"; if the
  answer is "none", redefine it. When a probe needs an executable entry, grep for existing
  self-invoking entries before planning new ones.

## 6. [pattern] pattern:unmeasurable-risk-voids-acceptance-condition — HIGH

- **Conjectured** (initial D4 pick): keep the `sha` filename/key to avoid one-time rename churn,
  accepting the risk "revisit if 'sha' causes confusion".
- **Refuted by**: user flipped to rename (`review-prefix-tree.json`, key `tree`) after clarifying
  that 'sha'-induced misreads by future agents are not practically measurable — no signal would
  ever trigger the "revisit" condition, so the keep-option's acceptance condition was
  unsatisfiable (context.md D4). Principle stated: ambiguous prose that agents can misread almost
  always causes mistakes; one-time mechanical churn (~9 sites) is the cheaper side.
- **Learned**: an option is only acceptable if its residual risk has a detectable trigger. "We'll
  fix it if it becomes a problem" is invalid when the problem is silent agent misinterpretation.
  Prefer renaming to unambiguous semantics and pin the retired name with an anti-criterion
  (anti-01 here).
- **Criterion now**: when a decision option carries a deferred risk, ask "what observable signal
  fires when this risk materializes?" — no signal → treat the risk as certain and pick the other
  option.

## 7. [pitfall] pitfall:dual-hand-maintained-registries-drift — MEDIUM

- **Conjectured**: registering the new `snapshot` noun in the classifier alongside cli.ts wiring
  was a complete integration.
- **Refuted by**: code-architect found `budget` (registered in cli.ts:95-98) absent from
  LUCA_NOUN_VERBS — so `luca budget check` falls through to `bash-mutate` and is blocked in
  PLANNING/REVIEWING, exactly the failure mode the snapshot entry was added to avoid
  (code-architect.md SHOULD-FIX, cross-phase). Two hand-maintained sources of truth (cli.ts noun
  registration vs classifier registry) with no completeness test binding them.
- **Learned**: every new CLI noun needs BOTH registrations, and the systemic fix is a test
  asserting every cli.ts-registered noun appears in LUCA_NOUN_VERBS or a LUCA_TOPLEVEL_* set.
- **Criterion now**: adding a `luca` noun/verb → same-PR classifier entry + classifier test case;
  the registry-completeness test remains an open cross-phase follow-up.

## 8. [convention] convention:write-command-phases-explicit-entries — MEDIUM

- **Conjectured**: omitting `snapshot create|diff` from WRITE_COMMAND_PHASES was fine since
  runWriteHandler skips the check on `undefined`.
- **Refuted by**: the registry's own documented convention says "explicit empty entry = allowed in
  any pipelineStep (registry completeness — absence is NOT the same as [])"
  (packages/luca-core/src/state/configs/step-artifacts.ts:87-90; executor flag in
  execute/summary.md; code-architect SHOULD-FIX). Unfixed this phase only because of the
  no-luca-core-edits boundary (anti-07).
- **Learned**: functional equivalence doesn't satisfy a declared registry-completeness convention;
  silent omissions erode the table as source of truth.
- **Criterion now**: new write-surface commands add explicit `'noun verb': []` entries (per the
  `'plan lint'` precedent) whenever a phase touching luca-core is in scope — open follow-up.

## 9. [procedure] procedure:git-worktree-tree-snapshot — HIGH

Verified recipe (tested: real-index non-mutation, unborn branch, untracked capture, tree-to-tree
verdicts). Trigger: need a point-in-time snapshot of the full worktree (tracked + staged +
unstaged + untracked) with zero side effects, then a reliable changed-path diff — e.g. gating on
"what changed since baseline" without commits. Steps: (1) create a temp index path (UUID name),
set `GIT_INDEX_FILE` scoped ONLY to the snapshot spawns; (2) `git read-tree HEAD` into it (on
unborn branch: `read-tree --empty` as BASE only — `add -A` still captures the worktree); (3)
`git add -A`; (4) `git write-tree` → snapshot tree sha (worktree/real index untouched); (5)
cleanup temp index + `.lock` in `finally`; (6) to diff, rebuild a current tree the same way and
run two-arg `git -c core.quotepath=false diff --no-renames <prior> <current> --name-only` —
NEVER one-arg `git diff <tree>` (untracked-in-index paths report as deleted). Caveats: dangling
trees survive ≥ gc.pruneExpire (2-week default) — verify with `rev-parse --verify <sha>^{tree}`
and fail safe if pruned; gitignored files are invisible to `add -A`.

---

## Signal Synthesis

Derived solely from the orchestrator-injected signal digest.

### Recurring failure themes

- **Cite-namespace/format false-skip class (dominant)**: review negative ×2 before converging —
  round 1 flagged false-skip routes (3/5 reviewers confirmed the cite-namespace set +
  independence's git-semantics set: renames, quotepath); round 2 left one residual
  (embedded-separator cites); round 3 closed it. Same root cause each round: LLM-text vs git-path
  namespace mismatch (→ learning 1). Three rounds for one bug class says the failure space should
  have been enumerated at plan time, not discovered incrementally.
- **Step-legality gaps**: plan-review's 3 MAJOR findings included consume-once delete being
  hook-blocked in REVIEWING (second occurrence of the class after #320's ls-files) and the vacuous
  ac-15 probe — both plan-time defects caught before execution (→ learnings 3, 5).
- **Plan-gap confidence dip (medium)**: WRITE_COMMAND_PHASES has no snapshot entries — flagged,
  deliberately not fixed (luca-core boundary) (→ learning 8).

### Satisfaction valence trends by step/source

- **checks / verify: uniformly positive ×3 each** — 25/25 harness every iteration; the
  deterministic-CLI + grep-probe criteria scheme held stable across two fix waves (luca-tools
  staged stat byte-identical both times, so rendered-body probes never re-broke).
- **review: negative→negative→positive** — friction hotspot, but convergent (B decreasing each
  round); the negativity was productive adversarial depth, not churn.
- **plan-review: negative→positive in one iteration** — NEEDS_REVISION (3 MAJOR) → APPROVED with
  B(1)=0; all three MAJORs had small localized fixes. High-value gate: every MAJOR would have been
  expensive post-execution.
- **confidence gate**: 4 auto + 1 research + 0 ask — the single research probe (ac-15 entry)
  produced the zero-code-change run.ts resolution; good calibration (nothing escalated to ask).
- **discuss**: decision-visualizer 4-question set resolved cleanly incl. one principled user flip
  (D4) — positive signal for surfacing acceptance-condition measurability during discuss
  (→ learning 6).

### Cross-cutting patterns

- **Fail-safe direction discipline paid off everywhere**: every discovered bug degraded to
  `ambiguous`/full-re-review except the fail-OPEN cite-namespace routes — which is exactly why
  those were the only MUST-FIX class. "Which direction does this fail?" is the triage question.
- **Review dissent → backlog worked**: the double-create baseline-reset finding was
  challenge-tested by its own author in round 2, confirmed out-of-band-only, and accepted as a
  backlog todo with a partial mitigation (`prior_tree` auditability) — dissent resolved by
  evidence, not by rank.
- **Prose stability as regression insurance**: keeping both fix waves CLI-only (prose untouched)
  let 16 rendered-body probes stand unchanged across iterations — reinforces learning 2.
