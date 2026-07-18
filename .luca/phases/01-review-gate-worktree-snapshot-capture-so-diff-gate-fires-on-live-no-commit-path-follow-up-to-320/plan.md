---
id: 01-review-gate-worktree-snapshot-capture-320-followup
title: "Worktree-snapshot diff-gate via `luca snapshot` CLI (follow-up to #320)"
wave: 3
tasks: 9
---

# Plan: worktree-snapshot capture so the diff-gate fires on the live no-commit path

## Objective
Replace #320's HEAD-SHA capture with a temp-index worktree tree snapshot owned by two new luca-cli verbs — `luca snapshot create` and `luca snapshot diff` — so the gate is (1) legal in REVIEWING (`luca-write` is matrix-allowed; every raw git snapshot primitive is bash-mutate-blocked there) and (2) correct on the live no-commit path (tree-to-tree diff captures untracked files exactly). Per D2 the CLI also owns the cite-overlap check and returns a machine verdict `empty | zero-overlap | overlap | ambiguous`; gate prose in the four bodies collapses to run-command-act-on-verdict. Per D3 the latent `ls-files` readonly-classification bug is fixed independently.

## Context
Locked decisions D1–D4 (context.md) + research: snapshot = temp `GIT_INDEX_FILE` `read-tree HEAD` → `add -A` → `write-tree` (zero side effects; unborn branch → empty tree); compare is TREE-TO-TREE (one-arg `git diff <tree>` reports untracked-in-index paths as deleted → never-skip artifact). Payload renames to `.luca/tmp/review-prefix-tree.json`, key `tree` (D4); consume-once + phase-key lifecycle semantics carry over VERBATIM — only filename/key spelling changes. Verdict fail-safes live in tested code: empty cite set + non-empty diff → `ambiguous`; any parse failure → `ambiguous`; `.luca/` paths excluded from the diff in code. HARD CONSTRAINT (#320): skip only on provably-safe verdicts (`empty`/`zero-overlap`); `overlap`/`ambiguous` → full re-review; skips never drop findings (backlog capture stays); fan-out/isolation/auditor mechanics UNCHANGED.

**Package boundary (VERIFIED)**: `classify-bash-command.ts` lives in `packages/luca-cli/src/hook/helpers/` (luca-cli); `stage-tool-matrix.ts` lives in `packages/luca-core/` — therefore NO luca-core edits anywhere in this plan (anti-07). Handler precedent: `packages/luca-cli/src/write-surface/handlers/luca-branch-guard.ts` (Bun.spawn to git) + command-group precedent `packages/luca-cli/src/commands/write-surface/branch.ts` + root wiring in `packages/luca-cli/src/cli.ts`.

### Standard literal tokens (exact strings the rendered bodies must contain)
- `review-prefix-tree.json` — the snapshot payload path (D4 rename).
- `luca snapshot create` — the capture command (Route B / Step 8.1 / EXEC cross-ref).
- `luca snapshot diff` — the gate compare+verdict command (three gate bodies).
- `zero-overlap` / `ambiguous` — verdict vocabulary (skip-eligible vs fail-safe re-review).
- `snapshot tree` — payload `tree` key semantics (never a commit sha).
- Carried from #320: `only when provably safe`, `When in doubt, re-review`, `skip round-2`, `luca todo add --status backlog --source review-finding`, `consume-once`.

### Retired tokens (must NOT render anywhere in the rendered tree)
`review-prefix-sha.json`; `git diff <pre-fix-sha> --name-only`; `git ls-files --others --exclude-standard`.

### Rendered-body verification (runs at CHECKS step, not REVIEWING)
Compile is bash-mutate → BLOCKED in REVIEWING; run all rendered greps at CHECKS. `<RENDERED>` = a scratch dir. Compile:
`bun packages/luca-tools/src/compile/bin/compile.ts --manifest packages/luca-tools/src/artifacts/index.ts --out <RENDERED>`
Paths: REVIEW=`<RENDERED>/.claude/agents/review.md`, EXEC=`<RENDERED>/.claude/agents/execute.md`, LUREV=`<RENDERED>/skills/lu-review/SKILL.md`, PHEXEC=`<RENDERED>/skills/phase-execute/SKILL.md`. Gate bodies = REVIEW, LUREV, PHEXEC; EXEC is the cross-reference mirror. `grep -LF` lists files MISSING the literal → EMPTY output = present in every listed file.

## Phases

### Phase 1: snapshot CLI + gate-body rework

#### Wave 1: CLI core + classifier (tracer bullet — parallel, disjoint files)
- [ ] **Task 1.1.1**: Implement `luca-snapshot-create` write-surface handler: build a worktree tree via temp `GIT_INDEX_FILE` (`read-tree HEAD` → `add -A` → `write-tree`, Bun.spawn per branch-guard precedent); on unborn branch (`read-tree HEAD` fails) use the EMPTY TREE as the read-tree BASE only — `add -A` + `write-tree` still capture the worktree (G-DX-001); write `{"tree": "<snapshot tree sha>", "phase": "<slug>"}` to `.luca/tmp/review-prefix-tree.json`. Export the tree-builder function from this file for the diff handler (2 callers, same feature — promotion tier 2). Unit tests cover payload shape, real-index non-mutation, and the unborn-branch case asserting worktree files ARE present in the snapshot tree.
  - Files: packages/luca-cli/src/write-surface/handlers/luca-snapshot-create.ts, luca-snapshot-create.test.ts
  - Verification: ac-12, ac-13
- [ ] **Task 1.1.2**: Classifier fix + registration in `classify-bash-command.ts`: add `ls-files` to `GIT_READONLY_SUBCOMMANDS` (line ~84) and `snapshot: new Set(['create', 'diff'])` to `LUCA_NOUN_VERBS` (line ~242); add test cases asserting `git ls-files --others --exclude-standard` classifies readonly and `luca snapshot create|diff` classify `luca-write`.
  - Files: packages/luca-cli/src/hook/helpers/classify-bash-command.ts, classify-bash-command.test.ts
  - Verification: ac-14, ac-18, ac-12

#### Wave 2: diff verdict + authoritative body (parallel, disjoint files)
- [ ] **Task 1.2.1**: Implement `luca-snapshot-diff` handler: read the payload, rebuild the current tree (import builder from 1.1.1), run `git diff <prior> <current> --name-only`, exclude `.luca/` paths in code, parse `File: {path:line}` cites (MUST-FIX AND SHOULD-FIX) from the active phase's `audits/*.md`, and print JSON with a `verdict` of `empty | zero-overlap | overlap | ambiguous` plus the changed-path list. Fail-safes in code: empty cite set + non-empty diff → `ambiguous`; any cite-parse failure or missing/mismatched payload → `ambiguous`; the handler CONSUMES the payload — deletes `.luca/tmp/review-prefix-tree.json` after reading, on EVERY path including mismatch/parse-fail (G-ARCH-002: `rm` is bash-mutate → hook-blocked in REVIEWING, so consume-once must live in the CLI; also kills the stale-baseline false-skip vector). Tests cover the four verdicts, the two fail-safe classes, `.luca/` exclusion, and payload consumption on every path.
  - Files: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts, luca-snapshot-diff.test.ts
  - Verification: ac-13, ac-12
  - Dependencies: 1.1.1
- [ ] **Task 1.2.2**: Rework `modes/review.ts` (authoritative): Route B capture becomes `luca snapshot create`; Step 3.5 gate collapses to read-payload-ABSENT-check (lifecycle prose verbatim, spelling → `review-prefix-tree.json`/`tree`), run `luca snapshot diff`, then skip round-2 only on `empty`/`zero-overlap`, re-review on `overlap`/`ambiguous`; retire the three old tokens; keep backlog-capture + conservative-default literals. Consume-once prose records that `luca snapshot diff` consumed (deleted) the payload — NO rm/delete instruction in the body (hook-blocked in REVIEWING, G-ARCH-002).
  - Files: packages/luca-tools/src/artifacts/modes/review.ts
  - Verification: ac-01, ac-02, ac-03, ac-04, ac-05, ac-06, ac-07, ac-08, ac-09, ac-10, anti-01, anti-02, anti-03, anti-05

#### Wave 3: wiring + mirrors (parallel, disjoint files)
- [ ] **Task 1.3.1**: Wire the CLI: new command group `commands/write-surface/snapshot.ts` (`snapshot create|diff` via `runWriteHandler`, per branch.ts), export from `commands/write-surface/index.ts` and `write-surface/index.ts`, register in `cli.ts`; add an `import.meta.main` self-invoke guard to `cli.ts` so source-mode invocation actually executes (G-CRIT-001 option b — cli.ts:106 only exports `runMain` today).
  - Files: packages/luca-cli/src/commands/write-surface/snapshot.ts, commands/write-surface/index.ts, src/write-surface/index.ts, src/cli.ts
  - Verification: ac-15, ac-16, ac-12
  - Dependencies: 1.1.1, 1.2.1
- [ ] **Task 1.3.2**: Mirror `modes/execute.ts` cross-reference note (~L412): Route B now runs `luca snapshot create` → `review-prefix-tree.json` (snapshot tree, commit-agnostic); keep `only when provably safe` + `When in doubt, re-review`.
  - Files: packages/luca-tools/src/artifacts/modes/execute.ts
  - Verification: ac-01, ac-02, ac-03, anti-01
  - Dependencies: 1.2.2
- [ ] **Task 1.3.3**: Rework `skills/lu-review/index.ts` gate + MUST-FIX exit capture to the same command/verdict prose as 1.2.2 (lifecycle verbatim, spelling changes only).
  - Files: packages/luca-tools/src/artifacts/skills/lu-review/index.ts
  - Verification: ac-01, ac-04, ac-05, ac-06, ac-07, ac-08, ac-09, ac-10, anti-01, anti-02, anti-03
  - Dependencies: 1.2.2
- [ ] **Task 1.3.4**: Rework `skills/phase-execute/index.ts` Step 8 gate + Step 8.1 capture (EXECUTING allows the CLI trivially) to the same command/verdict prose; fan-out and independence-auditor guard literals stay untouched. Body DOCUMENTS the accepted limitation (G-ARCH-001 option c): phase-execute reviewers return inline YAML (index.ts:967-975), never parseable `audits/<reviewer>.md` — the CLI cite set is empty → verdict `ambiguous` → this path always full-re-reviews (fail-safe; the skip optimization is live on the review-mode/lu-review paths).
  - Files: packages/luca-tools/src/artifacts/skills/phase-execute/index.ts
  - Verification: ac-01, ac-04, ac-05, ac-06, ac-07, ac-08, ac-09, ac-10, anti-01, anti-02, anti-03, anti-04, anti-06
  - Dependencies: 1.2.2
- [ ] **Task 1.3.5**: Add the anti-drift note to `subagents/reviewer.ts` audit-format prose (~L124): `File: {path:line}` is now a CLI parsing contract consumed by `luca snapshot diff`; format drift degrades the gate to `ambiguous` (fail-safe).
  - Files: packages/luca-tools/src/artifacts/subagents/reviewer.ts
  - Verification: ac-17

## Deliverables
- **D1**: `luca snapshot create` + `luca snapshot diff` CLI verbs (temp-index tree snapshot, tree-to-tree diff, machine verdict with coded fail-safes) → ac-13, ac-15, ac-16
- **D2**: classifier registration (`snapshot` noun) + `ls-files` readonly fix with tests → ac-14, ac-18
- **D3**: 4 gate bodies reworked to run-command-act-on-verdict with `review-prefix-tree.json`/`tree` rename, lifecycle preserved → ac-01, ac-03, ac-04, ac-05, ac-06, ac-07, ac-09, ac-10
- **D4**: retired tokens absent + #320 quality guards carried forward → anti-01, anti-02, anti-03, anti-04, anti-05, anti-06, ac-02, ac-08
- **D5**: reviewer.ts anti-drift note (audit format = CLI contract) → ac-17
- **D6**: builds clean, no luca-core touch → ac-11, ac-12, anti-07

## Verification Criteria
Grep probes over rendered bodies run at CHECKS after the ac-11 compile; `grep -LF` EMPTY = literal present in every listed file. After ac-16, clean up the smoke payload (`rm .luca/tmp/review-prefix-tree.json`) — cleanup runs at CHECKS where bash-mutate is legal (G-DX-002).
- **ac-01**: `grep -LF "review-prefix-tree.json" <REVIEW> <EXEC> <LUREV> <PHEXEC>` returns EMPTY (renamed payload path renders in each of the four named bodies).
- **ac-02**: `grep -LF "When in doubt, re-review" <REVIEW> <EXEC> <LUREV> <PHEXEC>` returns EMPTY (conservative default carried from #320).
- **ac-03**: `grep -LF "luca snapshot create" <REVIEW> <EXEC> <LUREV> <PHEXEC>` returns EMPTY (capture command renders in each of the four named bodies — Route B / Step 8.1 / EXEC cross-ref).
- **ac-04**: `grep -LF "luca snapshot diff" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (gate compare command renders in each gate body).
- **ac-05**: `grep -LF "zero-overlap" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (skip-eligible verdict vocabulary renders in each gate body).
- **ac-06**: `grep -LF "ambiguous" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (fail-safe verdict renders in each gate body).
- **ac-07**: `grep -LF "skip round-2" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (gated action carried from #320).
- **ac-08**: `grep -LF "luca todo add --status backlog --source review-finding" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (post-skip backlog capture carried from #320).
- **ac-09**: `grep -LF "consume-once" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (payload lifecycle prose preserved in each gate body).
- **ac-10**: `grep -LF "snapshot tree" <REVIEW> <LUREV> <PHEXEC>` returns EMPTY (payload `tree` key documented as a snapshot tree sha, never a commit).
- **ac-11**: the compile command (Rendered-body verification section) exits 0.
- **ac-12**: `bunx --bun tsc --noEmit` exits 0.
- **ac-13**: `timeout 180 bun test packages/luca-cli/src/write-surface/handlers/luca-snapshot-create.test.ts packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.test.ts` exits 0.
- **ac-14**: `timeout 120 bun test packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts` exits 0.
- **ac-15**: `bun packages/luca-cli/src/cli.ts snapshot create` exits 0 (in-repo smoke, run at CHECKS; non-vacuous because Task 1.3.1 adds the `import.meta.main` self-invoke guard — the command actually executes, so a wiring failure exits non-zero).
- **ac-16**: `grep -F "\"tree\"" .luca/tmp/review-prefix-tree.json` outputs ≥1 line (payload written by the ac-15 run carries the `tree` key).
- **ac-17**: `grep -F "CLI parsing contract" packages/luca-tools/src/artifacts/subagents/reviewer.ts` outputs ≥1 line (anti-drift note present at the audit-format prose).
- **ac-18**: `grep -F "'ls-files'" packages/luca-cli/src/hook/helpers/classify-bash-command.ts` outputs ≥1 line (readonly-set entry present; semantics asserted by the ac-14 test case).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT retain the retired payload name — `grep -rF "review-prefix-sha.json" <RENDERED>` outputs nothing.
- **anti-02**: MUST NOT retain the commit-based diff — `grep -rF "git diff <pre-fix-sha> --name-only" <RENDERED>` outputs nothing.
- **anti-03**: MUST NOT retain the untracked-union command — `grep -rF "git ls-files --others --exclude-standard" <RENDERED>` outputs nothing.
- **anti-04**: MUST NOT reduce reviewer fan-out — `grep -LF "Spawn ALL applicable reviewers in a SINGLE message" <PHEXEC>` returns EMPTY (#320 guard carried).
- **anti-05**: MUST NOT reduce perspective count — `grep -LF "5 reviewer subagents in parallel" <REVIEW>` returns EMPTY (#320 guard carried).
- **anti-06**: MUST NOT weaken the independence auditor — `grep -LF "anchoring on prior reviewers" <PHEXEC>` returns EMPTY (#320 guard carried).
- **anti-07**: MUST NOT touch luca-core — `git status --porcelain packages/luca-core/` outputs nothing (classifier is in luca-cli; stage-tool-matrix stays untouched).

## Risks & Mitigations
- GC prunes a dangling snapshot tree mid-loop → `rev-parse --verify` fails → existing ABSENT branch → full round-2 (fail-safe; 2-week default window ≫ loop window).
- Reviewer audit-format drift breaks cite parsing → coded `ambiguous` verdict → full re-review (fail-safe; ac-17 note deters drift).
- Stranded payload after a gate exit (stale-baseline false-skip vector) → eliminated: `luca snapshot diff` consumes the payload in code on every path (G-ARCH-002).
- Verdict word `ambiguous` may pre-exist in a body in unrelated prose → ac-06 could pass vacuously; plan-reviewer + Wave-2/3 tasks anchor it inside the verdict enumeration.

## Decisions
- 2026-07-18 — Tree-builder shared by exporting from `luca-snapshot-create.ts` (2 callers, same feature — no premature `__helpers` promotion).
- 2026-07-18 — Token spans: capture tokens (ac-01/02/03) span all four bodies; diff/verdict/lifecycle tokens (ac-04..10) span the three gate bodies — EXEC is a cross-reference mirror without a gate.
- 2026-07-18 — Guard literals pinned per actual location (grep-verified): fan-out + auditor guards live only in PHEXEC, the 5-parallel literal only in REVIEW; anti-04/05/06 target those files, not all three.
- 2026-07-18 — ac-15 smoke invokes the CLI from source (`bun .../cli.ts`) so the probe is independent of the linked/built `luca` binary.
- 2026-07-18 — G-CRIT-001 → option (b): `import.meta.main` self-invoke guard in cli.ts (Task 1.3.1) makes the source probe real; rejected build-then-probe (couples the probe to build state) and `bun -e` wrapper (probes an artificial entry, not the wiring).
- 2026-07-18 — G-ARCH-001 → option (c): never-skip on phase-execute is an ACCEPTED, documented limitation. Evidence: its reviewers return inline YAML (index.ts:967-975), no parseable audits exist, and persisting audits from the legacy skill has unverified stage-gate legality; `ambiguous` fail-safe honors the HARD CONSTRAINT. ac-04..ac-10 stay valid — PHEXEC still renders the uniform command/verdict literals.
- 2026-07-18 — G-ARCH-002 → consumption moved into `luca snapshot diff` (deletes payload after reading, every path). Bodies keep the `consume-once` literal but as a statement of CLI behavior, never an rm instruction (rm is hook-blocked in REVIEWING).
- 2026-07-18 — Verified `classify-bash-command.ts` ∈ luca-cli and `stage-tool-matrix.ts` ∈ luca-core → anti-07 forbids any luca-core diff; no stage-tool-matrix edits planned.
