PERSPECTIVE: test-quality
VERDICT: REQUEST_CHANGES

## Verdict

REQUEST_CHANGES — 1 MUST-FIX (materially untested critical path in the cite-intersection proof), 6 SHOULD-FIX, 5 notes. The test suites are genuinely strong overall: real git repos (no vacuous mocks), consumption asserted on nearly every verdict branch, negative anchors present (unborn-branch test asserts HEAD stays unresolvable; index-untouched tests compare `status --porcelain` before/after). The gaps below are the branches the suite does not pin.

## MUST-FIX

- [MUST-FIX] Non-repo-relative cite paths are completely untested, and they silently defeat the zero-overlap proof. `CITE = /^(.+):(\d+)$/` accepts `File: /Users/alec/repo/src/a.ts:12` and `File: ./src/a.ts:12` as valid cites, but `git diff --name-only` emits repo-relative paths, so an absolute or `./`-prefixed cite can NEVER intersect the changed set — the gate returns `zero-overlap` and skips re-review even when the change touches exactly the cited file. This is a realistic input: the reviewer-agent guidance in this repo explicitly tells subagents to share absolute file paths. Every parse test uses clean repo-relative cites (`src/broken.ts:12`, `tracked.txt:1`, deep-path test at luca-snapshot-diff.test.ts:337-341), so nothing pins the intended behavior for the unsound forms.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:103
  Suggestion: Decide the contract (normalize absolute/`./` cites to repo-relative, or reject them as a parse failure → `ambiguous`) and add tests pinning it: (1) `parseAuditCitePaths('- [MUST-FIX] x\n  File: /abs/repo/src/a.ts:12\n')` and the `./src/a.ts:12` variant assert the chosen outcome; (2) an end-to-end diff test where the audit cites the changed file via an absolute path and the verdict is asserted to be `overlap` (or `ambiguous`), never `zero-overlap`.
  Cross-phase: false

## SHOULD-FIX

- [SHOULD-FIX] The `mode === 'skip'` branch (a `File:` cite under a `[NOTE]` finding) is never exercised. `CITED_AUDIT`'s NOTE finding (luca-snapshot-diff.test.ts:97) carries no `File:` line, so the skip path at luca-snapshot-diff.ts:102 has zero coverage — a regression that collected NOTE cites (spurious `overlap`) or errored on them would pass the suite.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:102
  Suggestion: Add a `parseAuditCitePaths` case with `- [NOTE] debt\n  File: src/noted.ts:9\n- [MUST-FIX] x\n  File: src/a.ts:1\n` asserting `paths` equals `['src/a.ts']` (NOTE cite excluded, no error).
  Cross-phase: false

- [SHOULD-FIX] The missing-fields payload branch is untested: valid JSON lacking string `tree`/`phase` (luca-snapshot-diff.ts:230-237) is never fed to the handler, so neither the `ambiguous` verdict nor payload consumption is asserted for it. Adjacent branches (unparsable JSON, missing file, bad tree) are all covered — this is the one payload-validation hole.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:230
  Suggestion: Add a test writing `{"tree": 123}` (and/or `{"phase": "01-auth-rewrite"}` alone) to the payload path, assert `verdict === 'ambiguous'`, reason mentions the missing fields, and `expectPayloadConsumed(cwd)`.
  Cross-phase: false

- [SHOULD-FIX] Temp-index cleanup (the `finally` at luca-snapshot-create.ts:129-133, including the `.lock` sibling) has no test on either the success or failure path. The prompt-level concern is real: a leak accumulates one file per snapshot in tmpdir and the suite would never notice.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-create.ts:129
  Suggestion: In a test, list `tmpdir()` entries matching `luca-snapshot-index-` before and after `buildWorktreeSnapshotTree` (both the success case and the non-repo failure case) and assert no new entries remain.
  Cross-phase: false

- [SHOULD-FIX] Two error tests assert only the failure bit, not the failure reason: `errors when no phase is active` checks only `r.isError === true` (luca-snapshot-create.test.ts:160) and `fails cleanly outside a git repo` checks only `built.ok === false` (luca-snapshot-create.test.ts:165). Both would pass if the code failed for an unrelated reason (e.g. unreadable state file, empty error string).
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-create.test.ts:160
  Suggestion: Assert a reason substring in each (e.g. the resolve-slug error text for the phase test; a non-empty `built.error` containing `read-tree` for the non-repo test).
  Cross-phase: false

- [SHOULD-FIX] Two `ambiguous` fail-safe branches inside the diff handler are untested: `resolveActiveSlug` failure (luca-snapshot-diff.ts:241-242 — e.g. payload present but `.luca/state.json` has `currentPhase: 0`) and `buildWorktreeSnapshotTree` failure during rebuild (luca-snapshot-diff.ts:268-276). Only the phase-mismatch and bad-tree branches are covered.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:241
  Suggestion: Add a test that writes a valid payload, then overwrites state.json with `currentPhase: 0`, asserting `ambiguous` + payload consumed. (The rebuild-failure branch is harder to trigger hermetically; acceptable to leave with a comment if impractical.)
  Cross-phase: false

- [SHOULD-FIX] The deletion case on the live no-commit path is untested: deleting a cited tracked file after the snapshot should surface in `changed_paths` (temp-index `add -A` records the removal) and produce `overlap`. All change-set tests use additions/modifications only.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.test.ts:156
  Suggestion: Add a test: snapshot, `rm tracked.txt`, run diff, assert `changed_paths` contains `tracked.txt` and verdict is `overlap` (tracked.txt is cited by `CITED_AUDIT`).
  Cross-phase: false

## Notes

- [NOTE] classify-bash-command new cases are adequately covered: `git ls-files --others --exclude-standard` → bash-readonly (classify-bash-command.test.ts:22) and `luca snapshot create|diff` → luca-write including the `--json` flag variant (classify-bash-command.test.ts:280-290). Missing only a negative anchor for `luca snapshot <unknown-verb>` (falls to luca-write via the known-noun/unknown-verb branch by design) — low value.
- [NOTE] `expect(payload.tree).toMatch(/^[0-9a-f]{40}$/)` (luca-snapshot-create.test.ts:83) is narrower than the implementation, which also accepts 64-hex sha256 trees (luca-snapshot-create.ts:121). Fine for the default test repo, but the test would fail spuriously on a sha256 object-format default.
- [NOTE] Multi-audit cite aggregation (dedupe across two `audits/*.md` files into one sorted cite set, luca-snapshot-diff.ts:314-341) is untested — every test writes exactly one audit.
- [NOTE] `git diff <tree> <tree> --name-only` with rename detection enabled (default in modern git) may report a rename under the new name only, so a cited OLD path could be missed → `zero-overlap`. Flagging for the integration/independence lanes; a `--no-renames` flag would make the changed set strictly a superset.
- [NOTE] Concurrent snapshot builds are made safe by `randomUUID()` temp-index names; no test covers concurrency, which is acceptable given the mechanism is structurally collision-free.

What I verified for the strong parts (evidence for the non-flagged areas): consumption is asserted via `expectPayloadConsumed` on 12 of the handler's return branches (luca-snapshot-diff.test.ts:127,140,153,168,185,203,213,229,245,253,263,280,307); the consume-before-process ordering (luca-snapshot-diff.ts:196-202) structurally guarantees the untested branches too; the index/worktree-untouched tests use real mixed dirty state with a before/after `status --porcelain` comparison (luca-snapshot-create.test.ts:88-115, luca-snapshot-diff.test.ts:283-308); the GC-pruned/unresolvable-tree path is covered by the `deadbeef…` payload test (luca-snapshot-diff.test.ts:266-281); the no-vacuous-skip invariant (empty cite set + non-empty changed set → ambiguous) is covered twice (luca-snapshot-diff.test.ts:188-214).

CONSOLIDATED:
  MUST_FIX_COUNT: 1
  SHOULD_FIX_COUNT: 6
  NOTE_COUNT: 5
  CROSS_PHASE_COUNT: 0

## Round 2

PERSPECTIVE: test-quality
VERDICT: APPROVE

### Round-1 MUST-FIX: RESOLVED (coverage is genuine, not vacuous)

Re-verified against the post-fix files (38 tests across the two handler suites: 31 in luca-snapshot-diff.test.ts, 7 in luca-snapshot-create.test.ts).

- Source now rejects non-repo-relative cites: `isPlainRepoRelativePath` (luca-snapshot-diff.ts:63-69) rejects `/`-prefixed, backslash-containing, Windows-drive, and `.`/`..`-segment paths; the parser maps rejection to a parse failure (luca-snapshot-diff.ts:143-148) which the handler maps to `ambiguous`.
- Unit tests pin both directions: absolute (luca-snapshot-diff.test.ts:432-435), `./` (437-440), `../` (442-445) all assert `ok === false` against the real parser, and the positive anchor at 426-430 (`src/dir/deep/file.test.ts:104` → collected) proves the guard does not over-reject plain-relative cites.
- Handler-level tests exercise the full pipeline: absolute-cite (272-286) and `./`-cite (288-302) each write a real audit, snapshot, change a file, and assert `verdict === 'ambiguous'` PLUS `reason` contains `'repo-relative'` PLUS payload consumption. The reason-substring assertion is what makes these non-vacuous — they cannot pass via a different `ambiguous` cause (e.g. the empty-cite fail-safe).

### New round-2 coverage: verified genuine

- `--no-renames` (luca-snapshot-diff.ts:326-334): the rename test (test:160-176) deletes `tracked.txt` and recreates identical content as `renamed.txt` — an exact rename that default-on rename detection WOULD collapse to the new path only, so `expect(changed_paths).toContain('tracked.txt')` (test:173) is a real regression anchor: remove `--no-renames` and this test fails.
- `core.quotepath=false` (luca-snapshot-diff.ts:326-328): the non-ASCII test (test:178-194) carries a true negative anchor — `expect(changed.startsWith('"')).toBe(false)` (test:189) directly pins the octal-escaped failure mode, plus the NFC-normalized literal match.
- Cite-less actionable findings (luca-snapshot-diff.ts:103-157): pinned at EOF (unit test:447-450), mid-file (452-457), handler level with reason substring `'without a "File:" cite'` (304-318), and the two non-failure anchors — NOTE-without-cite parses ok (459-463) and headings-only audit parses ok with empty paths (465-471). The last two matter: without them the new failure mode could have been over-broad and the suite would not have noticed.
- `prior_tree`: asserted sha-shaped in zero-overlap (test:156) and `null` in missing-payload (test:341), matching the widened `diffResult` signature (luca-snapshot-diff.ts:161-186).

### Verifier's flag — backslash/Windows-drive cite forms: NOT blocking (SHOULD-FIX)

The rejection lines exist in source (luca-snapshot-diff.ts:64-65) but have no dedicated unit tests. Assessment: acceptable as advisory, not a blocker. The behavior is correct today and sits inside a function whose dominant realistic forms (absolute POSIX, `./`, `../`) are pinned by five tests; the residual risk is a future edit deleting lines 64-65 unnoticed, which would let a backslashed cite be collected and never string-match git's `/`-separated output (false `zero-overlap` possible). That regression direction is real but the input form is unlikely from this repo's POSIX reviewer output, and the fix is two one-line unit tests.

- [SHOULD-FIX] Add unit tests `parseAuditCitePaths('- [MUST-FIX] x\n  File: src\\a.ts:3\n')` → `ok === false` and `'- [MUST-FIX] x\n  File: C:\\repo\\a.ts:3\n'` → `ok === false` to pin luca-snapshot-diff.ts:64-65.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.test.ts:432
  Suggestion: as above — two one-line cases next to the existing absolute/`./`/`../` tests.
  Cross-phase: false

### Round-1 SHOULD-FIX dispositions

1. NOTE-with-`File:`-cite skip branch (now luca-snapshot-diff.ts:135) — OPEN. The new NOTE tests are cite-less (test:459-463); a `File:` line under a `[NOTE]` finding is still never exercised.
2. Missing `tree`/`phase` fields — code improved (shared `snapshotPayloadSchema`, luca-snapshot-create.ts:24-27, consumed via `safeParse` at luca-snapshot-diff.ts:260-269) but the branch is still untested at handler level — OPEN.
3. Temp-index cleanup (`finally` now at luca-snapshot-create.ts:159-163) — OPEN, no test added.
4. Weak error assertions in create tests (test:160, test:165) — OPEN, create test file unchanged.
5. `resolveActiveSlug`-failure (luca-snapshot-diff.ts:274-282) and rebuild-failure (310-318) ambiguous branches — OPEN.
6. Deletion on the live no-commit path — RESOLVED: the rename test deletes `tracked.txt` (test:167) and asserts it appears in `changed_paths` with verdict `overlap`.

All open items are advisory branch-coverage gaps in fail-safe (conservative-direction) paths — none blocks.

### New MUST-FIX findings

None. I specifically re-checked: the two new handler ambiguous tests are distinguished by reason substrings (not tautological); the rename and quotepath tests fail if their respective flags are removed; the uncited-actionable failure mode has both positive and negative anchors; classify-bash-command.ts changed comment-only (lines 96-100 — no behavior, no test needed).

### Round-2 Notes

- [NOTE] Test-name-vs-body drift: `'renamed+modified cited file …'` (test:160) performs a PURE rename (identical `'v1\n'` content, test:167-168), not renamed+modified. The pure rename is actually the stronger `--no-renames` anchor (exact renames are always detected), but the name overclaims.
- [NOTE] The three new path-form unit tests assert only `ok === false` without an error-message substring; acceptable since the handler-level tests pin the `'repo-relative'` reason.
- [NOTE] Carried from round 1, still accurate: 40-hex regex narrower than impl (create test:83 vs create.ts:151); multi-audit cite aggregation untested; concurrency untested (structurally safe via `randomUUID`).

CONSOLIDATED (Round 2):
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 6
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 0
