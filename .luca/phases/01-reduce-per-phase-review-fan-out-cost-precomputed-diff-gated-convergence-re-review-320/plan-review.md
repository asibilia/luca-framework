# Plan Review — 01-reduce-per-phase-review-fan-out-cost-precomputed-diff-gated-convergence-re-review-320 (iteration 0)

```
STATUS: NEEDS_REVISION
CONVERGENCE: N/A (first review — baseline B(0) = 3)
BLOCKING_COUNT: 3
ADVISORY_COUNT: 3
RECOMMENDATION: revise
```

## 1. VERDICT: NEEDS_REVISION

## 2. Findings

### G-ARCH-001: [BLOCKER] The mandated diff command `git diff <pre-fix-sha>..HEAD --name-only` is empty on every re-entry in the live path — the gate inverts and skips round-2 after every real fix

- **Affected**: "Standard literal tokens" section (plan.md:20), Task 1.1.1, Tasks 2.1.2/2.1.3, ac-04 semantics.
- **Evidence**: In the live machine-driven path, the executor is barred from committing during EXECUTING: `packages/luca-tools/src/artifacts/modes/execute.ts:431` — "bash-commit is DENIED in EXECUTING — the executor subagent stages with `git add` only; the stage-gate blocks `git commit` until idle/finalize" — and `packages/luca-tools/src/artifacts/subagents/executor.ts:64` (same constraint). The pre-fix SHA is captured as HEAD at Route B (`modes/review.ts:240`), fixes are then staged but never committed, so on re-entry HEAD has not moved and `git diff <pre-fix-sha>..HEAD` compares two identical commits → **always empty**. The "`diff is empty` → skip round-2" condition then fires on every fix iteration, including iterations where real fixes were made. This is the exact opposite of "CONSERVATIVE — skip only when provably safe" and directly violates the context.md HARD CONSTRAINT (never sacrifice review quality).
- **Note**: the legacy `skills/phase-execute` path DOES commit per task (`skills/phase-execute/index.ts:346,1431`), so `<sha>..HEAD` works there — but review.ts is designated the authoritative body, and it lives on the no-commit path.
- **Required fix**: change the canonical diff to include the working tree, e.g. `git diff <pre-fix-sha> --name-only` (working tree + staged vs SHA) unioned with untracked files (`git ls-files --others --exclude-standard`), or `git status --porcelain` when pre-fix SHA == HEAD. Update the standard-token literal and ac-04's meaning accordingly; the token uniformity requirement makes this a single-string fix across bodies.

### G-ARCH-002: [MAJOR] "Skip re-verify" has no owner — the gate in review.ts fires after the re-verify has already run

- **Affected**: Objective (plan.md:11), Task 1.1.1 ("skips round-2 (re-review + re-verify)"), Task 2.1.1, D2/D3, ac-05.
- **Evidence**: The pipeline order is execute → checks → verify → review (`packages/luca-core/src/state/machine/pipeline-machine.ts:252-285`; REVIEWING's initial state is `verify` at line 270). The verifier is spawned at the `verify` step by the execute-mode body Step 3 (`modes/execute.ts:250-270`), and the loop-back re-entry instructions at `modes/execute.ts:404-410` transition back through verify before review re-entry. The plan's gate lives in review.ts "before Step 4 (L87)" — by the time that body runs, the re-verify (if any) has already been spawned. Task 2.1.1 gives execute.ts only a "cross-reference note", not a gate, so no task actually implements the re-verify skip. ac-05's grep (`skip round-2` renders) cannot detect this: the string can render while the verifier re-spawn remains ungated.
- **Required fix**: either (a) extend Task 2.1.1 so execute.ts's re-entry runs the diff-gate check *before* Step 3's verifier re-spawn (skip = don't re-spawn the verifier, carry forward the prior verify.json, advance through verify per the no-bypass transition table), or (b) explicitly descope re-verify from the gate and correct the Objective, Task 1.1.1, ac-05, and D2/D3 wording to "re-review only".

### G-SCOPE-001: [MAJOR] Post-skip routing and disposition of the still-open MUST-FIX/SHOULD-FIX findings is unspecified

- **Affected**: Task 1.1.1 gate algorithm; Tasks 2.1.2/2.1.3 mirrors.
- **Evidence**: Both skip branches occur precisely when the prior round's findings were *not* addressed at their flagged locations (empty diff = nothing changed; zero overlap = flagged locations untouched). review.ts's existing routing (L234-241) has two defined exits: Route A → learn, and the budget-exhausted path which captures every remaining finding as a backlog todo (`luca todo add --status backlog --source review-finding`, `modes/review.ts:241`) before advancing. The plan's gate says only "skip round-2" — it never states which `luca state advance` target the skip takes nor what happens to the outstanding findings. Without this, four bodies will improvise divergently, and the worst improvisation (advance to learn, findings silently dropped) is a quality regression violating the HARD CONSTRAINT. Additionally, if the skip leaves the prior audits in place and re-runs the Step 5 routing, Route B fires again — a loop.
- **Required fix**: specify in the gate algorithm (all gate bodies): on skip, advance toward learn AND capture the unresolved MUST-FIX/SHOULD-FIX items via the existing budget-exhausted backlog mechanism (mirroring review.ts:241), noting the skip reason in the audit artifact.

### G-CRIT-001: [MINOR] anti-04 probe misses staged changes

- **Affected**: anti-04 (plan.md:94).
- **Evidence**: `git diff --name-only -- packages/luca-core/` shows only *unstaged* working-tree changes. Since the live path's executors stage with `git add` (executor.ts:64), a staged luca-core edit would pass anti-04 falsely. Suggest `git status --porcelain packages/luca-core/` (empty output) or `git diff HEAD --name-only -- packages/luca-core/`.

### G-CRIT-002: [MINOR] Front-matter task count wrong

- **Affected**: plan.md:5 (`tasks: 5`). The plan contains 4 tasks (1.1.1, 2.1.1, 2.1.2, 2.1.3). Cosmetic metadata drift; correct to 4.

### G-CRIT-003: [MINOR] Grep floors are tree-wide file counts, not per-body assertions

- **Affected**: ac-01…ac-05, anti-06.
- **Evidence**: All six gate tokens are currently novel (zero matches in `packages/luca-tools/src`), so today the floors are meaningful. But `grep -rlF … | wc -l ≥ N` counts any N rendered files — if a token leaks into a shared include or an unrelated body, a gate body could omit it undetected. Advisory: pin the greps to the four rendered body paths (e.g. `grep -lF <token> <RENDERED>/**/review* …`) or add per-file greps. Not blocking given current token novelty.

### Verified-clean checks (evidence for what passes)

- **Anchors real**: Route B at `modes/review.ts:238-241`; Step 4 at `review.ts:87`; `execute.ts:274-282` fan-out and `:404-410` re-entry; `lu-review/index.ts:27/29-37/48`; `phase-execute/index.ts:896/914/916-922/1166/1204` — all confirmed by Read.
- **Anti-criteria literals exist verbatim**: "Spawn ALL applicable reviewers in a SINGLE message" (`phase-execute:914`), "5 reviewer subagents in parallel" (`review.ts:89`), "prevents the independence auditor from anchoring on prior reviewers" (`phase-execute:1166`); anti-05/anti-07 negative greps currently return no match.
- **Supporting claims grounded**: `budget-matrix.ts:23-79` maxReviewIterations values match; `convergence.ts:190` ≥2-perspective filter confirmed; `File: {path:line}` audit format at `reviewer.ts:122-137`; `.luca/tmp/<kebab>.json` contract-legal and writable in any pipelineStep (`luca-dir/configs.ts:140-149`); compile bin exists and accepts `--manifest`/`--out` (`compile/bin/compile.ts:7-62`).
- **Scope discipline**: no Lever-1a/1b content in the plan; Deliverables D1–D6 all map to existing ac-IDs; every criterion is a single binary probe; anti-criteria present and traceable to context.md's anti-regression mandate; ID numbering clean (iteration 0, no stability concerns).
- **Wave ordering sound**: Wave 1 defines the convention, Wave 2 mirrors into three distinct files — genuinely parallel-safe.

## 3. Summary

The plan is well-grounded — every file anchor, line number, literal, and supporting claim probed checks out, scope is tightly held to Lever-2, and the anti-criteria correctly encode the user's quality constraint. However, the gate algorithm as specified is broken on the live path: the mandated `git diff <pre-fix-sha>..HEAD` compares two identical commits because the stage-gate blocks commits during EXECUTING, so "diff is empty → skip" would fire after every real fix — inverting the conservative design (G-ARCH-001, BLOCKER). Two MAJOR underspecifications compound it: the promised re-verify skip has no implementing task given the verify-before-review pipeline order (G-ARCH-002), and neither the skip's state-advance target nor the disposition of the still-open findings is defined (G-SCOPE-001). All three have clear, contained fixes (change the diff form to include the working tree; give execute.ts's re-entry the verifier-spawn gate or descope re-verify; specify skip → backlog-capture + advance). One revision should converge.

---

# Plan Review — iteration 1 (re-review of revised plan)

```
STATUS: APPROVED
CONVERGENCE: CONVERGED
BLOCKING_COUNT: 0
ADVISORY_COUNT: 2
RECOMMENDATION: approve
```

## 1. VERDICT: APPROVED

## 2. Convergence Assessment

Baseline B(0) = 3 (G-ARCH-001 BLOCKER, G-ARCH-002 MAJOR, G-SCOPE-001 MAJOR). This revision resolves all three, plus all three MINORs. **B(1) = 0 → CONVERGED.** Two new ADVISORY findings, neither blocking.

### Iteration-0 finding resolution (each verified against plan.md and the codebase)

**G-ARCH-001 — RESOLVED.** The canonical diff token is now `git diff <pre-fix-sha> --name-only` (working tree vs stashed SHA) unioned with `git ls-files --others --exclude-standard` (plan.md:20-21), with an explicit Decisions entry (plan.md:75) citing the stage-gate evidence re-confirmed: `packages/luca-tools/src/artifacts/modes/execute.ts:431` and `packages/luca-tools/src/artifacts/subagents/executor.ts:64`. On the live no-commit path, `git diff <sha>` captures staged+unstaged modifications and `ls-files --others` captures new files — the union is non-empty after any real fix, so the gate no longer inverts. The form is also correct on the legacy commit-per-task phase-execute path. ac-04's semantics updated ("BOTH probes' outputs empty", plan.md:93), and new **ac-08/ac-09** (plan.md:97-98) pin both tokens per-file to the three gate bodies with `grep -LF … = EMPTY`. The `..HEAD` form appears nowhere except as the explicitly forbidden form.

**G-ARCH-002 — RESOLVED (option b, descope).** Re-verify is consistently descoped in every flagged location: Objective (plan.md:11), Task 1.1.1 (plan.md:41), Task 2.1.1 (plan.md:50), ac-05 (plan.md:94), D2 (plan.md:81), and a Decisions entry (plan.md:76). Pipeline-order grounding re-confirmed (`pipeline-machine.ts:268-279`; verifier spawn at `modes/execute.ts:250-270`). The descope rationale (verify criteria are not location-scoped, so zero-overlap is not provably safe for them) is sound and honors the HARD CONSTRAINT.

**G-SCOPE-001 — RESOLVED.** Post-skip routing is now part of the gate algorithm in Task 1.1.1 (plan.md:41: backlog-capture via `luca todo add --status backlog --source review-finding`, skip reason noted in the audit artifact, `luca state advance --to-step learn`, "a skip exits the loop and NEVER re-enters Route B") and mirrored in Tasks 2.1.2/2.1.3 (plan.md:54, :58), with a Decisions entry (plan.md:77), new **ac-10** (plan.md:99), and new **D7** (plan.md:86). Mirrored mechanism verified real: literal exists at `modes/review.ts:241`; CLI supports `--status backlog --source review-finding` (`write-surface/todo.ts:53-72`).

**G-CRIT-001 — RESOLVED.** anti-04 is now `git status --porcelain packages/luca-core/` returns EMPTY (plan.md:105).

**G-CRIT-002 — RESOLVED.** Front-matter `tasks: 4` matches the four tasks.

**G-CRIT-003 — RESOLVED.** All positive criteria per-file pinned (`grep -LF <token> <named files> = EMPTY`); anti-05/anti-07 remain tree-wide, correct for absence assertions. Rendered-body paths verified accurate (emit-agent.ts:65-67, emit-skill.ts:61-63).

### ID-stability — HELD

ac-01…ac-07 retained with original meanings; ac-08–ac-10 appended; anti-01–anti-07 retained; D1–D6 retained, D7 appended. No renumbering, no deletions. Deliverables mapping complete.

## 3. Findings (advisory only)

### G-ARCH-003: [ADVISORY] `.luca/` pipeline-artifact noise makes the `diff is empty` branch nearly unreachable on the live path

- `.gitignore:71` ignores `.luca/tmp/` but `.luca/phases/<slug>/` is untracked-and-NOT-ignored during a run; Route B step 2 writes `audits/<reviewer>.md` before looping back, so on re-entry the untracked union always contains phase-artifact paths and "both outputs empty" essentially never holds.
- Not blocking: failure direction is conservative (worst case = re-review as today), and the zero-overlap branch subsumes it — `.luca/phases/...` paths have provable zero overlap with MUST-FIX `File:line` cites. Cost saving survives. Executors may add a scoping note (treat `.luca/` paths as pipeline-generated, excluded from the union). No plan change required.

### G-CRIT-004: [ADVISORY] ac-10 is non-discriminative for the REVIEW body

- The literal already renders from the budget-exhausted path (`modes/review.ts:241`), so ac-10 cannot detect a REVIEW gate block omitting post-skip capture. Plan openly acknowledges this (plan.md:99). Mitigated by ac-01/ac-08/ac-09 and Task 1.1.1 routing prose. Acceptable residual.

## 4. Summary

The revision squarely resolves all six iteration-0 findings with no renumbering and no new blocking issues. The pivotal fix — replacing `<sha>..HEAD` with the working-tree-inclusive union — is correct on both the live no-commit path and the legacy commit-per-task path, and is pinned per gate body by ac-08/ac-09. Re-verify is cleanly descoped with pipeline-order grounding, and post-skip routing closes the finding-loss and loop hazards under ac-10/D7. The two residual advisories both fail in the quality-preserving direction and need no further plan iteration. B(1) = 0: CONVERGED — approve and proceed to execution.
