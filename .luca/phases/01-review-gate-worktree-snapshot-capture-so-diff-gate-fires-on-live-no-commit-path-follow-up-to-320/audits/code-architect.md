PERSPECTIVE: architecture

## Verdict

MUST-FIX (REQUEST_CHANGES) — 1 must-fix, 5 should-fix, 4 notes.

## MUST-FIX

- [MUST-FIX] The `zero-overlap` proof compares paths across two un-normalized namespaces, so a format-plausible cite silently defeats the gate in the fail-OPEN direction. `git diff --name-only` (luca-snapshot-diff.ts:278) emits repo-root-relative, unprefixed paths; `parseAuditCitePaths` accepts ANY string before the trailing `:line` — `CITE = /^(.+):(\d+)$/` at luca-snapshot-diff.ts:52 happily parses `/Users/x/repo/src/a.ts:12` or `./src/a.ts:12`. An absolute or `./`-prefixed cite lands in `citeSet` verbatim, never intersects the changed set (luca-snapshot-diff.ts:359), and the handler returns `zero-overlap` → round-2 is skipped even though the changed file IS the cited file. This is not hypothetical: LLM reviewers routinely emit absolute paths (the shared subagent prefix in luca-tools even mandates absolute paths in final responses, priming exactly this output), and the doc contract at luca-snapshot-diff.ts:27 claims zero-overlap is "PROVABLY no changed path is cited" — the proof is unsound for any cite outside git's path namespace. Everything else in this handler correctly fails CLOSED to `ambiguous`; this is the one gap that fails open.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:103
  Suggestion: In `parseAuditCitePaths`, treat any cite path that is not plainly repo-relative as a parse FAILURE (→ `ambiguous`, consistent with the existing fail-safe design): reject paths starting with `/`, `./`, `~`, a Windows drive/backslash, or containing a `..` segment. One added guard after the `CITE.exec` check; add negative tests alongside the existing parse-failure tests.
  Cross-phase: false

## SHOULD-FIX

- [SHOULD-FIX] Same proof-soundness class, rarer trigger: the tree-to-tree diff runs without `core.quotepath=off`, so a changed path containing non-ASCII bytes is emitted C-quoted (`"docs/r\303\251sum\303\251.md"`, quotes included) and can never match an unquoted cite — another silent `zero-overlap`. Not promoted to MUST-FIX only because non-ASCII filenames are absent from this repo today.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:278
  Suggestion: Invoke as `git -c core.quotepath=off diff <prior> <current> --name-only` (or use `-z` and split on NUL).
  Cross-phase: false
- [SHOULD-FIX] `snapshot create` / `snapshot diff` have no entries in `WRITE_COMMAND_PHASES`, violating the registry's own documented convention: "explicit empty entry = allowed in any pipelineStep (registry completeness — absence is NOT the same as [])" (packages/luca-core/src/state/configs/step-artifacts.ts:87-90). Functionally identical today (runWriteHandler skips the check on `undefined`, run-handler.ts:54-57), but the table is the declared source of truth the CLI self-enforcement consults, and every silent omission erodes it.
  File: packages/luca-core/src/state/configs/step-artifacts.ts:127
  Suggestion: Add `'snapshot create': []` and `'snapshot diff': []` with a phase-agnostic comment matching the `'plan lint'` precedent.
  Cross-phase: true
- [SHOULD-FIX] Module-boundary deviation: `luca-snapshot-diff.ts` is the only non-test handler that imports from a sibling handler (`buildWorktreeSnapshotTree`, `REVIEW_PREFIX_TREE_RELPATH` from `./luca-snapshot-create.ts`, luca-snapshot-diff.ts:15-18), and `runGit` + `GitRunResult` are duplicated verbatim in both handlers (luca-snapshot-create.ts:24, luca-snapshot-diff.ts:121; a third copy exists at packages/luca-core/src/analysis/phase-diff.ts:43). The established pattern is shared mechanisms in `write-surface/helpers/` (cf. `writeAtomicFile`, `resolve-*` helpers), handlers as leaves.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:15
  Suggestion: Extract `runGit` + `buildWorktreeSnapshotTree` + the payload relpath constant into `write-surface/helpers/worktree-snapshot.ts`; both handlers import the helper.
  Cross-phase: false
- [SHOULD-FIX] Classifier registry drift adjacent to this diff's registry edit: `budget` (registered in cli.ts:95-98) is absent from both `LUCA_NOUN_VERBS` and the `LUCA_TOPLEVEL_*` sets, so `luca budget check` falls through to unknown-command → `bash-mutate` and is blocked in PLANNING/REVIEWING — exactly the failure mode the snapshot entry (classify-bash-command.ts:270) was added to avoid. Root cause is architectural: two hand-maintained sources of truth (cli.ts noun registration vs the classifier registry) with no completeness test binding them.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.ts:245
  Suggestion: Add `budget: new Set(['check'])` (with `check` read-only if appropriate), and add a test asserting every noun lazily registered in cli.ts appears in `LUCA_NOUN_VERBS` or a `LUCA_TOPLEVEL_*` set.
  Cross-phase: true
- [SHOULD-FIX] The create handler writes the consume-once payload with a raw `writeFile` instead of the existing `writeAtomicFile` helper the write-surface barrel exports for exactly this purpose (packages/luca-cli/src/write-surface/index.ts:36). A torn write only degrades to `ambiguous` (fail-safe), so this is consistency, not correctness.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-create.ts:178
  Suggestion: Use `writeAtomicFile` for the payload write.
  Cross-phase: false

## Notes

- [NOTE] Design observation for the record: a `zero-overlap` skip means the fix round changed files no reviewer cited — those post-round-1 changes then reach `learn` without ever being reviewed. The prose treats this as "provably safe" and routes unresolved findings to backlog todos (review.ts:99-102); flagging as accepted-risk tech debt to track, not a defect.
- [NOTE] Check ordering: an unparsable audit forces `ambiguous` even when the changed set is empty (cite collection at luca-snapshot-diff.ts:314-340 runs before the `empty` check at :343), though an empty diff is provably safe regardless of audit parseability. Conservative-only; matches the docstring.
- [NOTE] Stale rationale comment: classify-bash-command.ts:96-98 justifies adding `ls-files` with "used by the snapshot capture path", but the capture path is CLI-internal (`read-tree`/`add -A`/`write-tree` via Bun.spawn) — no agent-side `ls-files` call exists. The addition itself is harmless (pure read).
- [NOTE] Minor prose drift: lu-review/index.ts:33 writes the cite format as `File:line` where review.ts:94 and reviewer.ts:124 write `File: {path:line}`. Cosmetic, but this format is now a parsing contract (correctly anti-drift-annotated at reviewer.ts:140), so the prose should quote it uniformly.

## What was verified (evidence for the non-findings)

- Temp-index mechanism (luca-snapshot-create.ts:82-134): `GIT_INDEX_FILE` scoped to the three spawns only, unborn-HEAD fallback via `read-tree --empty`, sha1/sha256 output validation, temp index + `.lock` removed in `finally` — real index/worktree untouched as claimed.
- Consume-once (G-ARCH-002): payload deleted at luca-snapshot-diff.ts:202 before ANY validation branch; every verdict path returns with the payload gone. Prose in all four gate bodies correctly delegates all validation to the CLI and keeps only the ABSENT check body-side (review.ts:93, lu-review/index.ts:29, phase-execute/index.ts:886).
- Wiring completeness: handlers exported in write-surface/index.ts:85-86, command group in commands/write-surface/{snapshot.ts,index.ts:16}, lazily registered in cli.ts:87-90, classifier entry at classify-bash-command.ts:270 (`luca-write`, allowed in every non-IDLE phase per stage-tool-matrix.ts:48-86 — REVIEWING included, which the gate requires).
- Deterministic-CLI vs LLM-prose split: verdict computation, payload lifecycle, and cite parsing are entirely CLI-owned; the four gate bodies are pure run-command-act-on-verdict. Snapshot creation sites (review.ts:257 Route B, lu-review/index.ts:65, phase-execute/index.ts:1253) and the execute.ts:412 cross-reference are mutually consistent, and phase-execute's non-persisted-audits limitation is explicitly documented as always-ambiguous fail-safe (phase-execute/index.ts:892).
- Producer-side contract protection: reviewer.ts:140 anti-drift note names `luca snapshot diff` as the consumer of the `File: {path:line}` format.
- Payload path `.luca/tmp/review-prefix-tree.json` conforms to the tmp/<kebab-name>.json contract; `.luca/` paths excluded from the changed set (luca-snapshot-diff.ts:158-160, :295).

CONSOLIDATED:
  MUST_FIX_COUNT: 1
  SHOULD_FIX_COUNT: 5
  NOTE_COUNT: 4
  CROSS_PHASE_COUNT: 2

## Round 2

PERSPECTIVE: architecture
VERDICT: APPROVE — round-1 MUST-FIX resolved; no new MUST-FIX introduced by the fix wave.

### Round-1 MUST-FIX: RESOLVED

The path-namespace soundness gap is closed. `isPlainRepoRelativePath()` (luca-snapshot-diff.ts:63-69) rejects absolute POSIX paths, backslashed/Windows-drive paths, and any `.`/`..` segment (which covers `./`- and `../`-prefixed cites via segment inspection), and is wired as a parse FAILURE at luca-snapshot-diff.ts:143-148 — mapping to the fail-safe `ambiguous` verdict exactly as the round-1 suggestion specified. Verified end-to-end, not just at the parser: handler-level tests assert `ambiguous` for an absolute-path cite (luca-snapshot-diff.test.ts:272-286) and a `./`-prefixed cite (:288-298), plus unit-level negative tests for absolute (:432-435), `./` (:437-440), and `../` (:442-444). The realistic fail-open vector (absolute paths, which the subagent shared prefix primes) is eliminated.

Residual sliver, NOT blocking (fold into any future touch): two exotic forms still pass the guard and would silently fail to intersect — a `~`-prefixed cite (`~/repo/src/a.ts` starts with neither `/` nor a drive letter, and `~` is a plain segment) and an empty-segment cite (`src//a.ts`, segments `['src','','a.ts']` contain neither `.` nor `..`). Both are far less plausible LLM outputs than absolute paths; disposition SHOULD-FIX-carryover. File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:64. Suggestion: also reject `path.startsWith('~')` and `segments.includes('')`.

### New fix-wave changes: verified sound, no new MUST-FIX

- `--no-renames` (luca-snapshot-diff.ts:330, rationale comment :320-325): correct and closes a rename fail-open round 1 did not catch — default rename detection (`diff.renames`, git >= 2.9) would list ONLY the new path of a renamed+modified cited file, dropping the cited old path from the intersection. Covered by the handler test at luca-snapshot-diff.test.ts:160.
- `-c core.quotepath=false` (luca-snapshot-diff.ts:327-328): resolves round-1 SHOULD-FIX #1. Test at luca-snapshot-diff.test.ts:178 exercises a non-ASCII changed path.
- Cite-less actionable findings → `ambiguous` (`uncitedActionable` tracking, luca-snapshot-diff.ts:103-157): checked both discharge points — the next-bullet transition (:107-112, correctly evaluated BEFORE severity handling, so a NOTE bullet following an uncited MUST-FIX still trips it) and the EOF check (:152-157). NOTE findings correctly remain exempt; an audit with zero findings still parses (empty cite set), preserving the `empty`-verdict path. Test at luca-snapshot-diff.test.ts:316. This closes a fail-open sibling of my round-1 finding (an uncited MUST-FIX previously contributed nothing to the cite set, enabling a vacuous zero-overlap when other cites existed).
- `snapshotPayloadSchema` shared Zod contract (luca-snapshot-create.ts:24-27, consumed via `safeParse` at luca-snapshot-diff.ts:260): producer/consumer payload shape now has a single source of truth — schema-first, correct boundary placement (lives with the producer, imported by the consumer).
- `prior_tree` output field (luca-snapshot-diff.ts:161-186), `null` on missing/unparsable payload (:241, :254) and populated on every later branch: matches the updated tool description (:222); tests at luca-snapshot-diff.test.ts:156 and :341. This also supplies the sha the gate prose requires for the post-skip audit note ("citing the snapshot tree sha") — a wiring gap now closed.
- Shared `runGit` (exported from luca-snapshot-create.ts:54-69, imported at luca-snapshot-diff.ts:18): duplication eliminated; optional `env` param preserves the temp-index spawn semantics (create.ts:116-141) unchanged.
- `ls-files` comment reword (classify-bash-command.ts:96-100): now correctly states the capture path does NOT go through the classifier — round-1 NOTE #3 resolved.

### Round-1 SHOULD-FIX dispositions

1. `core.quotepath` — RESOLVED (see above).
2. `WRITE_COMMAND_PHASES` entries for `snapshot create`/`snapshot diff` — UNADDRESSED (luca-core untouched by the fix wave; verified no `snapshot` entry in step-artifacts.ts). Carry forward, cross-phase: true.
3. Sibling-handler import / `runGit` duplication — PARTIALLY ADDRESSED: the duplication is gone (shared export), but the shared mechanism (`runGit`, `buildWorktreeSnapshotTree`, `snapshotPayloadSchema`, relpath constant) still lives in the sibling handler file rather than `write-surface/helpers/`, so luca-snapshot-diff.ts:15-20 remains the only non-test cross-handler import. Acceptable; carry the helpers-extraction as advisory.
4. `budget` classifier entry — UNADDRESSED (verified: no `budget` match in classify-bash-command.ts). Carry forward, cross-phase: true.
5. `writeAtomicFile` for the payload write — UNADDRESSED (luca-snapshot-create.ts:208-211 still raw `writeFile`; torn write degrades to `ambiguous`, fail-safe). Advisory.

### Round 2 CONSOLIDATED

  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 0
  CROSS_PHASE_COUNT: 0
