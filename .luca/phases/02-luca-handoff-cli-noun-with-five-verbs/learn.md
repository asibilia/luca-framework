# Learn — Phase 02: `luca handoff` CLI noun with five verbs

Complexity CRITICAL · 14 tasks · 3 waves · 2 plan-review rounds · 1 code-review fix wave
Final: `tsc` clean, 33/33 checks, luca-cli 636 pass, luca-core 1171 pass, `bun run build` exit 0.

Phase 1 emitted 9 engrams. This phase emits **4 new** and **2 reinforcements**. Everything else
observed here is an instance of an already-recorded rule and is deliberately not re-engramed.

---

## R1 — REINFORCEMENT of `pitfall:vacuous-verification-criteria`

New evidence, three fresh mechanisms. Do **not** create a new engram; evolve the existing one.

- **Conjectured:** after phase 1, vacuity was understood as an authorship defect — write the criterion
  carelessly (`-t` filter, HEAD-present grep literal, non-executing tool) and it passes for free.
- **Refuted by** three instances whose cause sits *outside* the criterion's author:
  1. **A prior fix neutralized the criterion.** `ac-24` (`plan.md:214`) was the sole behavioral evidence
     for the security fix, but phase 1's own MF-4 made `.luca/handoff/**` an *unconditional* deny
     (`classify-write-path.ts:289-296`), so the forge probe blocked at HEAD with phase 2's fix undone
     (`plan-review.md:32-46`). An unrelated improvement can kill a criterion.
  2. **The same shape one layer down, in a TEST.** Of two HOME-unset tests, `handle-stage-gate-hook.test.ts:489`
     (`~/.claude/settings.json`, no `.luca/` segment) is a real mutation guard; `:507`
     (`~/.luca/handoff/evil.json`) stays green after deleting `|| osHomedir()` — filed under
     "homedir fail-closed", proving nothing about it (`audits/code-review.md:99-104`).
  3. **A gate with zero inputs.** `luca rules run` exited 0 having discovered **0 rule files**
     (`execute/summary.md:32`) — a green gate measuring nothing.
- **Learned:** the invariant generalizes past authorship. A criterion's fix-sensitivity is a property of
  the *whole system at HEAD*, not of the criterion's text — a broad guard added elsewhere, or a
  discovery step that finds nothing, silently converts a good criterion into a tautology. Corollary for
  layered defenses: when a broad guard exists, a new narrower guard must be probed on a case the broad
  guard does **not** cover, or the probe tests the old layer.
- **Criterion now (strengthened):** run the criterion at base-sha and *observe* RED, do not argue it.
  This phase did it for the first time in the run — `ac-24` pre-fix `decision = allow`, post-fix
  `decision = block` (`execute/summary.md:39-45`), and `ac-19.3` by deliberate mutation, 3 tests RED
  with the envelope stranded at `in-progress` (`:47-51`). Additionally: any gate whose work is
  discovery-driven must report its input count and fail when the count is 0.

## R2 — REINFORCEMENT of `pattern:validate-at-consumption-boundary`

Extends the existing engram to a boundary it did not name: **rendering**.

- **Conjectured:** the trust boundary is where untrusted values are *consumed by code* — validate ids at
  read, and the deputy problem is closed.
- **Refuted by** MF-4: `luca-handoff-list.ts:82` renders sender-controlled `target.repoPath` verbatim
  into the human triage view — the surface deliberately designed to *withhold* `intent` and
  `acceptanceCriteria` from an agent's context. The field was only `z.string().min(1)`
  (`schemas.ts:106-111`), so a multi-line value reintroduces instruction-shaped lines into exactly the
  low-exposure surface, and the receiving agent reads that stdout straight into context.
- **Learned:** an agent's **stdout is a consumption boundary**, and a surface hardened by *omitting*
  fields is undone by any remaining field that carries free text. Withholding is not escaping.
- **Criterion now:** fix at both ends — constrain at send (absolute path, `MAX_REPO_PATH_LENGTH`, no
  control characters, `luca-handoff-send.ts:50,79-87`) **and** `toSingleLine()` at render
  (`luca-handoff-accept.ts:103`). For any field rendered into agent-readable output, ask what a newline
  in it produces.

---

## L1 — An early-return fast path silently voids an invariant two documents assert

- **Type:** pitfall · **Concept:** `pitfall:fast-path-bypasses-claimed-invariant` · **Confidence:** HIGH
- **Conjectured:** always-denied paths are blocked "regardless of phase" — asserted by the hook's own
  docstring (`handle-stage-gate-hook.ts:64-68`) and independently by the user-facing write-surface skill
  body (`luca-write-surface/index.ts:214-217`).
- **Refuted by** MF-1: the IDLE short-circuit returned `allow` **before** `classifyWritePath` ever ran,
  so at `pipelineStep: 'idle'` a native `Write` to `<home>/.luca/handoff/x.json` was allowed outright —
  an agent could forge an envelope with a chosen `id`, `status: 'accepted'` and a fabricated
  `statusHistory`. That is precisely the state phase 3's SessionStart triage runs in
  (`step-artifacts.ts:113-118`), so it would have handed the next phase a pre-broken trust boundary.
  Two independent documents described behavior the control flow did not implement.
- **Learned:** documentation agreement is not implementation evidence — a docstring and a skill body can
  both be authored from the same mental model, and both be wrong about ordering. "Unconditional" is a
  claim about *control-flow position*, and any early return above the check falsifies it.
- **Criterion now:** when prose says "regardless of X" / "in every phase", locate the check in the
  function and confirm no `return` precedes it. The fix hoisted the security floor into a dedicated
  block above the IDLE return, with the rationale inline (`handle-stage-gate-hook.ts:167-180,400-411`).

## L2 — An enumeration-keyed deny fails OPEN for every case not enumerated

- **Type:** pitfall · **Concept:** `pitfall:enumeration-based-deny-fails-open` · **Confidence:** HIGH
- **Conjectured:** the mailbox path patterns are correct (literal `~` and `$HOME` spellings are both
  caught, `classify-write-path.ts:257,289`), therefore Bash writes to the mailbox are denied.
- **Refuted by** MF-2: `classifySubcommand` populated `targetPaths` only for redirects, git mutates,
  `cp`/`mv`/`ln`, `sed -i` and `playwright-cli --filename`. `tee`, `touch`, `install`, `dd`, `bun -e`,
  `python -c` fell to the unknown-command default with `targetPaths: []`, so the hook's deny loop had
  nothing to inspect while `bash-mutate` is allowed in EXECUTING (`stage-tool-matrix.ts:90`).
  `echo '<forged>' | tee ~/.luca/handoff/x.json` bypassed the deny completely. The matcher was right;
  the *extraction coverage* was the hole.
- **Learned:** a deny-list keyed on extracted targets inherits the extractor's open-world problem — its
  default for an unrecognized input is "no targets", which reads as "nothing to deny". Correct patterns
  give false confidence because the pattern is never reached. Security predicates must fail closed on
  the unknown case, and enumeration cannot.
- **Criterion now:** for any path-based deny, ask "what happens for a command I did not enumerate — and
  for tomorrow's tool?" The fix is a **binary-independent token scan** for the protected prefix, run
  before the per-subcommand loop, so the guard no longer depends on knowing the binary
  (`classify-bash-command.ts:749-758`); `install`/`tee` extraction was added alongside, not instead.

## L3 — A predicate duplicated across a read path and a write path will diverge

- **Type:** pattern · **Concept:** `pattern:single-predicate-for-read-and-write-paths` · **Confidence:** HIGH
- **Conjectured:** `list` and `accept` are separate verbs with separate handlers; each enforcing its own
  rules is normal separation of concerns.
- **Refuted by** MF-3: `luca-handoff-list.ts:139-143` annotated `autoAcceptable: false` when
  `target.repoPath !== ctx.cwd`, while `accept --auto` consulted only `isAutoAcceptable`
  (`is-auto-acceptable.ts:29-33` — `status === 'pending'` plus an origin allowlist, **nothing about
  target**). So an unattended agent in repo B could auto-accept an **A→C** envelope (ids are
  discoverable via `--all-targets`), forging `accepted` on a work order never addressed to it and
  silently denying C. The annotation the operator READ and the rule the mutation APPLIED disagreed.
  It surfaced only because both handlers were reviewed in one pass.
- **Learned:** when the same concept is computed in a display path and an enforcement path, the display
  copy is the one people trust and the enforcement copy is the one that matters — divergence is
  invisible to any test that exercises one handler at a time. Advisory annotations create an implied
  contract the mutation must honor.
- **Criterion now:** when a predicate appears in both a read path and a write path, assert they share
  one implementation (or at minimum add a test that reads then writes and asserts agreement). The fix
  refuses in the `args.auto` branch on `envelope.target.repoPath !== ctx.cwd`, naming the actual target
  (`luca-handoff-accept.ts:150-158`), with the bare human `accept` path documented as intentionally
  cross-repo (`:13-18`).

## P1 — Blast-radius protocol for a framework-wide behavior change

- **Type:** procedure · **Concept:** `procedure:blast-radius-before-after-suite-sweep` · **Confidence:** HIGH
- **Trigger:** a fix that changes shared/framework behavior for callers outside the phase's scope
  (here MF-1 altered stage-gate evaluation for every IDLE write in every repo).
- **Steps:** (1) state the blast radius explicitly in the fix brief, and whether the change *aligns code
  with a documented contract* or *invents a new rule* — only the former is safe to ship inside a phase;
  (2) run the entire affected suite at base and record the count; (3) apply the fix; (4) re-run and
  report both counts; (5) **forbid editing any red pre-existing test to match** — a red test means the
  change was too broad, not that the test was wrong; (6) add the test that pins the newly-correct
  behavior.
- **Outcome:** 242 → 249 pass, 0 fail, nothing regressed; 33/33 checks after the fix wave.
- **Caveat:** step 5 is the load-bearing one — without it the protocol degenerates into rationalizing
  the diff.

---

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>`.

**Recurring failure themes.** One dominant cluster again, but it **moved**: phase 1's cluster was
verification integrity; phase 2's is **invariant enforcement gaps** — 2 HIGH live bypasses of the core
"`~/.luca/` is home-denied, so agents must go through the CLI" claim (MF-1, MF-2) plus MF-3's
read/write divergence and MF-4's render leak. Four of five must-fix items are the same theme: a stated
guarantee that some path around it falsifies. Verification integrity persists as a *secondary* cluster
(the `:507` vacuous test, the vacuous `luca rules run`) but no longer drove any plan-review blocker
after round 1 — R1's counter-practice is working.

**Satisfaction valence by step/source.** `checks` positive twice (33/33 first run, 33/33 after the fix
wave with no pre-existing regression). `verify` positive (48 criteria, 20 deliverables, 3 non-blocking
gaps). `plan-review` gate-ask positive — the one escalation, and it resolved cleanly. `review`
**negative** and it is the sole friction hotspot, exactly as in phase 1: green automated gates plus a
negative review verdict. Two phases running, review is where value is created and where the automated
surface is blind.

**Cross-cutting patterns.** (a) Every HIGH finding again came from an **independent** observer — cold
plan-reviewer (6 blockers), two cold code-reviewers (5 must-fix) — and none from the producing agent's
gates. This is the second phase confirming `pattern:cross-reviewer-convergence-ranking` and
`pitfall:self-review-false-convergence`. (b) Reviewers had **no Bash for the second phase running**
(`audits/code-review.md:150-156`) — `convention:reviewer-tool-access-disclosure` held, and the
orchestrator again supplied the empirical half. This is now a standing structural gap, not an incident.
(c) Confidence journal: 10 auto / 0 research / **1 ask** — the first escalation in the run, on the
`complete` drive-through, and it was the correct call; the cold reviewer independently reached the same
verdict. High autonomy still did not track defect density (11 blockers/must-fix on a 10-auto phase).

## Retrospective (CRITICAL complexity)

**Went well.** The empirical red-before-green observations (`ac-24`, `ac-19.3`) — phase 1's "do
differently #1" actually landed, and it is what caught the prior-fix vacuity. Two cold plan-review
rounds converged (6 → 0) with each blocker traced independently rather than accepted from the
architect's reasoning. The scope fence around `packages/luca-core/src/handoff/` HELD with no STOP,
because the reviewer identified `loadCurrentConfig` as an already-exported seam. Reviewing sibling
handlers together is what exposed MF-3. The blast-radius protocol (P1) made a framework-wide change
shippable inside a phase.

**Went badly.** The core security claim of the whole design had two live bypasses that neither the
plan review nor 33/33 checks surfaced — both were control-flow/coverage gaps invisible to path-pattern
reasoning. Reviewers still have no Bash. `luca rules run` was counted as a gate while discovering zero
rule files. The phase again ends staged-but-uncommitted.

**Do differently.** (1) For any "X is always denied" claim, write a probe per *entry path* (native
Write, Bash-with-extractor, Bash-without-extractor, each `pipelineStep` including IDLE) rather than one
probe per rule — the rule was right and the entry paths were not. (2) Give reviewers Bash; this is now
two phases of the orchestrator manually backfilling the empirical half. (3) Make discovery-driven gates
report input counts and fail at 0. (4) Carry MF-3's lesson forward as a review checklist item: diff the
read-path predicate against the write-path predicate for every noun.
