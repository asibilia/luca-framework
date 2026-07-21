# Learn — Phase 01: Handoff envelope schema and local mailbox transport

Complexity CRITICAL · 15 tasks · 3 waves · 2 plan-review rounds · 1 code-review fix wave
Final: `tsc` clean, 154 tests pass, 8/8 checks, five runtime probes re-run independently.

---

## L1 — Verification vacuity is shape-shifting; the general test is "does this criterion fail today?"

- **Type:** pitfall · **Concept:** `pitfall:vacuous-verification-criteria` · **Confidence:** HIGH
- **Conjectured:** vacuity is a known, closed problem — the repo already codifies a guard against
  `bun test -t "<substring>"` (G-DX-003, `.luca/archive/02-cost-per-outcome-report/plan-review.md:20`;
  anti-05 in `.luca/archive/03-pr-outcome-writeback/plan.md:84`), so naming the banned form suffices.
- **Refuted by:** the same failure appeared three times in three disguises in ONE phase.
  (a) 12 of 22 criteria were `-t` name filters — a filter matching zero tests exits 0
  (`plan-review.md:28`). (b) The round-1 fix — source-presence `grep -qF` — reintroduced it: ac-19's
  literal `"handoff"` already matched at `classify-write-path.test.ts:94,184` at HEAD, so the sole
  evidence for D11 passed on an untouched tree (`plan-review.md:44`). (c) anti-06 used `grep -rzPn`;
  BSD grep exits 2 with `invalid option -- P`, and because the pass condition was "no matches", a
  NON-EXECUTING command reported clean (`execute/summary.md:41-48`). Banning form (a) generalized to
  neither (b) nor (c).
- **Learned:** the banned *forms* are instances; the invariant is **a verification criterion must be
  observed to FAIL on the pre-change tree.** Two corollaries: a source-presence grep is non-vacuous
  only if the literal is verifiably ABSENT at HEAD; any criterion whose pass condition is "no output"
  must fail closed — if the tool/flag is unavailable the guard silently evaporates rather than erroring.
- **Criterion now:** for every acceptance criterion, run it at base-sha and record the non-zero exit
  (this phase did: `grep -qF "/.luca/handoff/" …` → exit 1 at HEAD, exit 0 after; `ls
  packages/luca-core/src/handoff` → `No such file or directory`, `plan-review.md:68-69`). For any
  "expect no matches" guard, first assert the tool supports the flags on THIS machine, or prefer a
  runtime probe that asserts a positive observation instead of an absence.

## L2 — An agent's self-spawned reviewer converges to a false pass

- **Type:** pitfall · **Concept:** `pitfall:self-review-false-convergence` · **Confidence:** HIGH
- **Conjectured:** a planning agent that spawns its own reviewer and gets APPROVED/CONVERGED has
  satisfied the review gate.
- **Refuted by:** the architect's self-review returned APPROVED on a plan where 12 of 22 criteria
  would pass whether or not the code existed (`plan-review.md:9-20`). Its stated reason was invalid:
  it declared the vacuity "closed" because task PROSE mandates test names — but violating a prose
  directive still leaves the criterion passing. Two independent cold rounds then found 4 HIGH blockers
  each, all distinct.
- **Learned:** self-review shares the author's frame, so it inherits exactly the blind spots that
  produced the defect. It is a useful pre-pass, never a substitute for a cold reviewer with fresh context.
- **Criterion now:** review verdicts count only from an orchestrator-spawned reviewer with fresh
  context. A self-spawned APPROVED is recorded as provenance and explicitly overruled or re-run.

## L3 — Single-environment evidence cannot refute a portability claim

- **Type:** pitfall · **Concept:** `pitfall:portability-refuted-from-one-shell` · **Confidence:** HIGH
- **Conjectured:** the orchestrator can settle "does `grep -P` work here?" by running it in its shell.
- **Refuted by:** round 2 flagged anti-06 inert on darwin (G-DX-002). The orchestrator ran
  `echo test | grep -P "t.st"`, it matched, and the finding was marked **REFUTED** (`plan-review.md:48`).
  Both the executor and the verifier subsequently hit `invalid option -- P`
  (`execute/summary.md:43,50-52`). Different agents resolve different binaries on the same machine.
- **Learned:** a portability claim is a claim about the set of environments, and one passing shell is
  a single sample from it. Refuting it requires either the same shell as the consumer or a
  capability-independent rewrite.
- **Criterion now:** never refute a tool/flag-availability finding from the orchestrator's shell.
  Either have the agent that will actually run the command probe it, or remove the dependency
  (rewrite the guard in Bun, as the executor ultimately did — 0 matches over all 16 handoff files).

## L4 — Mutation testing is the cheapest check for security-critical lines

- **Type:** pattern · **Concept:** `pattern:mutation-probe-security-guard` · **Confidence:** HIGH
- **Conjectured:** a green suite covering a guard means the guard is protected.
- **Refuted by:** the test-quality reviewer showed the `chmodSync(dir, 0o700)` re-assert was
  DELETABLE with the whole suite still green (`audits/code-review.md:16,54-63`). The existing test only
  exercised the fresh-directory path, where `mkdirSync(mode)` alone suffices — so the line added
  *specifically* because `mkdirSync`'s mode is a no-op on an existing dir was covered by nothing. The
  fix wave added a pre-created-0o777 test that fails without it (`Expected: 448 Received: 511`);
  `create-local-mailbox-transport.ts:272,276` now chmods both leaf and `~/.luca` parent.
- **Learned:** coverage answers "was this line executed", not "does anything depend on it". For any
  line whose whole purpose is a defensive re-assert, the only meaningful question is the mutation one.
- **Criterion now:** for every security-critical line, ask "would a test fail if I deleted it?" and if
  not, add the test that exercises the branch the line exists for (here: the pre-existing-directory path).

## L5 — Independent cross-reviewer convergence is a strong correctness prior

- **Type:** pattern · **Concept:** `pattern:cross-reviewer-convergence-ranking` · **Confidence:** HIGH
- **Conjectured:** with 12 MEDIUM and 12 LOW findings from three reviewers, severity labels are the
  right ranking signal for what to loop back on.
- **Refuted by:** 0 CRITICAL and 0 HIGH were reported, yet the three findings reached INDEPENDENTLY by
  two or more cold parallel reviewers — the `atomicWrite` shared-tmp race, the untested `chmodSync`,
  the tautological assertion (`audits/code-review.md:13-17`) — were all real and all became must-fix.
- **Learned:** self-assessed severity is one reviewer's calibration; convergence across independent
  perspectives is evidence about the world. Rank by convergence first, severity second.
- **Criterion now:** run reviewers cold, in parallel, in isolation, then tabulate convergence
  explicitly before triaging severity. Promote every ≥2-reviewer convergence to must-fix by default.

## L6 — A copied precedent carries its invariants, not just its code

- **Type:** pitfall · **Concept:** `pitfall:copied-precedent-loses-invariant` · **Confidence:** HIGH
- **Conjectured:** re-implementing `atomicWrite` faithfully from luca-cli's `write-atomic.ts` is the
  safe choice (luca-core must not import luca-cli — `context.md:35`), so copying is conservative.
- **Refuted by:** the original uses a fixed `${path}.tmp`, safe THERE because the path is repo-scoped
  and serialized by the pipeline lock. Copied into a deliberately lock-free (E4), machine-global,
  multi-writer mailbox it became a torn-write and symlink-plant vector (`audits/code-review.md:45-52`).
  Two reviewers reached this independently with the same reasoning. Fixed to
  `${path}.${process.pid}.${randomUUID()}.tmp` + `openSync(tmp,'wx',0o600)`
  (`create-local-mailbox-transport.ts:143`).
- **Learned:** "faithful copy" is the wrong fidelity target. What must transfer is the *invariant that
  made the original correct*; when the destination drops that invariant (here, the lock), the copy is
  a new bug wearing a trusted name.
- **Criterion now:** when citing a precedent, write down the invariant it relies on and check the
  destination still provides it. Record the check in the plan next to the precedent citation.

## L7 — Validate at the trust boundary (consumption), not at the friendly caller

- **Type:** pattern · **Concept:** `pattern:validate-at-consumption-boundary` · **Confidence:** HIGH
- **Conjectured:** applying `ENVELOPE_ID_RE` when generating ids constrains the id space.
- **Refuted by:** it was never applied on consumption, so `read('../../.claude/settings')` resolved to
  `~/.claude/settings.json` and `updateStatus` would have atomically overwritten it — with phase 2's
  CLI feeding `id` straight from argv (G-SEC-001, `plan-review.md:45`). This inverted the entire L4
  rationale: the always-denied `HOME_DENIED_SUBDIRS` exists to force writes through the CLI, and the
  CLI would have become a confused deputy with write access to exactly that directory.
- **Learned:** a constraint enforced only where the friendly caller sits is documentation, not a
  guard. Enforcement belongs where untrusted values enter — and the schema should re-enforce it so a
  tampered on-disk record cannot round-trip.
- **Criterion now:** for every validated identifier, test the hostile-input path directly. Here:
  `mailboxPathFor` returns `null` pre-`join`, every id-taking method short-circuits to the SAME
  `not-found` string used for a legitimately absent envelope (no existence disclosure), and the regex
  is re-applied in `schemas.ts` (`audits/code-review.md:23-28`).

## L8 — Framework contract contradictions in Luca's own stage gate (actionable)

- **Type:** decision · **Concept:** `decision:stage-gate-contract-gaps-2026-07` · **Confidence:** HIGH
- **Conjectured:** the stage-gate matrix and the skill instructions agree on what each step may do.
- **Refuted by:** three concrete contradictions observed this phase.
  1. `phase-execute` instructs executors to `git commit` atomically per task, but `bash-commit` is
     BLOCKED at `pipelineStep=execute`. All three waves hit it (`execute/summary.md:82-89`). Closely
     related to HEAD `be715aa4 fix(core): legalize finalize writes via bash-stage + release-artifact`
     — the contract is still only partially reconciled.
  2. `luca checks run` is restricted to `[execute, checks]`, and at `verify` the stage gate blocks
     bare `bun` — so the VERIFIER structurally cannot empirically confirm runtime probes and must
     trust the executor's self-report unless the orchestrator loops back to `checks`.
  3. `planReviewIteration` stayed at 0 across two `plan-review → plan` loop-backs, so the configured
     cap enforces nothing.
- **Learned:** the skill instruction text and the stage-gate matrix are two independent encodings of
  one contract and have drifted. Each drift converts a designed gate into either a hard block agents
  must work around or a cap that silently never fires.
- **Criterion now:** treat the stage-gate matrix as the single source of truth and add a test that
  asserts every command a skill instructs is permitted at the step it instructs it. Assert
  `planReviewIteration` increments on each `plan-review → plan` transition.

## L9 — Reviewers without Bash produce analytically sound but unconfirmed findings

- **Type:** convention · **Concept:** `convention:reviewer-tool-access-disclosure` · **Confidence:** MEDIUM
- **Conjectured:** reviewers can execute tests and `git diff` to confirm their findings.
- **Refuted by:** all three reviewers reported having NO Bash tool; every finding was read-derived
  (`audits/code-review.md:132-139`). The findings held up, but the review's *passing* evidence had to
  be supplied separately — the orchestrator independently re-ran the runtime probes and the full suite.
- **Learned:** read-only review is strong for reasoning-detectable defects (races, missing branches,
  tautologies) and blind to environment-dependent ones. The orchestrator must supply the empirical half.
- **Criterion now:** reviewers state their tool access at the top of the audit; the orchestrator
  independently re-runs the sole-evidence probes rather than accepting the executor's self-report.

---

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>`.

**Recurring failure themes.** One dominant cluster, spanning the entire pipeline: *verification
integrity*. It drove both plan-review rounds (8 blockers), the single negative outcome signal, and
2 of the 5 must-fix items. Its three manifestations (name-filter, HEAD-present grep literal, BSD-grep
non-execution) are the same error re-instantiated — see L1. No second independent failure cluster.

**Satisfaction valence by step.** `checks` positive (typecheck clean, 148 pass first run);
`verify` positive (46/46 criteria, 23/23 deliverables, four probes re-run independently);
`review` **negative then positive** — 0 CRITICAL / 0 HIGH yet 5 must-fix from 3 reviewers with 3
independent convergences, forcing a loop to execute, resolved to 154 pass / 8-8 checks. Review is the
only friction hotspot, and it fired precisely where the automated gates were green. The negative
signal is a healthy one: green gates plus a negative review verdict means the gates were not measuring
what mattered — consistent with L1 and L4.

**Cross-cutting patterns.** (a) Every high-value finding this phase came from an INDEPENDENT observer
— cold plan-reviewer, cold code-reviewer, orchestrator re-run — and none from the producing agent's
own checks (L2, L5, L9). (b) The confidence journal shows 12 auto / 0 research / 0 ask at the gate
across ~20 entries: full autonomy with zero escalation, on a CRITICAL phase that nonetheless needed
two plan rounds and a fix wave. High measured confidence did not track defect density; confidence
level should not be used to relax review depth on CRITICAL work.

## Retrospective (CRITICAL complexity)

**Went well.** Cold review at both plan and code stages caught everything material — 8 plan blockers
and 5 must-fix, none of which any automated gate would have surfaced. Base-sha HEAD-absence
verification of every grep literal (`plan-review.md:63-73`) turned the criteria set from decorative
into load-bearing. The four unfakeable runtime probes (ac-35..38) survived the executor's fix-up
because the plan required them fixed **up**, never weakened. The executor reported the anti-06
non-execution honestly and substituted an equivalent Bun scan rather than banking a false green.

**Went badly.** Verification vacuity survived a self-review, then a first fix, then a refuted
portability finding — three rounds for one root cause. Reviewers had no Bash, so the review's
empirical half fell to the orchestrator. The stage gate blocked `git commit` in all three waves,
leaving the phase uncommitted in the worktree. `planReviewIteration` never incremented, so the loop
cap was inert.

**Do differently.** (1) Make HEAD-failure demonstration a mandatory plan-lint output, not a
round-3 manual pass. (2) Give reviewers Bash (or explicitly budget an orchestrator confirmation pass)
before the review step. (3) Reconcile the skill-instruction / stage-gate matrix contradiction in L8
before the next execute-heavy phase. (4) Rank code-review findings by cross-reviewer convergence
before severity.
