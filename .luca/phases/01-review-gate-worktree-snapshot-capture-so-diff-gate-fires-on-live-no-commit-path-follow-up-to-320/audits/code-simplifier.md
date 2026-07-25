PERSPECTIVE: simplification
VERDICT: APPROVE

## Verdict

APPROVE — no correctness bugs, security issues, or missing requirements found from the simplification perspective. The intentional sharing of `buildWorktreeSnapshotTree` (exported from the create handler, imported by the diff handler) is clean and was not flagged per scope. The verdict/parse logic in `luca-snapshot-diff.ts` is a minimal three-state line scanner with fail-safe-on-malformation semantics — appropriately simple for its contract. Findings below are advisory duplication/dead-code items.

Locations verified (evidence for APPROVE):
- `packages/luca-cli/src/write-surface/handlers/luca-snapshot-create.ts:82-134` — temp-index build is the minimal three-step git sequence (read-tree/add -A/write-tree), unborn-branch fallback is a single extra spawn, cleanup in `finally` covers both index and `.lock`. No over-engineering.
- `packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:75-113` — `parseAuditCitePaths` is a flat state machine (`none|collect|skip`); every malformation returns a parse failure that the caller maps to the `ambiguous` fail-safe. Extra cites can only flip `zero-overlap` → `overlap` (safe direction), never the reverse.
- `packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:190-374` — consume-once delete happens before any validation branch (line 202), so every exit path leaves the payload gone; verdict ordering (`empty` → empty-cite `ambiguous` → `zero-overlap`/`overlap`) is correct and non-vacuous.
- `packages/luca-cli/src/hook/helpers/classify-bash-command.ts:266-271` — `snapshot: create|diff` both classify `luca-write` by falling outside `LUCA_READ_VERBS`; correct for a gated write path, with the intent documented inline.
- `packages/luca-cli/src/commands/write-surface/snapshot.ts:21-67` — thin citty wrappers over the handlers, no logic duplication.

## MUST-FIX

None.

## SHOULD-FIX

- [SHOULD-FIX] `runGit` + `GitRunResult` are duplicated between the two handlers. `luca-snapshot-diff.ts:115-131` re-declares the exact helper defined in `luca-snapshot-create.ts:18-39` (the create version is a superset — it accepts the optional `env` param). The diff handler already imports `buildWorktreeSnapshotTree` and `REVIEW_PREFIX_TREE_RELPATH` from the create module, so sharing is one `export` keyword away.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:121
  Suggestion: Export `runGit` from `luca-snapshot-create.ts` (or hoist to a small shared helper) and delete the duplicate + duplicate `GitRunResult` interface in the diff handler. (Test-file copies are fine to keep.)
  Cross-phase: false
- [SHOULD-FIX] Stale rationale comment on the `ls-files` allowlist entry: "used by the snapshot capture path". The shipped snapshot capture (`buildWorktreeSnapshotTree`) spawns `git read-tree`/`add -A`/`write-tree` directly via `Bun.spawn` — it never goes through the bash classifier and never runs `ls-files`. The only in-repo user of `git ls-files` is the rename-audit skill prose. The entry itself is harmless (genuinely read-only), but the comment attributes it to a mechanism that does not exist, which will mislead future maintenance of this allowlist.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.ts:96
  Suggestion: Reword the comment to a generic "pure index/worktree read (e.g. used by the rename-audit skill)" or drop the snapshot attribution.
  Cross-phase: false

## Notes

- [NOTE] `Subcommand.pipedTo` (`classify-bash-command.ts:351`) is declared but never assigned or read anywhere in the package — `detectPipeToShell` uses `follower` instead. Dead field; possibly pre-dates this diff, but the file is in scope. Safe to delete.
- [NOTE] The explicit `git rev-parse --verify <tree>^{tree}` pre-check (`luca-snapshot-diff.ts:253-266`) is redundant with the subsequent `git diff` call, which would fail on a non-resolvable tree and land in the same `ambiguous` branch. Its only value is a cleaner reason string; ~14 lines could be dropped if that trade-off is acceptable. Not blocking — the current form is arguably better DX.
- [NOTE] `isLucaPath` (`luca-snapshot-diff.ts:158-160`): the `path === '.luca'` equality arm can never match — `git diff --name-only` emits file paths, never a bare directory. One-line defensive dead branch; harmless.
- [NOTE] The G-ARCH-001 accepted-limitation prose in `phase-execute/index.ts:892` says the empty cite set "returns `ambiguous`, meaning this path always takes the full re-review". Slightly inaccurate: the `empty` verdict (no non-`.luca` changed paths) is checked before the empty-cite fail-safe (`luca-snapshot-diff.ts:343-357`), so a no-op fix round on this path would still skip. Behavior is fine (the skip is provably safe when nothing changed); only the prose overstates the limitation. The post-skip routing block on this path (lines 894-898) is therefore reachable and not dead — no simplification action needed beyond the wording.
- [NOTE] The 40/64-hex validation of `git write-tree` output (`luca-snapshot-create.ts:120-126`) is belt-and-braces — write-tree with exit 0 always emits a sha. Cheap and self-documenting; fine to keep.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 2
  NOTE_COUNT: 5
  CROSS_PHASE_COUNT: 0
