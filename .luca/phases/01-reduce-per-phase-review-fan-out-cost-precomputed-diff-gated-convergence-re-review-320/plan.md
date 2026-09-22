---
id: 01-reduce-per-phase-review-fan-out-cost-320
title: "Lever-2 — diff-gated convergence re-review (#320)"
wave: 2
tasks: 4
---

# Plan: Lever-2 — gate the convergence re-review (#320)

## Objective
Add a CONSERVATIVE diff-gate so a round-2 review (all N reviewers) is SKIPPED only when the post-fix diff is provably incapable of changing a finding — empty diff, or zero overlap with the prior round's MUST-FIX `File:line` locations. Every other case re-reviews as today. Re-verify is explicitly NOT gated (see Decisions — it runs before the gate, and its acceptance criteria can regress from changes outside the flagged locations). Quality-neutral by construction: the fan-out, perspective count, cold isolation, independence auditor, and `convergence.ts` ≥2-perspective promotion are left UNCHANGED, and the gate defaults to re-review on any uncertainty.

## Context
Route B in `modes/review.ts:238-241` forces a full round-2 whenever round-1 produced ANY MUST-FIX/SHOULD-FIX (`budget-matrix.ts:23-79` maxReviewIterations MODERATE+=2) — even on a no-op or unrelated fix (research.md). Fix is INSTRUCTION-BODY ONLY (luca-tools): no luca-core graph change (research confirmed none needed). Pre-fix SHA is stashed in a contract-legal `.luca/tmp/review-prefix-sha.json` (per `luca-dir/configs.ts:140-145`, like `checks.json`) — no `LucaState` schema change. Four review-driving bodies carry the convention: `modes/review.ts` (authoritative gate), `modes/execute.ts` re-entry (cross-reference mirror), `skills/lu-review/index.ts` (skill gate), `skills/phase-execute/index.ts` Step 8/8.1 (legacy gate). Each body is a distinct file → parallel-safe. On the live path executors only STAGE (`git add`) — the stage-gate blocks commits during EXECUTING, so HEAD never moves between capture and re-entry; the diff MUST therefore be working-tree-inclusive (see Decisions).

Scope is Lever-2 ONLY. Lever-1a (shared diff artifact) and Lever-1b (consolidate reviewers) are OUT (see context.md "Explicitly NOT shipping") and MUST NOT appear.

### Standard literal tokens (every gate body must contain these exact strings)
- `review-prefix-sha.json` — the pre-fix HEAD SHA stash path.
- `git diff <pre-fix-sha> --name-only` — the re-entry diff (working tree + index vs the stashed SHA; NEVER the `<sha>..HEAD` form, which is always empty on the live no-commit path).
- `git ls-files --others --exclude-standard` — untracked-file union; `diff is empty` means BOTH commands output nothing.
- `diff is empty` — no-op skip condition.
- `provable zero overlap` — no-overlap skip condition.
- `skip round-2` — the gated action (the round-2 re-review fan-out; re-verify is out of scope).
- `only when provably safe` — the skip guard.
- `When in doubt, re-review` — the conservative default clause.
- `luca todo add --status backlog --source review-finding` — post-skip capture of unresolved findings (mirrors the `modes/review.ts:241` budget-exhausted mechanism).

### Rendered-body verification (runs at CHECKS step, not REVIEWING)
Rendered greps are bash-mutate (compile writes files) and are BLOCKED in REVIEWING (per the sibling #322 run). Run them at the CHECKS step. `<RENDERED>` = a scratch dir. Compile:
`bun packages/luca-tools/src/compile/bin/compile.ts --manifest packages/luca-tools/src/artifacts/index.ts --out <RENDERED>`
Rendered body paths (per `emit-agent.ts:65-67` / `emit-skill.ts:61-63`): REVIEW=`<RENDERED>/.claude/agents/review.md`, EXEC=`<RENDERED>/.claude/agents/execute.md`, LUREV=`<RENDERED>/skills/lu-review/SKILL.md`, PHEXEC=`<RENDERED>/skills/phase-execute/SKILL.md`. Gate bodies = REVIEW, LUREV, PHEXEC; EXEC is the cross-reference mirror.

## Phases

### Phase 1: Diff-gated round-2

#### Wave 1: Authoritative gate in the live machine-driven path
Defines the `.luca/tmp/review-prefix-sha.json` convention + the full gate algorithm (skip conditions AND post-skip routing). Tracer bullet — the primary live path is complete and verifiable on its own.

- [ ] **Task 1.1.1**: In `modes/review.ts`, at Route B (L238-241) add pre-fix HEAD SHA capture — stash `{"sha": "<HEAD>"}` to `.luca/tmp/review-prefix-sha.json` immediately before `luca state advance --to-step execute`. Add a re-entry gate block before Step 4 (L87) that, when `reviewIteration > 0`, computes `git diff <pre-fix-sha> --name-only` unioned with `git ls-files --others --exclude-standard`, and skips round-2 (the re-review fan-out; NOT re-verify, which has already run) ONLY when `diff is empty` (both outputs empty) OR the changed paths have `provable zero overlap` with the prior MUST-FIX `File:line` cites in `audits/<reviewer>.md` — any overlap, any parse/ambiguity does the full round-2: skip `only when provably safe`, `When in doubt, re-review`. Post-skip routing (part of the gate algorithm): capture every unresolved MUST-FIX/SHOULD-FIX as a backlog todo (`luca todo add --status backlog --source review-finding …`, mirroring the L241 budget-exhausted mechanism), note the skip reason in the audit artifact, then advance toward learn (`luca state advance --to-step learn`) — a skip exits the loop and NEVER re-enters Route B, so it cannot re-fire.
  - Files: `packages/luca-tools/src/artifacts/modes/review.ts`
  - Verification: ac-01, ac-02, ac-03, ac-04, ac-05, ac-06, ac-07, ac-08, ac-09, ac-10, anti-02, anti-06

### Phase 2: Widen to the remaining review-driving bodies

#### Wave 2: Mirror the gate (parallel — three distinct files)
Each task edits its own file; no shared file → parallel-safe. Each references the same `.luca/tmp/review-prefix-sha.json` convention and full gate algorithm (skip conditions + post-skip routing) from Wave 1.

- [ ] **Task 2.1.1**: In `modes/execute.ts` Review Iteration Re-entry (L404-410), add a cross-reference note: the pre-fix HEAD SHA is stashed to `.luca/tmp/review-prefix-sha.json`; on return to review the round-2 re-review is diff-gated and skipped `only when provably safe` — `When in doubt, re-review`. State explicitly that Step 3 re-verify is NOT gated and runs as today. Do NOT alter Step 4 reviewer fan-out (L274-282).
  - Files: `packages/luca-tools/src/artifacts/modes/execute.ts`
  - Verification: ac-01, ac-02, ac-06, ac-07, anti-01

- [ ] **Task 2.1.2**: In `skills/lu-review/index.ts`, add the pre-fix SHA capture when directing back to `/phase-execute` (L48) and the re-run gate (before Run the reviewers, L27) — same `git diff <pre-fix-sha> --name-only` + `git ls-files --others --exclude-standard` / `diff is empty` / `provable zero overlap` / `skip round-2` / `only when provably safe` / `When in doubt, re-review` logic. On skip, apply the same post-skip routing as Task 1.1.1: backlog-capture unresolved findings via `luca todo add --status backlog --source review-finding`, note the skip reason in the audit artifact, proceed toward learn — never loop back into the gate. Leave the "Spawn the reviewer subagent … in parallel" fan-out (L29-37) UNCHANGED.
  - Files: `packages/luca-tools/src/artifacts/skills/lu-review/index.ts`
  - Verification: ac-01, ac-02, ac-03, ac-04, ac-05, ac-06, ac-07, ac-08, ac-09, ac-10, anti-02

- [ ] **Task 2.1.3**: In `skills/phase-execute/index.ts` Step 8.1 (L1204) add pre-fix SHA capture on the must-fix route, and gate the Step 8 re-review path with the same conservative logic (working-tree-inclusive diff union as in Task 1.1.1) and the same post-skip routing (backlog-capture + skip reason in the audit artifact + proceed forward, never re-firing the re-review loop). Leave the fan-out (L896 "Always spawn ALL reviewers", L914 "Spawn ALL applicable reviewers in a SINGLE message"), cold isolation (L916-922), and independence auditor (L1166) prose UNTOUCHED.
  - Files: `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts`
  - Verification: ac-01, ac-02, ac-03, ac-04, ac-05, ac-06, ac-07, ac-08, ac-09, ac-10, anti-01, anti-03, anti-06

## Risks & Mitigations
- **Risk**: a body drifts from the standard tokens → gate silently absent. **Mitigation**: ac-01..05, ac-08..10 grep each named rendered body per-file (`grep -L` = empty) for the exact literals.
- **Risk**: an edit accidentally touches a fan-out/isolation line. **Mitigation**: anti-01..03 assert the exact fan-out/isolation/auditor literals still render.
- **Risk**: someone imports Lever-1a/1b under the gate banner. **Mitigation**: anti-05 and anti-07 assert the absence of consolidation and shared-diff-artifact language.
- **Risk**: gate reads as a blanket skip, or a skip silently drops findings / loops. **Mitigation**: anti-06 requires `only when provably safe` in every gate body; ac-02 requires the `When in doubt, re-review` default; ac-10 requires the post-skip backlog-capture literal.

## Quality-preservation
HARD CONSTRAINT (context.md, user, non-negotiable): **never sacrifice output or review quality to save cost.** The gate is quality-neutral by construction — re-reviewing an unchanged or provably-irrelevant diff cannot surface anything new, so the skip removes only provably-wasted work; re-verify stays ungated precisely because its criteria are NOT location-scoped (see Decisions). The anti-criteria are the enforcement: anti-01 (fan-out unchanged), anti-02 (perspective count unchanged), anti-03 (cold isolation + independence auditor untouched), anti-04 (`convergence.ts` ≥2-perspective promotion + no luca-core change), anti-05 (no consolidate-to-one-reviewer), anti-06 (skip is conditional, never blanket — defaults to re-review), anti-07 (no Lever-1a shared-diff-artifact). The skip is a proven-safe fast path, never a heuristic guess; a skip never drops findings (backlog-captured per ac-10).

## Decisions
- 2026-07-17 — Pre-fix SHA stashed in `.luca/tmp/review-prefix-sha.json`, not `LucaState` (lighter, contract-legal, survives compaction; research confirmed no graph change needed).
- 2026-07-17 — `execute.ts` re-entry is a cross-reference mirror (its own file → parallel-safe), not the capture owner; `review.ts` Route B is the canonical capture point.
- 2026-07-17 — Rendered-body greps run at CHECKS (compile is bash-mutate, blocked in REVIEWING per the #322 run).
- 2026-07-17 — **G-ARCH-001**: canonical diff is working-tree-inclusive — `git diff <pre-fix-sha> --name-only` ∪ `git ls-files --others --exclude-standard`. The stage-gate blocks commits during EXECUTING (`modes/execute.ts:431`, `subagents/executor.ts:64`), so a `<sha>..HEAD` form compares identical commits and is ALWAYS empty on the live path — it would invert the gate into a blanket skip.
- 2026-07-17 — **G-ARCH-002 resolved as option (b): re-verify DESCOPED — the gate covers re-review only.** Pipeline order is execute → checks → verify → review (`pipeline-machine.ts:252-285`), so the verifier has already re-run before review.ts's gate executes; gating it would require a second gate location in execute.ts plus a verify.json carry-forward protocol (wider, riskier surface). Decisive: `provable zero overlap` is only provably safe for review findings — verify.json acceptance criteria can regress from changes OUTSIDE the flagged locations, so skipping re-verify on zero-overlap would breach the HARD CONSTRAINT. The dominant round-2 cost (the N-reviewer fan-out) is still removed; the single verifier re-spawn is the accepted residual.
- 2026-07-17 — **G-SCOPE-001**: post-skip routing is part of the gate algorithm in every gate body — backlog-capture unresolved MUST-FIX/SHOULD-FIX (`luca todo add --status backlog --source review-finding`, mirroring `review.ts:241`), note the skip reason in the audit artifact, advance toward learn. A skip exits the loop; Route B cannot re-fire after a skip.

## Deliverables
- **D1**: capture the pre-fix HEAD SHA — stashed to `.luca/tmp/review-prefix-sha.json` in each review-driving body → ac-01
- **D2**: gate on empty-diff / no-op fix — working-tree-inclusive diff union + `diff is empty → skip round-2` in the gate bodies → ac-04, ac-05, ac-08, ac-09
- **D3**: gate on provable zero overlap — `provable zero overlap` skip condition present → ac-03, ac-05
- **D4**: conservative default-to-re-review — `only when provably safe` + `When in doubt, re-review` present → ac-02, anti-06
- **D5**: applied to each review-driving body — capture + default clause render across the four bodies → ac-01, ac-02
- **D6**: compiles + renders cleanly — tsc clean + compile-smoke passes → ac-06, ac-07
- **D7**: post-skip disposition — unresolved findings backlog-captured on every skip, never dropped → ac-10

## Verification Criteria
All grep probes run at CHECKS after the ac-07 compile; `grep -LF` lists the named files MISSING the literal, so EMPTY output = the token renders in every listed body. Paths REVIEW/EXEC/LUREV/PHEXEC per the Rendered-body verification section.
- **ac-01**: `grep -LF "review-prefix-sha.json" <REVIEW> <EXEC> <LUREV> <PHEXEC>` returns EMPTY (SHA-capture convention renders in each of the four named bodies).
- **ac-02**: `grep -LF "When in doubt, re-review" <REVIEW> <EXEC> <LUREV> <PHEXEC>` returns EMPTY (conservative default clause renders in each of the four named bodies).
- **ac-03**: `grep -LF "provable zero overlap" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (no-overlap skip condition renders in each of the three gate bodies).
- **ac-04**: `grep -LF "diff is empty" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (empty-diff no-op skip condition renders in each gate body; semantics = BOTH probes' outputs empty — working-tree diff + untracked union, per Decisions G-ARCH-001).
- **ac-05**: `grep -LF "skip round-2" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (the gated action — round-2 re-review only, re-verify descoped — renders in each gate body).
- **ac-06**: `bunx --bun tsc --noEmit` exits 0.
- **ac-07**: the compile command (Rendered-body verification section) exits 0 (compile-smoke: the manifest renders without throw).
- **ac-08**: `grep -LF "git diff <pre-fix-sha> --name-only" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (working-tree-inclusive diff token — not the `..HEAD` form — renders in each gate body).
- **ac-09**: `grep -LF "git ls-files --others --exclude-standard" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (untracked-file union renders in each gate body).
- **ac-10**: `grep -LF "luca todo add --status backlog --source review-finding" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (post-skip backlog-capture renders in each gate body; REVIEW already carries the literal at L241 — the probe additionally pins the two skill mirrors).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT reduce reviewer fan-out — `grep -lF "Spawn ALL applicable reviewers in a SINGLE message" <PHEXEC>` returns the file (phase-execute fan-out directive still renders verbatim).
- **anti-02**: MUST NOT drop the perspective count — `grep -lF "5 reviewer subagents in parallel" <REVIEW>` returns the file (review-mode 5-perspective fan-out still renders verbatim).
- **anti-03**: MUST NOT touch cold isolation / independence auditor prose — `grep -lF "prevents the independence auditor from anchoring on prior reviewers" <PHEXEC>` returns the file (independence-auditor literal intact).
- **anti-04**: MUST NOT change the ≥2-perspective severity promotion or any luca-core file — `git status --porcelain packages/luca-core/` returns EMPTY output (catches staged + unstaged edits; scoped to this phase's uncommitted work — the branch already carries #319's committed luca-core changes, which correctly do not appear).
- **anti-05**: MUST NOT introduce consolidate-to-one-reviewer language — `grep -riF "single multi-perspective reviewer" <RENDERED>` returns NO match (exit 1).
- **anti-06**: MUST NOT skip round-2 unconditionally — `grep -LF "only when provably safe" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (each gate body guards the skip; it is conditional, never blanket).
- **anti-07**: MUST NOT add a Lever-1a shared precomputed-diff artifact — `grep -riF "precomputed diff artifact" <RENDERED>` returns NO match (exit 1).
